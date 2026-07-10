import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import App from '@/App';
import { AuthProvider } from '@/context/AuthContext';
import { ProsavisThemeProvider } from '@/context/ThemeContext';
import { FaviconUpdater } from '@/components/common/FaviconUpdater';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Analytics />
    <ProsavisThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <FaviconUpdater />
            <App />
            <Toaster position="top-right" />
            <Analytics />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ProsavisThemeProvider>
  </StrictMode>,
);
