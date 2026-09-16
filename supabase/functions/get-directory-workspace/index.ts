import { requireAdmin } from '../_shared/adminAuth.ts';
import { callRpc } from '../_shared/historicalBootstrap.ts';
import { resolveRequestedServiceId } from '../_shared/fetchAllRows.ts';
import {
  clampDirectoryOffset,
  clampDirectoryPageSize,
  mapDirectoryWorkspaceCancellations,
  mapDirectoryWorkspacePage,
  mapDirectoryWorkspaceSnapshot,
  requireDirectoryId,
  resolveDirectoryWorkspaceAction,
  resolveDirectoryWorkspaceSegment,
  resolveDirectoryWorkspaceView,
} from '../_shared/directoryWorkspace.ts';
import {
  strictJsonResponse,
  strictPreflightResponse,
} from '../_shared/strictCors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const serviceId = resolveRequestedServiceId((body as { serviceId?: unknown }).serviceId);
    const action = resolveDirectoryWorkspaceAction((body as { action?: unknown }).action);

    if (action === 'summary') {
      const snapshot = await callRpc<unknown>(supabase, 'directory_workspace_snapshot', {
        p_service_id: serviceId,
      });
      return strictJsonResponse(req, {
        action,
        serviceId,
        kpis: mapDirectoryWorkspaceSnapshot(snapshot),
      });
    }

    if (action === 'cancellations') {
      let directoryId: string;
      try {
        directoryId = requireDirectoryId((body as { directoryId?: unknown }).directoryId);
      } catch (error) {
        return strictJsonResponse(
          req,
          { error: error instanceof Error ? error.message : 'directoryId es obligatorio.' },
          400,
        );
      }
      const rows = await callRpc<unknown[]>(
        supabase,
        'directory_workspace_cancellations_ordered',
        {
          p_service_id: serviceId,
          p_directory_id: directoryId,
        },
      );
      return strictJsonResponse(req, {
        action,
        serviceId,
        directoryId,
        items: mapDirectoryWorkspaceCancellations(rows),
      });
    }

    const view = resolveDirectoryWorkspaceView((body as { view?: unknown }).view);
    const segment = resolveDirectoryWorkspaceSegment((body as { segment?: unknown }).segment);
    const search = typeof (body as { search?: unknown }).search === 'string'
      ? (body as { search: string }).search
      : null;
    const limit = clampDirectoryPageSize((body as { limit?: unknown }).limit);
    const offset = clampDirectoryOffset(
      (body as { offset?: unknown }).offset ?? (body as { cursor?: unknown }).cursor,
    );
    const rows = await callRpc<unknown[]>(supabase, 'directory_workspace_page', {
      p_service_id: serviceId,
      p_view: view,
      p_search: search,
      p_segment: segment,
      p_limit: limit,
      p_offset: offset,
    });
    const page = mapDirectoryWorkspacePage(rows, limit, offset);
    return strictJsonResponse(req, {
      action: 'page',
      serviceId,
      view,
      segment,
      ...page,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return strictJsonResponse(req, { error: String(error) }, 500);
  }
});
