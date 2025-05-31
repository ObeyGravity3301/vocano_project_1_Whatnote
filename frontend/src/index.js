import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // 如果没有index.css可以先不管
import { pdfjs } from 'react-pdf';
import { SessionProvider } from './components/SessionManager';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>
);