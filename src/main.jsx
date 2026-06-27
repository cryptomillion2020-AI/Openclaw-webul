import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './pages.css';
import './openclaw-pro-overrides.css';
import './theme/pass3-tokens.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
