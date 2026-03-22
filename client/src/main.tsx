import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Enable cordova background mode securely if in a Capacitor container
const initBackgroundMode = () => {
  const cordova = (window as any).cordova;
  if (cordova?.plugins?.backgroundMode) {
    cordova.plugins.backgroundMode.setDefaults({
        title: 'Noni Music',
        text: 'Music is playing in the background',
        hidden: false,
        silent: true
    });
    cordova.plugins.backgroundMode.enable();
    cordova.plugins.backgroundMode.on('activate', () => {
       cordova.plugins.backgroundMode.disableWebViewOptimizations();
    });
  }
};

if ((window as any).cordova) {
  initBackgroundMode();
} else {
  document.addEventListener('deviceready', initBackgroundMode, false);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
