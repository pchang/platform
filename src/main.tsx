import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@patternfly/react-core/dist/styles/base.css';
// PatternFly's chart tokens, in light and dark mode.
import '@patternfly/patternfly/patternfly-charts.css';
// Inter, bundled: the Latin and Latin Extended sets in the weights PatternFly uses (design system spec 1, Visual style).
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-ext-700.css';
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
