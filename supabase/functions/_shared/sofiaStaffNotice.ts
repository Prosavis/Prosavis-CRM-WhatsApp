// Aviso en la app a Francy y a Marian. El mismo mensaje que staff.aviso.enviar
// deja en el chat de soporte. No sale por WhatsApp.
import {
  createFirestoreSubcollectionDocument,
  patchFirestoreSubcollectionDocument,
  runFirestoreQuery,
} from './firebaseAdminRest.ts';
import { staffNoticeCopy } from './sofiaAutomatic.ts';

const SYSTEM_ID = 'prosavis-system';
const ROLES = ['francy', 'marian'] as const;

export async function notifySofiaEscalation(nombre: string, motivo: string): Promise<void> {
  const copy = staffNoticeCopy(nombre, motivo);
  await Promise.all(ROLES.map(async (role) => {
    try {
      await notifyRole(role, copy.title, copy.body);
    } catch (error) {
      console.warn(JSON.stringify({
        scope: 'sofia-automatic',
        event: 'aviso-fallo',
        role,
        error: error instanceof Error ? error.message : 'aviso',
      }));
    }
  }));
}

async function notifyRole(role: string, title: string, body: string): Promise<void> {
  const people = await runFirestoreQuery('staffRoles', {
    where: {
      fieldFilter: {
        field: { fieldPath: 'role' },
        op: 'EQUAL',
        value: { stringValue: role },
      },
    },
    limit: 2,
  });
  if (people.length !== 1) return;
  const uid = people[0]?.id;
  if (!uid) return;
  const chats = await runFirestoreQuery('chats', {
    where: {
      fieldFilter: {
        field: { fieldPath: 'clientId' },
        op: 'EQUAL',
        value: { stringValue: uid },
      },
    },
    limit: 10,
  });
  const chat = chats.find((item) =>
    item.data.context === 'system'
    && item.data.isSystemChat === true
    && item.data.providerId === SYSTEM_ID
  );
  if (!chat) return;
  const created = await createFirestoreSubcollectionDocument(`chats/${chat.id}`, 'messages', {
    chatId: chat.id,
    senderId: SYSTEM_ID,
    senderName: 'Prosavis',
    content: `${title}\n\n${body}`,
    timestamp: Date.now(),
    isRead: false,
    type: 'text',
    metadata: {
      staffNotice: 'staff_notice',
      title,
    },
  });
  if (created.id) {
    await patchFirestoreSubcollectionDocument(`chats/${chat.id}`, 'messages', created.id, {
      id: created.id,
    });
  }
}
