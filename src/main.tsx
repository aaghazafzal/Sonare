import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/manrope';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/work-sans';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/base.css';
import './styles/app.css';
import './styles/instruments.css';
import './styles/studio.css';
import './styles/studio-fl.css';
import './styles/settings.css';
import './styles/bigpiano.css';
import './styles/mobile.css';
import { applySettings, useSettings } from './theme/settings';
import { installMobileDetection } from './lib/useMobile';
import App from './App';

// apply the saved theme before first paint to avoid a flash of the default colours
applySettings(useSettings.getState());
installMobileDetection();

if (import.meta.env.DEV) {
  // handles for poking at the running app from the devtools console
  void Promise.all([import('./studio/store'), import('./studio/playback'), import('./audio/engine'), import('./audio/live')]).then(
    ([store, playback, engine, live]) => {
      (window as unknown as Record<string, unknown>).__sonare = { store, playback, engine, live };
    },
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
