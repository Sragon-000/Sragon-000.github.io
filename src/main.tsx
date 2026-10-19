import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './app/styles.css';
import './app/aurora.css';

// Static sharing pages carry crawler metadata, then enter the same hash-routed app.
const initialRoute = document.getElementById('root')?.dataset.initialRoute;
if (initialRoute && !location.hash)
  history.replaceState(null, '', `${import.meta.env.BASE_URL}${initialRoute}`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
