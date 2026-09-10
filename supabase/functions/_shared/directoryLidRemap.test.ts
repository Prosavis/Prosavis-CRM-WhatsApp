import { assertEquals } from 'jsr:@std/assert';
import { COMMERCIAL_PHONE_NUMBER_ID } from './whatsappLines.ts';
import {
  directoryConversationIdColumn,
  remapDirectoryLidToPhone,
  type DirectoryLidRemapClient,
} from './directoryLidRemap.ts';

Deno.test('commercial LID remaps onto the existing directory row', () => {
  assertEquals(
    directoryConversationIdColumn(COMMERCIAL_PHONE_NUMBER_ID),
    'whatsapp_commercial_conversation_id',
  );
  assertEquals(directoryConversationIdColumn('1035566289641219'), 'whatsapp_conversation_id');
});

Deno.test('LID directory without a phone row keeps the same id and stores the phone', async () => {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const supabase: DirectoryLidRemapClient = {
    from: () => ({
      select: () => ({
        eq: (column, value) => ({
          maybeSingle: async () => {
            if (column === 'whatsapp_commercial_conversation_id' && value === 'lid:CO.1__x') {
              return { data: { id: 'dir-lid' }, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
      update: (values) => ({
        eq: async (_column, id) => {
          updates.push({ id, values });
          return { error: null };
        },
      }),
    }),
    rpc: async () => ({ error: null }),
  };

  await remapDirectoryLidToPhone({
    supabase,
    lidKey: 'lid:CO.1__x',
    phoneKey: '573001234567__x',
    phone: '+573001234567',
    phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
  });

  assertEquals(updates.length, 1);
  assertEquals(updates[0]?.id, 'dir-lid');
  assertEquals(updates[0]?.values.phone, '+573001234567');
});
