interface ClientDateTextProps {
  value?: Date | string | number | null;
  locale?: string;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
  includeTime?: boolean;
}

export default function ClientDateText({
  value,
  locale = 'es-CO',
  options,
  fallback = '-',
  includeTime = false,
}: ClientDateTextProps) {
  if (!value) {
    return <span>{fallback}</span>;
  }

  const date = value instanceof Date ? value : new Date(value);
  const formattedDate = Number.isNaN(date.getTime())
    ? fallback
    : includeTime
      ? date.toLocaleString(locale, options)
      : date.toLocaleDateString(locale, options);

  return <span>{formattedDate}</span>;
}
