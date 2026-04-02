import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app'; // Import the App component from App.js

// Find the root element in your HTML
const rootElement = document.getElementById('root');

// Create a root and render the App component
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);