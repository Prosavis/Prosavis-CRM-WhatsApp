import { Box, Tab, Tabs } from '@mui/material';
import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DirectorySegmentTable } from '@/components/directory/DirectorySegmentTable';
import { DirectoryWorkspaceKpisBar } from '@/components/directory/DirectoryWorkspaceKpis';
import {
  useDirectoryWorkspaceFocusRefetch,
  useDirectoryWorkspaceSummary,
} from '@/hooks/useDirectoryWorkspaceQueries';
import LeadsPage, { type LeadsPageProps } from '@/pages/leads/LeadsPage';
import {
  applyDirectoryClientId,
  applyDirectoryCrmView,
  applyDirectorySegment,
  resolveDirectoryCrmView,
  resolveDirectorySegment,
} from '@/utils/directoryViews';

const DirectoryWorkspacePage: React.FC<LeadsPageProps> = ({
  embedded,
  onOpenInInbox,
  onOpenBulk,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = resolveDirectoryCrmView(searchParams);
  const segment = resolveDirectorySegment(searchParams);
  const clientId = searchParams.get('clientId');
  const dirAction = searchParams.get('dirAction');
  const summary = useDirectoryWorkspaceSummary();
  useDirectoryWorkspaceFocusRefetch();

  useEffect(() => {
    if (dirAction === 'bulk' && onOpenBulk) {
      onOpenBulk();
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('dirAction');
        return next;
      }, { replace: true });
    }
    if (dirAction === 'sequence') {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'automations');
        next.delete('dirAction');
        return next;
      }, { replace: true });
    }
  }, [dirAction, onOpenBulk, setSearchParams]);

  const clearClientId = () => {
    setSearchParams((prev) => applyDirectoryClientId(prev, null), { replace: true });
  };

  const tabIndex = view === 'scheduled' ? 0 : view === 'all' ? 1 : 2;

  return (
    <Box data-testid="directory-workspace" sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.5, md: 2 } }}>
      <DirectoryWorkspaceKpisBar
        kpis={summary.data}
        loading={summary.isPending}
        error={summary.error instanceof Error ? summary.error.message : null}
        view={view}
        segment={segment}
        onSelect={(next) => {
          setSearchParams((prev) => {
            const withView = applyDirectoryCrmView(prev, next.view);
            return applyDirectorySegment(withView, next.segment);
          }, { replace: true });
        }}
      />
      <Tabs
        value={tabIndex}
        onChange={(_, index: number) => {
          const nextView = index === 1 ? 'all' : index === 2 ? 'canceled' : 'scheduled';
          setSearchParams((prev) => applyDirectorySegment(applyDirectoryCrmView(prev, nextView), null), {
            replace: true,
          });
        }}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Agendados" data-testid="directory-tab-scheduled" />
        <Tab label="Directorio" data-testid="directory-tab-all" />
        <Tab label="Cancelados" data-testid="directory-tab-canceled" />
      </Tabs>

      {view === 'all' && !segment ? (
        <LeadsPage
          embedded={embedded}
          onOpenInInbox={onOpenInInbox}
          onOpenBulk={onOpenBulk}
          initialClientId={clientId}
          onInitialClientHandled={clearClientId}
        />
      ) : (
        <DirectorySegmentTable
          view={view}
          segment={segment}
          clientId={clientId}
          onClientHandled={clearClientId}
          onOpenInInbox={onOpenInInbox}
        />
      )}
    </Box>
  );
};

export default DirectoryWorkspacePage;
