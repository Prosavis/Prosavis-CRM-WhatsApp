import '@/test/setup';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import JobApplicationsPage from '@/pages/jobs/JobApplicationsPage';

vi.mock('@/hooks/useJobApplicationsQueries', () => ({
  useJobApplicationsMetrics: () => ({
    data: {
      total: 12,
      job: 12,
      marianSpecial: 3,
      needsReview: 2,
      hired: 1,
      rejectedOrWithdrawn: 4,
      byStage: { new: 5, hired: 1 },
      bySourceChannel: { whatsapp: 10, backfill: 2 },
    },
    isPending: false,
    error: null,
  }),
  useJobApplicationsList: () => ({
    data: {
      items: [{
        id: 'app-1',
        cohort: 'job',
        stage: 'new',
        assigned_to: null,
        needs_review: false,
        review_reason: null,
        source_channel: 'whatsapp',
        origin_label: 'tester',
        created_by_label: 'tester',
        created_at: '2026-09-16T00:00:00.000Z',
        hired_at: null,
        directory_id: 'dir-1',
        team_member_id: null,
        candidate: { id: 'c1', full_name: 'Ana Pérez', phone: '300', email: null, document_number: '12345678', location_text: null },
        directory: { id: 'dir-1', full_name: 'Remitente', display_name: null, phone: '300', photo_url: null },
      }],
      total: 1,
      limit: 50,
      offset: 0,
    },
    isPending: false,
  }),
  useJobApplicationMutations: () => ({
    backfill: { mutate: vi.fn(), isPending: false },
    transition: { mutateAsync: vi.fn(), isPending: false },
    hire: { mutateAsync: vi.fn(), isPending: false },
    split: { mutateAsync: vi.fn() },
    remove: { mutateAsync: vi.fn() },
  }),
  useJobApplicationDetail: () => ({ isPending: false, data: null }),
  useJobTeamMembers: () => ({ data: { members: [] } }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/whatsapp?tab=jobs']}>
        <JobApplicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('JobApplicationsPage', () => {
  it('renders KPIs, list tab and a row', () => {
    renderPage();
    expect(screen.getByTestId('jobs-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('jobs-kpi-total')).toHaveTextContent('12');
    expect(screen.getByTestId('jobs-tab-analytics')).toBeInTheDocument();
    expect(screen.getByTestId('jobs-tab-review')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('••••5678')).toBeInTheDocument();
  });
});
