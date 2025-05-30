import * as THREE from '../libs/three.module.js';

export default async function initAndroidAR() {
  // Renderer setup
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Scene & camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );
  scene.add(camera);

  // Light for shading
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // Load tile texture
  const loader = new THREE.TextureLoader();
  const texture = loader.load('../assets/textures/tile3.glb', () => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
  });

  const planeMeshes = new Map();
  const referenceSpace = await renderer.xr.getReferenceSpace();

  // Start AR session with plane detection
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test', 'plane-detection']
  });
  renderer.xr.setSession(session);

  renderer.setAnimationLoop((time, frame) => {
    const detectedPlanes = frame.worldInformation.detectedPlanes;
    if (detectedPlanes) {
      detectedPlanes.forEach(xrPlane => {
        let mesh = planeMeshes.get(xrPlane);
        if (!mesh) {
          // Build geometry from plane polygon
          const verts = [];
          for (let i = 0; i < xrPlane.polygon.length; i += 3) {
            verts.push(
              xrPlane.polygon[i],
              xrPlane.polygon[i + 1],
              xrPlane.polygon[i + 2]
            );
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(verts, 3)
          );
          geometry.computeVertexNormals();

          const material = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide
          });

          mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
          planeMeshes.set(xrPlane, mesh);
        }

        // Update mesh pose each frame
        const pose = frame.getPose(
          xrPlane.planeSpace,
          referenceSpace
        );
        mesh.position.copy(pose.transform.position);
        mesh.quaternion.copy(pose.transform.orientation);
      });
    }
    renderer.render(scene, camera);
  });
}
