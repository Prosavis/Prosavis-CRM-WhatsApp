import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#075e54',
      dark: '#04453d',
      light: '#d8f3ed',
    },
    secondary: {
      main: '#00a884',
    },
    background: {
      default: '#f3f7f5',
      paper: '#ffffff',
    },
    text: {
      primary: '#13201d',
      secondary: '#5b6b66',
    },
  },
  shape: {
    borderRadius: 18,
  },
  typography: {
    fontFamily:
      '"Aptos", "Segoe UI", "Helvetica Neue", system-ui, sans-serif',
    h4: {
      fontWeight: 800,
      letterSpacing: '-0.04em',
    },
    h5: {
      fontWeight: 800,
      letterSpacing: '-0.03em',
    },
    h6: {
      fontWeight: 750,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(7, 94, 84, 0.08)',
          boxShadow: '0 18px 60px rgba(15, 23, 42, 0.08)',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 999,
          textTransform: 'none',
          fontWeight: 700,
        },
      },
    },
  },
});
