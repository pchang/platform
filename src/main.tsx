import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@patternfly/react-core/dist/styles/base.css';
import { App } from './App';
import { applyMode, loadSetting, resolveMode } from './appearance/appearance';
import { AppearanceProvider } from './appearance/AppearanceProvider';

// Set the mode before the first render, so the page never flashes the wrong one.
applyMode(resolveMode(loadSetting(), new Date()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  </StrictMode>,
);
