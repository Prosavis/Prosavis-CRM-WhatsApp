import { formatDistanceToNowStrict, format } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatRelativeTime(value?: Date): string {
  if (!value) return 'Sin actividad';

  return formatDistanceToNowStrict(value, {
    locale: es,
    addSuffix: true,
  });
}

export function formatShortDateTime(value?: Date): string {
  if (!value) return '-';
  return format(value, 'dd/MM/yyyy HH:mm', { locale: es });
}
