/**
 * main.jsx -- React application entry point
 *
 * Renders the App component into the #root div.
 * This is the file referenced by index.html's script tag.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
