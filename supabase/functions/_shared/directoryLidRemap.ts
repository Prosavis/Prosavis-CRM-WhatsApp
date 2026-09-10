import { directoryPhoneKey } from './directoryPhone.ts';
import { isCommercialPhoneNumberId } from './whatsappLines.ts';

type DirectoryIdRow = { id: string };

type DirectoryLookup = {
  maybeSingle: () => Promise<{ data: DirectoryIdRow | null; error: { message: string } | null }>;
};

type DirectoryTable = {
  select: (columns: string) => {
    eq: (column: string, value: string) => DirectoryLookup;
  };
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
  };
};

export type DirectoryLidRemapClient = {
  from: (table: string) => DirectoryTable;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
};

export function directoryConversationIdColumn(phoneNumberId: string | null):
  | 'whatsapp_commercial_conversation_id'
  | 'whatsapp_conversation_id' {
  return isCommercialPhoneNumberId(phoneNumberId)
    ? 'whatsapp_commercial_conversation_id'
    : 'whatsapp_conversation_id';
}

/**
 * When Meta later reveals a phone for a LID thread, keep the same crm_directory
 * row so UserConsole can keep scheduling that person.
 */
export async function remapDirectoryLidToPhone(params: {
  supabase: DirectoryLidRemapClient;
  lidKey: string;
  phoneKey: string;
  phone: string;
  phoneNumberId: string | null;
}): Promise<void> {
  const column = directoryConversationIdColumn(params.phoneNumberId);
  const { data: lidDir, error: lidError } = await params.supabase
    .from('crm_directory')
    .select('id')
    .eq(column, params.lidKey)
    .maybeSingle();
  if (lidError) throw lidError;

  const phoneDigits = directoryPhoneKey(params.phone);
  let phoneDir: DirectoryIdRow | null = null;
  if (phoneDigits) {
    const { data, error } = await params.supabase
      .from('crm_directory')
      .select('id')
      .eq('phone_key', phoneDigits)
      .maybeSingle();
    if (error) throw error;
    phoneDir = data;
  }

  if (lidDir && phoneDir && lidDir.id !== phoneDir.id) {
    const { error: mergeError } = await params.supabase.rpc('merge_directory_entries', {
      p_primary: phoneDir.id,
      p_duplicate: lidDir.id,
    });
    if (mergeError) throw mergeError;
    const { error: linkError } = await params.supabase
      .from('crm_directory')
      .update({ [column]: params.phoneKey, updated_at: new Date().toISOString() })
      .eq('id', phoneDir.id);
    if (linkError) throw linkError;
    return;
  }

  const keepId = lidDir?.id ?? phoneDir?.id;
  if (!keepId) return;

  const { error: updateError } = await params.supabase
    .from('crm_directory')
    .update({
      phone: params.phone,
      [column]: params.phoneKey,
      updated_at: new Date().toISOString(),
    })
    .eq('id', keepId);
  if (updateError) throw updateError;
}
