import { Toaster } from 'sileo';
import { useTheme } from '@/context/ThemeContext';
import { CRM_TOAST_POSITION, crmToasterFill, setCrmToastMode } from '@/utils/crmToast';

/** Toaster Sileo alineado al tema del CRM. Default: bottom-center. */
export function CrmToaster() {
  const { mode } = useTheme();
  setCrmToastMode(mode);

  return (
    <Toaster
      position={CRM_TOAST_POSITION}
      theme={mode}
      options={{
        roundness: 16,
        duration: 4000,
        fill: crmToasterFill(mode),
      }}
    />
  );
}
