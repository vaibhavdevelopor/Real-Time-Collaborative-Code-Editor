/**
 * App.jsx -- Root component
 *
 * Sets up React Router with two routes:
 *  /           -> Home.jsx  (create or join a room)
 *  /room/:roomId -> Room.jsx  (collaborative editor)
 *
 * Also applies global CSS resets so the editor fills the full viewport
 * with no browser default margins or scrollbars.
 *
 * Install dependencies (if not already done):
 *  cd client
 *  npm install react-router-dom
 */

import { useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Room from './pages/Room';

// ----------------------------------------------------------------
// Global styles -- injected once into document.head
// Resets browser defaults so Monaco fills the full viewport.
// ----------------------------------------------------------------

let _globalStylesInjected = false;

function injectGlobalStyles() {
  if (_globalStylesInjected || typeof document === 'undefined') return;
  _globalStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'app-global-styles';
  style.textContent = `
    *, *::before, *::after {
      box-sizing: border-box;
    }

    html, body {
      margin:   0;
      padding:  0;
      height:   100%;
      width:    100%;
      overflow: auto;
      background: #0F172A;
      color: #E2E8F0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
                   Roboto, Oxygen, Ubuntu, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    #root {
      height:   100%;
      width:    100%;
      overflow: hidden;
    }

    /* Scrollbar styling for chat + output panels */
    ::-webkit-scrollbar {
      width:  6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #0F172A;
    }
    ::-webkit-scrollbar-thumb {
      background:    #334155;
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #475569;
    }

    /* Remove default button styles */
    button {
      font-family: inherit;
    }

    /* Visible focus ring for keyboard users (a11y) */
    :focus-visible {
      outline: 2px solid #6366F1;
      outline-offset: 2px;
    }
    /* Hide focus ring for mouse/pointer interactions */
    :focus:not(:focus-visible) {
      outline: none;
    }

    /* Fira Code for monospace elements (Monaco loads its own) */
    code, pre, .mono {
      font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    }
  `;
  document.head.appendChild(style);
}

// ----------------------------------------------------------------
// App
// ----------------------------------------------------------------

export default function App() {
  // Inject global styles before first paint (avoids FOUC)
  useLayoutEffect(() => { injectGlobalStyles(); }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page -- create or join a room */}
        <Route path="/" element={<Home />} />

        {/* Collaborative editor room */}
        <Route path="/room/:roomId" element={<Room />} />

        {/* Catch-all -- redirect unknown routes to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}