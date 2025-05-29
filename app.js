// app.js
import * as THREE from 'three';

let camera, scene, renderer;
let reticle, tileMesh;
let hitTestSource = null, hitTestSourceRequested = false;
const DEPTH_UNIFORM = 'depthMap';

init();
animate();

function init() {
  // 1) Scene + camera
  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

  // 2) WebGL renderer + XR enabled
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // 3) Hook your existing AR button
  const arButton = document.getElementById('ar-button');
  arButton.addEventListener('click', () => {
    if (!renderer.xr.getSession()) {
      navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['depth-sensing'],
        depthSensing: {
          usagePreference:    ['cpu-optimized'],
          dataFormatPreference:['luminance-alpha']
        }
      }).then(session => renderer.xr.setSession(session));
    } else {
      renderer.xr.getSession().end();
    }
  });

  // 4) Reticle for hit-test
  const ringGeo = new THREE.RingGeometry(0.15, 0.20, 32).rotateX(-Math.PI/2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  reticle = new THREE.Mesh(ringGeo, ringMat);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // 5) Prepare tile material with occlusion shader injection
  const texture     = new THREE.TextureLoader().load('floor_tile.jpg');
  const tileMaterial= new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  tileMaterial.onBeforeCompile = shader => {
    shader.uniforms[DEPTH_UNIFORM] = { value: null };
    shader.uniforms.resolution       = { value: new THREE.Vector2(window.innerWidth, window.innerHeight) };

    shader.fragmentShader = `
      uniform sampler2D ${DEPTH_UNIFORM};
      uniform vec2 resolution;
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
        /gl_FragColor = vec4\( outgoingLight, diffuseColor\.a \);/,
        `
        vec2 uv = gl_FragCoord.xy / resolution;
        float sceneDepth = texture2D(${DEPTH_UNIFORM}, uv).r;
        if (gl_FragCoord.z > sceneDepth + 0.02) discard;
        gl_FragColor = vec4(outgoingLight, diffuseColor.a);
      `
    );

    tileMaterial.userData.shader = shader;
  };

  // 6) On tap — place the tile plane once at reticle
  renderer.domElement.addEventListener('click', () => {
    if (reticle.visible && !tileMesh) {
      const geo = new THREE.PlaneGeometry(1, 1);
      tileMesh = new THREE.Mesh(geo, tileMaterial);
      tileMesh.rotation.x = -Math.PI/2;
      tileMesh.applyMatrix4(reticle.matrix);
      scene.add(tileMesh);
    }
  });

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render(time, frame) {
  if (frame) {
    const session = renderer.xr.getSession();

    // A) Setup hit-test source once
    if (!hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then(refSpace =>
          session.requestHitTestSource({ space: refSpace }).then(src => hitTestSource = src)
      );
      session.addEventListener('end', () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });
      hitTestSourceRequested = true;
    }

    // B) Perform hit-test each frame
    if (hitTestSource) {
      const refSpace = renderer.xr.getReferenceSpace();
      const hits     = frame.getHitTestResults(hitTestSource);
      if (hits.length) {
        const pose = hits[0].getPose(refSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }

    // C) Depth-sensing occlusion
    if (tileMesh) {
      const view      = frame.views[0];
      const depthInfo = frame.getDepthInformation(view);
      if (depthInfo) {
        const w      = depthInfo.width, h = depthInfo.height;
        const buffer = new Uint16Array(w * h * 2);
        depthInfo.data.copyTo(buffer);

        const depthTex = new THREE.DataTexture(buffer, w, h,
            THREE.LuminanceAlphaFormat, THREE.UnsignedShortType);
        depthTex.needsUpdate = true;

        const sh = tileMesh.material.userData.shader;
        sh.uniforms[DEPTH_UNIFORM].value   = depthTex;
        sh.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
      }
    }
  }

  renderer.render(scene, camera);
}
