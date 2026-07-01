import { useQuery } from '@tanstack/react-query';
import { getReminderHistory } from '@/services/reminderAutomationsService';
import type { ReminderHistoryResponse } from '@/types/reminderAutomations';

export function useReminderHistory(params: {
  dateFrom: string;
  dateTo: string;
  recipientType?: 'client' | 'professional';
  enabled?: boolean;
}) {
  return useQuery<ReminderHistoryResponse, Error>({
    queryKey: ['reminder-history', params.dateFrom, params.dateTo, params.recipientType],
    queryFn: () => getReminderHistory(params),
    enabled: params.enabled !== false && Boolean(params.dateFrom && params.dateTo),
    staleTime: 30_000,
  });
}
