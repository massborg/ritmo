import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import App from './App';
import { initNative } from './native';
import { reloadOnce } from './lib/chunks';
import { initErrorTracking } from './lib/errors';

initNative();
void initErrorTracking();

// A file from an older deploy failed to preload: reload once to get the new version
window.addEventListener('vite:preloadError', (e) => { if (reloadOnce()) e.preventDefault(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
