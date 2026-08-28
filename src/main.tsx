import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from '@/App';
import { CrmToaster } from '@/components/common/CrmToaster';
import { AuthProvider } from '@/context/AuthContext';
import { ProsavisThemeProvider } from '@/context/ThemeContext';
import { FaviconUpdater } from '@/components/common/FaviconUpdater';
import './index.css';
import './styles/sileo-overrides.css';

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
    <ProsavisThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <FaviconUpdater />
            <App />
            <CrmToaster />
            {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
            <Analytics />
            <SpeedInsights />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ProsavisThemeProvider>
  </StrictMode>,
);
