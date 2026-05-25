import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { createProSavisTheme } from '@/theme/theme';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ProSavisThemeProviderProps {
  children: React.ReactNode;
}

export const ProSavisThemeProvider: React.FC<ProSavisThemeProviderProps> = ({ children }) => {
  // Inicializar con el tema guardado en localStorage o 'light' por defecto
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const savedMode = localStorage.getItem('prosavis-theme-mode');
    return (savedMode as ThemeMode) || 'light';
  });

  // Actualizar localStorage cuando el modo cambie
  useEffect(() => {
    localStorage.setItem('prosavis-theme-mode', mode);
  }, [mode]);

  const toggleMode = () => {
    setModeState(prevMode => prevMode === 'light' ? 'dark' : 'light');
  };

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
  };

  // Crear el tema dinámicamente basado en el modo actual
  const currentTheme = React.useMemo(() => createProSavisTheme(mode), [mode]);

  const contextValue: ThemeContextType = {
    mode,
    toggleMode,
    setMode,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <ThemeProvider theme={currentTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};

export default ProSavisThemeProvider;
