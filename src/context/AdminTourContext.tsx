import type { PropsWithChildren } from 'react';

type TabController = {
  setTab: (index: number) => void;
  getTab: () => number;
};

/** Stub: tour guiado del Panel no aplica al CRM independiente. */
export function useAdminTour() {
  return {
    registerTabController: (..._args: [string, TabController?]) => undefined,
    unregisterTabController: (..._args: [string]) => undefined,
  };
}
export function AdminTourProvider({ children }: PropsWithChildren) {
  return children;
}
