import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { trackKeyboard } from './lib/keyboard';
import { trackUiScale } from './lib/uiScale';
import { StoreProvider } from './state/store';

// Lift bottom cards and sheets above the on-screen keyboard (lib/keyboard.ts).
trackKeyboard();
// Grow the whole UI on big screens (lib/uiScale.ts).
trackUiScale();

// Safari pinches with its own gesture events, past touch-action (see styles.css).
document.addEventListener('gesturestart', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
