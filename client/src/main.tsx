import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Enable cordova background mode if in a Capacitor/Cordova native container
document.addEventListener('deviceready', () => {
  const cordova = (window as any).cordova;
  if (cordova?.plugins?.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
    cordova.plugins.backgroundMode.on('activate', () => {
       cordova.plugins.backgroundMode.disableWebViewOptimizations();
    });
  }
}, false);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
