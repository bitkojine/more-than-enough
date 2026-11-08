/* One reusable WebGL surface, composited into the existing 2D world renderer.
 * Geometry is authored once (rig-model.js). Bones/IK own motion; there is no
 * frame atlas. */
import * as T from '../../vendor/three/three.module.js';
import { createRigModel } from './rig-model.js';
import { findClips } from './rig-clips.js';
import { MITTENS } from './rig-limbs.js';
import { holdsPicture, poseShape, stillPose } from './rig-hold.js';
// The layout surface is 320 x 448 px; the top 64 px make room for Wiki on the hood.
// A clip check costs about 25 ms, so the developer build samples frames.
const CLIP_EVERY = 60;
const YOU = 'you',
  HANDS_ONLY = 'hands',
  PORTRAIT = 'portrait';
// A badge's face: still, facing you, nothing in hand.
const PORTRAIT_POSE = Object.freeze({ facing: { x: 0, y: 1 }, steady: true });
// Other players: at most this many rendered live in one frame (the rest show
// their last picture), and a still one is redrawn only this often.
const FRIEND_RENDERS = 3;
const OTHER_IDLE_MS = 250;
// A player out of view this long gives back their picture's memory.
const FORGET_MS = 10000;
// A tile's width on screen draws the 384 px layout height this many times over.
const SCALE = 1.22;
const W = 320,
  H = 448,
  TOP = 1.375 + ((H - 384) / 384) * 2.75;
// The camera the rig is seen through, the same fixed lean as the world's.
export function rigCamera() {
  const camera = new T.OrthographicCamera(-1.146, 1.146, TOP, -1.375, 0.1, 30);
  camera.position.set(0, 2.8, 7);
  camera.lookAt(0, 1.0, 0);
  camera.updateMatrixWorld();
  return camera;
}

// How many tiles tall a rig point `world` stands above the feet on screen
// (a figure is drawn `SCALE` x its 384 px layout height per tile).
export function tilesAboveFeet(world, camera = rigCamera()) {
  const feet = new T.Vector3(0, 0, 0).project(camera),
    p = world.clone().project(camera);
  return (((p.y - feet.y) * 0.5 * H) / 384) * SCALE;
}

