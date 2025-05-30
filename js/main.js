import initAndroidAR from './ar-android.js';
import initIosFallback from './ar-ios-fallback.js';

async function boot() {
  const btn = document.getElementById('enter-ar-btn');

  // Detect WebXR support
  const hasWebXR = navigator.xr
      && await navigator.xr.isSessionSupported('immersive-ar');

  if (hasWebXR) {
    // Android path
    btn.style.display = 'block';
    btn.addEventListener('click', () => {
      btn.style.display = 'none';    // hide once tapped
      initAndroidAR();
    });
  } else {
    // iOS path (Quick Look)
    btn.style.display = 'block';
    btn.innerText = 'Place in AR';
    btn.addEventListener('click', () => {
      btn.style.display = 'none';
      initIosFallback();
    });
  }
}

window.addEventListener('load', boot);
