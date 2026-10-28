import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { trackVisits } from './lib/analytics';
import { trackKeyboard } from './lib/keyboard';
import { trackUiScale } from './lib/uiScale';
import { StoreProvider } from './state/store';

// The admin page (#admin) stands apart from the game, loaded only when opened.
const AdminPage = lazy(() => import('./admin/AdminPage'));

function Root() {
  const [admin, setAdmin] = useState(() => window.location.hash === '#admin');
  useEffect(() => {
    const on = () => setAdmin(window.location.hash === '#admin');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  if (admin) {
    return (
      <Suspense fallback={null}>
        <AdminPage />
      </Suspense>
    );
  }
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}

// Lift bottom cards and sheets above the on-screen keyboard (lib/keyboard.ts).
trackKeyboard();
// Grow the whole UI on big screens (lib/uiScale.ts).
trackUiScale();

// Visits, on the live site only (lib/analytics.ts).
trackVisits();

// Safari pinches with its own gesture events, past touch-action (see styles.css).
document.addEventListener('gesturestart', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
