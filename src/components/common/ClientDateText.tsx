import { COLOMBIA_DATE_LOCALE, COLOMBIA_TIME_ZONE } from '@/utils/colombiaTime';

interface ClientDateTextProps {
  value?: Date | string | number | null;
  locale?: string;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
  includeTime?: boolean;
}

export default function ClientDateText({
  value,
  locale = COLOMBIA_DATE_LOCALE,
  options,
  fallback = '-',
  includeTime = false,
}: ClientDateTextProps) {
  if (!value) {
    return <span>{fallback}</span>;
  }

  const date = value instanceof Date ? value : new Date(value);
  const resolvedOptions: Intl.DateTimeFormatOptions = {
    timeZone: COLOMBIA_TIME_ZONE,
    ...options,
  };
  const formattedDate = Number.isNaN(date.getTime())
    ? fallback
    : includeTime
      ? date.toLocaleString(locale, resolvedOptions)
      : date.toLocaleDateString(locale, resolvedOptions);

  return <span>{formattedDate}</span>;
}
