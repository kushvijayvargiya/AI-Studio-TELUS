import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ToastProvider } from './components/ui/Toast';
import { PrivacyProvider } from './contexts/PrivacyContext';
import { ErrorBoundary } from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <PrivacyProvider>
          <App />
        </PrivacyProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
