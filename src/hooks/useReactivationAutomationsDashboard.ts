import { useQuery } from '@tanstack/react-query';
import { getReactivationAutomationsDashboard } from '@/services/reactivationAutomationsService';
import type { ReactivationDashboard } from '@/types/reactivationAutomations';

export const REACTIVATION_AUTOMATIONS_QUERY_KEY = [
  'reactivation-automations-dashboard',
] as const;

export function useReactivationAutomationsDashboard() {
  return useQuery<ReactivationDashboard, Error>({
    queryKey: REACTIVATION_AUTOMATIONS_QUERY_KEY,
    queryFn: getReactivationAutomationsDashboard,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
}
