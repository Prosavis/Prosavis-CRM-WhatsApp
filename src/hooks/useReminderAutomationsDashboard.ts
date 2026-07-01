import { useQuery } from '@tanstack/react-query';
import { getReminderAutomationsDashboard } from '@/services/reminderAutomationsService';
import type { ReminderAutomationsDashboard } from '@/types/reminderAutomations';

export const REMINDER_AUTOMATIONS_QUERY_KEY = ['reminder-automations-dashboard'] as const;

export function useReminderAutomationsDashboard() {
  return useQuery<ReminderAutomationsDashboard, Error>({
    queryKey: REMINDER_AUTOMATIONS_QUERY_KEY,
    queryFn: getReminderAutomationsDashboard,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
