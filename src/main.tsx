import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        registration.update().catch(() => {});
      })
      .catch(() => {
        // Service worker registration skipped if unsupported in current preview context
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
