/* Canonical pickaxe asset. The hand grip is local (0,0,0); +Y points to
 * the head. World equipment and baked icons use this exact geometry. */
import * as T from '../../vendor/three/three.module.js';
export const PICKAXE_MODEL_VERSION=1;
const ink=0x1d1712,fibre=0xd3cfb9,stone=0x9aa096,steel=0x809295;
const heads=[
 [[-.27,.48],[-.16,.57],[.07,.56],[.28,.43],[.06,.46],[-.11,.44]],
 [[-.31,.46],[-.19,.58],[.07,.58],[.32,.43],[.09,.46],[-.09,.44],[-.23,.40]],
 [[-.32,.43],[-.27,.58],[-.10,.60],[.13,.55],[.34,.40],[.10,.45],[-.10,.47],[-.26,.40]],
 [[-.32,.43],[-.21,.57],[-.02,.61],[.17,.54],[.35,.38],[.12,.45],[-.04,.50],[-.19,.48]],
 [[-.34,.43],[-.25,.59],[-.08,.61],[.16,.56],[.36,.39],[.11,.46],[-.08,.50],[-.20,.45],[-.25,.38]],
 [[-.35,.39],[-.29,.58],[-.10,.63],[.15,.58],[.38,.37],[.15,.44],[-.07,.50],[-.17,.47],[-.21,.36],[-.26,.47]]
];
export function pickaxeTier(level){return Math.max(0,Math.min(6,Math.floor(Number(level)||0)));}
export function createPickaxeModel(level){
 const tier=pickaxeTier(level);if(!tier)return null;
 const parts=[],add=(g,color)=>{parts.push({g,color:new T.Color(color)});};
 function bar(radius,length,y,color,x=0,z=0){const g=new T.CylinderGeometry(radius,radius,length,8);g.translate(x,y,z);add(g,color);}
 function plate(points,depth,z,color){const shape=new T.Shape();shape.moveTo(...points[0]);for(const p of points.slice(1))shape.lineTo(...p);shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1,curveSegments:1});g.translate(0,0,z);add(g,color);}
 // A laminated mineral/fibre shaft, never timber. Later metal frames and
 // collars are visible construction changes, not recoloured abstract buffs.
 bar(tier>=4?.026:.024,.68,.17,tier>=4?steel:fibre);
 bar(.033,.18,-.025,0x66705b);
 for(let i=0;i<4;i++)bar(.035,.012,-.09+i*.045,fibre);
 plate(heads[tier-1],.08,-.04,tier>=4?steel:stone);
 const facet=heads[tier-1].slice(0,4);plate(facet,.002,.041,tier>=4?0xbac6c0:0xc7ccc4);
 // Binding and a real socket holding the head onto the shaft.
 if(tier<4){for(let i=0;i<tier+1;i++)bar(.043,.018,.445+i*.027,fibre);}
 else{
  plate([[-.055,.43],[-.055,.57],[.055,.57],[.055,.43]],.11,-.055,0x46565b);
  const bolt=new T.CylinderGeometry(.018,.018,.12,8);bolt.rotateX(Math.PI/2);bolt.translate(0,.50,0);add(bolt,fibre);
 }
 if(tier>=3)bar(.043,.035,-.14,tier>=4?steel:stone);
 if(tier>=5){
  plate([[-.19,.51],[-.16,.55],[.12,.53],[.25,.45],[.12,.48]],.004,.043,0x46565b);
  bar(.043,.03,.29,steel);bar(.043,.03,.35,steel);
 }
 if(tier===6){
  plate([[-.07,.39],[-.07,.46],[.07,.46],[.07,.39]],.10,-.05,0x46565b);
  plate([[-.28,.55],[-.12,.60],[.09,.57],[-.09,.55]],.003,.049,0xeeeadf);
 }
 // Merge parts into one flat vertex-colour draw call, regardless of tier. No
 // ink shell: an inverted hull leaks ink between parts and breaks at sharp
 // corners. Held, Mica's figure pass draws the outer contour; baked icons
 // get the same single silhouette in renderPickaxeIcons. Geometry is built
 // only when this tier is first used.
 const positions=[],normals=[],colors=[];
 for(const {g,color}of parts){const flat=g.index?g.toNonIndexed():g;const p=flat.attributes.position,n=flat.attributes.normal;for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(color.r,color.g,color.b);}if(flat!==g)flat.dispose();g.dispose();}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 const fill=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false});
 const root=new T.Group();root.name='pickaxe-'+tier;root.add(new T.Mesh(geometry,fill));
 return {root,tier,grip:new T.Vector3(),dispose(){geometry.dispose();fill.dispose();}};
}
// Offline/browser-authoring path only. The shipped UI uses the baked images;
// it does not create a WebGL renderer for each inventory icon.
export function renderPickaxeIcons(){
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true});renderer.setSize(192,192,false);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-.53,.53,.53,-.53,.1,10);camera.position.set(0,0,4);camera.lookAt(0,0,0);
 // One ink silhouette around the whole tool: the flat render is stamped in
 // ink in a ring of offsets underneath itself, like the figure pass on Mica.
 const out=document.createElement('canvas');out.width=out.height=192;const g=out.getContext('2d'),stamp=document.createElement('canvas');stamp.width=stamp.height=192;const s=stamp.getContext('2d');
 const icons=[];for(let tier=1;tier<=6;tier++){
  const asset=createPickaxeModel(tier);scene.add(asset.root);asset.root.rotation.set(0,-.3,-.48);asset.root.position.set(-.08,-.17,0);
  renderer.render(scene,camera);
  s.clearRect(0,0,192,192);s.globalCompositeOperation='source-over';s.drawImage(renderer.domElement,0,0);s.globalCompositeOperation='source-in';s.fillStyle='#'+new T.Color(ink).getHexString();s.fillRect(0,0,192,192);
  g.clearRect(0,0,192,192);for(let i=0;i<16;i++){const a=i/16*Math.PI*2;g.drawImage(stamp,Math.cos(a)*4,Math.sin(a)*4);}g.drawImage(renderer.domElement,0,0);
  icons.push(out.toDataURL('image/png'));scene.remove(asset.root);asset.dispose();
 }
 renderer.dispose();return icons;
}
