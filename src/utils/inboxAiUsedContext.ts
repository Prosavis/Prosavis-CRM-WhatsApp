import type { ConversationHistoryMeta } from '../../supabase/functions/_shared/conversationHistory';
import type { InboxAiPropertySummary } from '../../supabase/functions/_shared/inboxAiContextFormat';
import type { MetaSessionWindow } from '../../supabase/functions/_shared/metaSessionWindow';

export interface InboxAiUsedContextSnapshot {
  historyMeta?: ConversationHistoryMeta | null;
  conversationTags?: string[] | null;
  propertySummary?: InboxAiPropertySummary | null;
  sessionWindow?: MetaSessionWindow | null;
}

export function hasInboxAiUsedContext(
  snapshot: InboxAiUsedContextSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return Boolean(
    snapshot.historyMeta ||
      (snapshot.conversationTags && snapshot.conversationTags.length > 0) ||
      snapshot.propertySummary ||
      snapshot.sessionWindow,
  );
}

export function formatHistoryMetaSummary(
  meta: ConversationHistoryMeta | null | undefined,
): string {
  if (!meta) return 'Sin historial cargado';
  const parts = [`${meta.loaded} mensajes`];
  if (meta.truncated) parts.push('ventana truncada');
  return parts.join(' · ');
}

export function formatPropertySummaryLabel(
  summary: InboxAiPropertySummary | null | undefined,
): string {
  if (!summary) return 'Sin resumen de propiedad';
  if (summary.patternLabel?.trim()) return summary.patternLabel.trim();
  if (summary.pattern === 'single' && summary.properties[0]?.address) {
    return `Misma propiedad: ${summary.properties[0].address}`;
  }
  if (summary.pattern === 'multiple') {
    return `${summary.uniquePropertyCount} propiedades distintas`;
  }
  if (summary.pattern === 'none') return 'Sin direcciones en citas';
  return 'Propiedad desconocida';
}

export function formatSessionWindowLabel(
  window: MetaSessionWindow | null | undefined,
): string {
  if (!window) return 'Ventana de sesión desconocida';
  if (window.status === 'open') {
    const expires = window.expiresAt
      ? new Date(window.expiresAt).toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
        })
      : null;
    return expires ? `Abierta · expira ${expires}` : 'Abierta';
  }
  if (window.status === 'closed') return 'Cerrada · requiere plantilla';
  return 'Desconocida · requiere plantilla';
}
