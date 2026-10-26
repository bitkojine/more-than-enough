/* One reusable WebGL surface, composited into the existing 2D world renderer.
 * Geometry is authored once (rig-model.js). Bones/IK own motion; there is no
 * frame atlas. */
import * as T from '../../vendor/three/three.module.js';
import {createRigModel} from './rig-model.js';
import {findClips} from './rig-clips.js';
// The layout surface is 320 x 448 px; the top 64 px make room for Wiki on the hood.
// A clip check costs about 25 ms, so the developer build samples frames.
const CLIP_EVERY=60;
const W=320,H=448,TOP=1.375+(H-384)/384*2.75;
// checkClips: a developer build proves every few drawn frames that no two
// solid parts pass through each other, and throws (a reported problem) if any do.
export function createRiggedCharacter({checkClips=false}={}){
 const canvas=document.createElement('canvas');
 const context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
 if(!context)return null;
 const renderer=new T.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setSize(W,H,false);renderer.setPixelRatio(1);renderer.setClearColor(0,0);
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
 const rig=createRigModel(),scene=rig.scene;
 const camera=new T.OrthographicCamera(-1.146,1.146,TOP,-1.375,.1,30);
 camera.position.set(0,2.8,7);camera.lookAt(0,1.0,0);camera.updateMatrixWorld();
 // A single screen-space contour surrounds the completed figure, including
 // fingers, wraps, soles and real carried equipment. It does not depend on
 // separate per-mesh hulls or change width as a curved surface turns away.
 const silhouette=new T.WebGLRenderTarget(W,H,{samples:4,depthBuffer:true});
 silhouette.texture.colorSpace=T.SRGBColorSpace;
 const outlineScene=new T.Scene(),outlineCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const outlineMaterial=new T.ShaderMaterial({
  uniforms:{image:{value:silhouette.texture},step:{value:new T.Vector2(4/W,4/H)},ink:{value:new T.Color(0x1d1712)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', // i18n-ok: GPU shader source, not player text.
  fragmentShader:`uniform sampler2D image;uniform vec2 step;uniform vec3 ink;varying vec2 vUv; // i18n-ok: GPU shader source, not player text.
   void main(){vec4 source=texture2D(image,vUv);float edge=source.a;
    for(int i=0;i<16;i++){float a=float(i)*6.28318530718/16.;vec2 d=vec2(cos(a),sin(a))*step;edge=max(edge,max(texture2D(image,vUv+d).a,texture2D(image,vUv+d*.5).a));}
    float alpha=source.a+edge*(1.-source.a);
    vec3 color=(source.rgb+ink*edge*(1.-source.a))/max(alpha,.00001);
    gl_FragColor=vec4(color,alpha);
    #include <colorspace_fragment>
    #include <premultiplied_alpha_fragment>
   }`,
  transparent:true,premultipliedAlpha:true,depthTest:false,depthWrite:false
 });
 const outlineQuad=new T.Mesh(new T.PlaneGeometry(2,2),outlineMaterial);outlineScene.add(outlineQuad);
 // Keep budgets honest across both passes, rather than reporting only the quad.
 renderer.info.autoReset=false;
 const anchor=new T.Vector3(0,0,0).project(camera);
 const ax=(anchor.x+1)*.5*W,ay=(1-anchor.y)*.5*H;
 // Zoomed in, the surface renders at more pixels so Mica stays sharp: `res`
 // times the 320x448 layout, stepped by halves so a pinch doesn't reallocate
 // every frame, and capped so a zoomed-in old phone isn't filling 4 MP.
 // Everything else keeps working in layout pixels.
 const MAX_RES=4;let res=1;
 function fit(device){
  const want=Math.min(MAX_RES,Math.max(1,Math.ceil(device/384*2)/2));
  if(want>res||want<res*.6){res=want;renderer.setSize(W*res,H*res,false);silhouette.setSize(W*res,H*res);}
 }
 let lost=false,renders=0,reused=0,shown=null;canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;});canvas.addEventListener('webglcontextrestored',()=>{lost=false;});
 return {
  draw(ctx,x,y,u,options={}){
   if(lost)return null;
   const m=ctx.getTransform();fit(u*1.22*Math.hypot(m.a,m.b));
   // The same pose again in this frame (Mica seen faintly through a wall in
   // front) reuses the picture just rendered: both passes are the GPU's
   // biggest job in a frame, and doing them twice is what warms a phone.
   const key=res+JSON.stringify(options);
   if(key!==shown){
    rig.pose(options);
    if(checkClips&&renders%CLIP_EVERY===0){const clips=findClips(rig);if(clips.length)throw new Error('Mica clips: '+clips.map(c=>c.a+'/'+c.b+' at '+c.at.join(',')).join('; ')+' in '+JSON.stringify(options));} // i18n-ok: developer-only fault text.
    renderer.info.reset();renderer.setRenderTarget(silhouette);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(outlineScene,outlineCamera);renders++;
    // The picture lasts only until this frame is shown, so forget it after.
    shown=key;queueMicrotask(()=>{shown=null;});
   }
   else reused++;
   const scale=u*1.22/384;ctx.drawImage(canvas,x-ax*scale,y-ay*scale,W*scale,H*scale);
   const project=b=>{const p=b.project(camera);return {x:x+((p.x+1)*.5*W-ax)*scale,y:y+((1-p.y)*.5*H-ay)*scale};};
   const marks=rig.marks(),h=project(marks.head),hand=project(marks.hand),w=marks.wiki&&project(marks.wiki);
   return {x:h.x,top:h.y,foot:y,handsX:hand.x,hands:hand.y,wiki:w&&{x:w.x,y:w.y,r:u*.2}};
  },
  inspect:()=>rig.inspect(),
  model:rig,
  get stats(){return {renders,reused,bones:rig.bones,skinnedMeshes:5,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,res,lost};},
  dispose(){rig.dispose();silhouette.dispose();outlineQuad.geometry.dispose();outlineMaterial.dispose();renderer.dispose();}
 };
}