// checkClips: a developer build proves every few drawn frames that no two
// solid parts pass through each other, and throws (a reported problem) if any do.
export function createRiggedCharacter({ checkClips = false } = {}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
    // Keeps the last picture between frames, so a still Mica can be shown
    // again without rendering (rig-hold.js).
    preserveDrawingBuffer: true
  });
  if (!context) return null;
  const renderer = new T.WebGLRenderer({
    canvas,
    context,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power'
  });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  const rig = createRigModel(),
    scene = rig.scene;
  const camera = rigCamera();
  // A single screen-space contour surrounds the completed figure, including
  // fingers, wraps, soles and real carried equipment. It does not depend on
  // separate per-mesh hulls or change width as a curved surface turns away.
  const silhouette = new T.WebGLRenderTarget(W, H, { samples: 4, depthBuffer: true });
  silhouette.texture.colorSpace = T.SRGBColorSpace;
  const outlineScene = new T.Scene(),
    outlineCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const outlineMaterial = new T.ShaderMaterial({
    uniforms: {
      image: { value: silhouette.texture },
      step: { value: new T.Vector2(4 / W, 4 / H) },
      ink: { value: new T.Color(0x1d1712) }
    },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', // i18n-ok: GPU shader source, not player text.
    fragmentShader: `uniform sampler2D image;uniform vec2 step;uniform vec3 ink;varying vec2 vUv; // i18n-ok: GPU shader source, not player text.
   void main(){vec4 source=texture2D(image,vUv);float edge=source.a;
    for(int i=0;i<16;i++){float a=float(i)*6.28318530718/16.;vec2 d=vec2(cos(a),sin(a))*step;edge=max(edge,max(texture2D(image,vUv+d).a,texture2D(image,vUv+d*.5).a));}
    float alpha=source.a+edge*(1.-source.a);
    vec3 color=(source.rgb+ink*edge*(1.-source.a))/max(alpha,.00001);
    gl_FragColor=vec4(color,alpha);
    #include <colorspace_fragment>
    #include <premultiplied_alpha_fragment>
   }`,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false
  });
  const outlineQuad = new T.Mesh(new T.PlaneGeometry(2, 2), outlineMaterial);
  outlineScene.add(outlineQuad);
  // Keep budgets honest across both passes, rather than reporting only the quad.
  renderer.info.autoReset = false;
  const anchor = new T.Vector3(0, 0, 0).project(camera);
  const ax = (anchor.x + 1) * 0.5 * W,
    ay = (1 - anchor.y) * 0.5 * H;
  // Zoomed in, the surface renders at more pixels so Mica stays sharp: `res`
  // times the 320x448 layout, stepped by halves so a pinch doesn't reallocate
  // every frame, and capped so a zoomed-in old phone isn't filling 4 MP.
  // Everything else keeps working in layout pixels.
  const MAX_RES = 4;
  let res = 1;
  function fit(device) {
    const want = Math.min(MAX_RES, Math.max(1, Math.ceil((device / 384) * 2) / 2));
    if (want > res || want < res * 0.6) {
      res = want;
      renderer.setSize(W * res, H * res, false);
      silhouette.setSize(W * res, H * res);
    }
  }
  let lost = false,
    renders = 0,
    reused = 0,
    held = 0,
    snapped = 0,
    shown = null, // the pose the WebGL canvas holds this frame
    holds = null, // whose picture the WebGL canvas holds
    heldShape = null,
    renderedAt = 0,
    yourDirection = 's',
    friendRenders = 0, // other players rendered live this frame
    frameOpen = false;
  // Everyone else (other players, bots, sleepers) shares this one rig: each
  // keeps the way they face and a copy of their last picture, so a still
  // player costs only a copy, and at most FRIEND_RENDERS move live a frame.
  const others = new Map();
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
  });
  const startFrame = () => {
    if (frameOpen) return;
    frameOpen = true;
    queueMicrotask(() => {
      shown = null;
      friendRenders = 0;
      frameOpen = false;
      // Pictures of players no longer in view are let go.
      const now = performance.now();
      for (const [id, o] of others)
        if (now - o.seen > FORGET_MS) {
          others.delete(id);
          posed.delete(id);
        }
    });
  };
  // Poses and renders both passes; the picture is then on `canvas`.
  function render(options, id) {
    rig.pose(options);
    if (checkClips && renders % CLIP_EVERY === 0) {
      const clips = findClips(rig);
      if (clips.length)
        throw new Error(
          // i18n-ok: developer-only fault text.
          'Mica clips: ' +
            clips.map((c) => c.a + '/' + c.b + ' at ' + c.at.join(',')).join('; ') +
            ' in ' +
            JSON.stringify(options)
        );
    }
    renderer.info.reset();
    renderer.setRenderTarget(silhouette);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(outlineScene, outlineCamera);
    renders++;
    holds = id;
  }
  // The rig's marks, in surface pixels, so a copied picture keeps them.
  function surfaceMarks() {
    const at = (b) => {
      const p = b.project(camera);
      return { x: (p.x + 1) * 0.5 * W - ax, y: (1 - p.y) * 0.5 * H - ay };
    };
    const m = rig.marks();
    return { head: at(m.head), hand: at(m.hand), wiki: m.wiki && at(m.wiki) };
  }
  function place(x, y, u, marks) {
    const scale = (u * SCALE) / 384;
    const to = (p) => ({ x: x + p.x * scale, y: y + p.y * scale });
    const h = to(marks.head),
      hand = to(marks.hand),
      w = marks.wiki && to(marks.wiki);
    return {
      x: h.x,
      top: h.y,
      footX: x,
      foot: y,
      handsX: hand.x,
      hands: hand.y,
      wiki: w && { x: w.x, y: w.y, r: u * 0.2 }
    };
  }
  const blit = (ctx, image, x, y, u) => {
    const scale = (u * SCALE) / 384;
    ctx.drawImage(image, x - ax * scale, y - ay * scale, W * scale, H * scale);
  };
  let yours = null; // your marks, from your last render
  const posed = new Map(); // each figure's last pose, for drawHands
  const portraits = new Map(); // badge faces, by coat colour
  // Someone other than you: their copied picture while it still stands for
  // them, else a live render (within this frame's budget) copied for later.
  function drawOther(ctx, { x, y, u }, options, id) {
    posed.set(id, options);
    let o = others.get(id);
    if (!o) {
      o = { direction: 's', key: null, shape: null, at: -Infinity, image: null, marks: null };
      others.set(id, o);
    }
    const key = res + JSON.stringify(options),
      shape = res + poseShape(options),
      now = performance.now();
    o.seen = now;
    const fresh =
      o.image &&
      (o.key === key ||
        (o.shape === shape && stillPose(options) && now - o.at < OTHER_IDLE_MS) ||
        friendRenders >= FRIEND_RENDERS);
    if (fresh) snapped++;
    else {
      rig.direction = o.direction;
      render(options, id);
      o.direction = rig.direction;
      friendRenders++;
      o.marks = surfaceMarks();
      if (!o.image) o.image = document.createElement('canvas');
      if (o.image.width !== canvas.width || o.image.height !== canvas.height) {
        o.image.width = canvas.width;
        o.image.height = canvas.height;
      }
      const copy = o.image.getContext('2d');
      copy.clearRect(0, 0, o.image.width, o.image.height);
      copy.drawImage(canvas, 0, 0);
      o.key = key;
      o.shape = shape;
      o.at = now;
    }
    blit(ctx, o.image, x, y, u);
    return place(x, y, u, o.marks);
  }
  return {
    // `options.who` names who is drawn: you (the default) or another player.
    draw(ctx, x, y, u, options = {}) {
      const id = options.who ?? YOU;
      if (lost) return null;
      startFrame();
      const m = ctx.getTransform();
      fit(u * SCALE * Math.hypot(m.a, m.b));
      if (id !== YOU) return drawOther(ctx, { x, y, u }, options, id);
      posed.set(YOU, options);
      // The same pose again in this frame (Mica seen faintly through a wall in
      // front) reuses the picture just rendered: both passes are the GPU's
      // biggest job in a frame, and doing them twice is what warms a phone.
      // Standing still, the last picture is held for a few frames
      // (rig-hold.js): only slow idle motion would change.
      const key = res + JSON.stringify(options);
      const now = performance.now();
      if (holds === YOU && key === shown) reused++;
      else if (
        holds === YOU &&
        holdsPicture(heldShape, res + poseShape(options), options, now - renderedAt)
      )
        held++;
      else {
        rig.direction = yourDirection;
        render(options, YOU);
        yourDirection = rig.direction;
        renderedAt = now;
        heldShape = res + poseShape(options);
        shown = key;
        yours = surfaceMarks();
      }
      blit(ctx, canvas, x, y, u);
      return place(x, y, u, yours);
    },
    // Only the mittens of someone just drawn, at `at` (draw's answer), to go
    // over the sign they hold up: the board is drawn after them and in front.
    drawHands(ctx, at, u, id = YOU) {
      const options = posed.get(id);
      if (lost || !options || !at) return;
      rig.direction = id === YOU ? yourDirection : (others.get(id)?.direction ?? 's');
      camera.layers.set(MITTENS);
      try {
        render(options, HANDS_ONLY);
      } finally {
        camera.layers.set(0);
      }
      blit(ctx, canvas, at.footX, at.foot, u);
    },
    // Mica's head and shoulders, facing you, in a coat of `coat`: the face
    // in a player's badge at the screen's edge (overlay.js). Rendered once
    // per colour.
    portrait(coat = null) {
      if (lost) return null;
      if (portraits.has(coat)) return portraits.get(coat);
      rig.direction = 's';
      render({ ...PORTRAIT_POSE, coat }, PORTRAIT);
      const headBone = rig.scene.getObjectByName('head');
      const project = (v) => {
        const p = v.project(camera);
        return { x: (p.x + 1) * 0.5 * canvas.width, y: (1 - p.y) * 0.5 * canvas.height };
      };
      const top = project(rig.marks().head),
        neck = project(headBone.getWorldPosition(new T.Vector3()));
      const side = Math.round((neck.y - top.y) * 2.4),
        cy = (top.y + neck.y) / 2 + side * 0.06;
      const portrait = document.createElement('canvas');
      portrait.width = portrait.height = side;
      portrait
        .getContext('2d')
        .drawImage(canvas, top.x - side / 2, cy - side / 2, side, side, 0, 0, side, side);
      portraits.set(coat, portrait);
      return portrait;
    },
    inspect: () => rig.inspect(),
    model: rig,
    get stats() {
      return {
        renders,
        reused,
        held,
        snapped,
        others: others.size,
        bones: rig.bones,
        skinnedMeshes: 5,
        triangles: renderer.info.render.triangles,
        drawCalls: renderer.info.render.calls,
        res,
        lost
      };
    },
    dispose() {
      rig.dispose();
      silhouette.dispose();
      outlineQuad.geometry.dispose();
      outlineMaterial.dispose();
      renderer.dispose();
    }
  };
}
