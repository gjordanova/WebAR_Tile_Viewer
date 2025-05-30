import initAndroidAR from './ar-android.js';
import initIosFallback from './ar-ios-fallback.js';

async function boot() {
  const supported =
    navigator.xr && await navigator.xr.isSessionSupported('immersive-ar');

  if (supported) {
    initAndroidAR();
  } else {
    initIosFallback();
  }
}

window.addEventListener('load', boot);
