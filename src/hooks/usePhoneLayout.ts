import { useMediaQuery, useTheme } from '@mui/material';

const PHONE_LANDSCAPE_QUERY =
  '(pointer: coarse) and (orientation: landscape) and (max-height: 500px)';

export function usePhoneLayout(): boolean {
  const theme = useTheme();
  const narrowPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const landscapePhone = useMediaQuery(PHONE_LANDSCAPE_QUERY);
  return narrowPhone || landscapePhone;
}
