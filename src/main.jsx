import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './pages.css';
import './openclaw-pro-overrides.css';
import './phase4-tokens.css';

// Gate-6 content-type fix: inert build marker to force a fresh content-hashed bundle so the
// Workers Static Assets uploader re-uploads a TYPED object (defeats wrangler hash-dedup that
// otherwise skips byte-identical assets and leaves the prior typeless object in place).
const GATE6_BUILD_ID = 'gate6-ct-fix-20260911';
if (typeof window !== 'undefined') window.__OPENCLAW_BUILD__ = GATE6_BUILD_ID;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
