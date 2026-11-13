import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@patternfly/react-core/dist/styles/base.css';
// PatternFly's chart tokens, in light and dark mode.
import '@patternfly/patternfly/patternfly-charts.css';
// The page's own base colors and font, after PatternFly's (design system spec 4.2).
import './app.css';
import { App } from './App';
import { applyMode, loadSetting, resolveMode } from './appearance/appearance';
import { AppearanceProvider } from './appearance/AppearanceProvider';
import { PrincipalProvider } from './principal/PrincipalProvider';

// Set the mode before the first render, so the page never flashes the wrong one.
applyMode(resolveMode(loadSetting(), new Date()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppearanceProvider>
      <PrincipalProvider fallback={null}>
        <App />
      </PrincipalProvider>
    </AppearanceProvider>
  </StrictMode>,
);
