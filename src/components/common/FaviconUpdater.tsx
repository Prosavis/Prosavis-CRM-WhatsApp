import { useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';

const FAVICON_LIGHT = '/assets/icons/iconoProsavisClean.png';
const FAVICON_DARK = '/assets/icons/iconProsavisNaranjaClean.png';

export function FaviconUpdater() {
  const { mode } = useTheme();

  useEffect(() => {
    const favicon = document.getElementById('favicon') as HTMLLinkElement | null;
    if (favicon) {
      favicon.href = mode === 'dark' ? FAVICON_DARK : FAVICON_LIGHT;
    }
  }, [mode]);

  return null;
}
