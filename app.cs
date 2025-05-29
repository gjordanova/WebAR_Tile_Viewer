// app.js
import * as THREE from 'three';
import { XRButton } from 'three/examples/jsm/webxr/XRButton.js';

let camera, scene, renderer;
let reticle, tileMesh, hitTestSource = null, hitTestSourceRequested = false;
let depthUniformName = 'depthMap';

init();
animate();

function init() {
  // scene + camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth/windows.innerHeight, 0.01, 20);

  // light
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // AR-button with depth-sensing
  document.body.appendChild( XRButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['depth-sensing'],
    depthSensing: {
      usagePreference: ['cpu-optimized'],
      dataFormatPreference: ['luminance-alpha']
    }
  }) );

  // reticle for hit test
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // load your tile texture + setup material with occlusion
  const texture = new THREE.TextureLoader().load('floor_tile.jpg');
  const tileMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  tileMaterial.onBeforeCompile = shader => {
    shader.uniforms[depthUniformName] = { value: null };
    shader.uniforms.resolution = { value: new THREE.Vector2(window.innerWidth, window.innerHeight) };

    shader.fragmentShader = `
      uniform sampler2D ${depthUniformName};
      uniform vec2 resolution;
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      /gl_FragColor = vec4\( outgoingLight, diffuseColor\.a \);/,
      `
        vec2 uv = gl_FragCoord.xy / resolution;
        float sceneDepth = texture2D(${depthUniformName}, uv).r;
        if (gl_FragCoord.z > sceneDepth + 0.02) discard;
        gl_FragColor = vec4(outgoingLight, diffuseColor.a);
      `
    );
    tileMaterial.userData.shader = shader;
  };

  // on tap/place: create the tile mesh once
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

function onWindowResize(){
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
  if (frame) {
    const session = renderer.xr.getSession();

    // --- setup hit test source once
    if (!hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then(refSpace => {
        session.requestHitTestSource({ space: refSpace })
          .then(source => hitTestSource = source);
      });
      session.addEventListener('end', () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });
      hitTestSourceRequested = true;
    }

    // --- perform hit test
    if (hitTestSource) {
      const refSpace = renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length) {
        const hitPose = hits[0].getPose(refSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(hitPose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }

    // --- depth sensing & upload to material
    const view = frame.views[0]; // assume single view
    const depthInfo = frame.getDepthInformation(view);
    if (depthInfo && tileMesh) {
      // read raw data
      const width = depthInfo.width, height = depthInfo.height;
      const size = width * height * 2; // luminance+alpha
      const buffer = new Uint16Array(size);
      depthInfo.data.copyTo(buffer);

      // create/update Three.js texture
      const depthTex = new THREE.DataTexture(buffer, width, height, THREE.LuminanceAlphaFormat, THREE.UnsignedShortType);
      depthTex.needsUpdate = true;

      // assign uniform
      const mat = tileMesh.material;
      mat.userData.shader.uniforms[depthUniformName].value = depthTex;
      mat.userData.shader.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
  }

  renderer.render(scene, camera);
}
