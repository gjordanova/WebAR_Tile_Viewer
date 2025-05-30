export default function initIosFallback() {
  // Inject <model-viewer> for Quick Look
  const script = document.createElement('script');
  script.type = 'module';
  script.src = '../libs/model-viewer.min.js';
  document.head.appendChild(script);

  script.onload = () => {
    const mv = document.createElement('model-viewer');
    mv.src = 'assets/models/tile-plane.glb';
    mv.iosSrc = 'assets/models/tile-plane.usdz';
    mv.setAttribute('ar', '');
    mv.setAttribute('ar-placement', 'floor wall');
    mv.setAttribute('ar-modes', 'scene-viewer quick-look');
    mv.style.width = '100%';
    mv.style.height = '100%';

    const btn = document.createElement('button');
    btn.slot = 'ar-button';
    btn.innerText = 'Place Tiles in AR';
    mv.appendChild(btn);

    document.body.appendChild(mv);
  };
}
