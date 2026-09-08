/**
 * Adjunta identidad del pool outreach_leads a un upsert de crm_directory.
 * Evita crear un stub WhatsApp cuando ya existe ficha de correo/NIT.
 */

export type OutreachIdentityRow = {
  id: string;
  name: string | null;
  email: string | null;
  nit: string | null;
  crm_directory_id: string | null;
};

type OutreachLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: OutreachIdentityRow | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

export async function findOutreachLeadByPhoneKey(
  supabase: OutreachLookupClient,
  phoneKey: string | null,
): Promise<OutreachIdentityRow | null> {
  if (!phoneKey) return null;
  const { data, error } = await supabase
    .from('outreach_leads')
    .select('id, name, email, nit, crm_directory_id')
    .eq('phone_key', phoneKey)
    .maybeSingle();
  if (error) {
    console.warn('[directory-outreach-identity] outreach_leads lookup', error.message);
    return null;
  }
  return data;
}

export function applyOutreachIdentityToEntry(
  entry: Record<string, unknown>,
  pool: OutreachIdentityRow | null,
): Record<string, unknown> {
  if (!pool) return entry;
  const next: Record<string, unknown> = { ...entry };
  const prevMeta =
    next.metadata && typeof next.metadata === 'object' && !Array.isArray(next.metadata)
      ? (next.metadata as Record<string, unknown>)
      : {};
  const prevOutreach =
    prevMeta.outreach && typeof prevMeta.outreach === 'object' && !Array.isArray(prevMeta.outreach)
      ? (prevMeta.outreach as Record<string, unknown>)
      : {};

  if (pool.crm_directory_id) {
    next.id = pool.crm_directory_id;
    delete next.full_name;
    delete next.display_name;
  }
  if (pool.email) next.email = pool.email.toLowerCase().trim();
  next.metadata = {
    ...prevMeta,
    outreach: {
      ...prevOutreach,
      nit: pool.nit,
      leadId: pool.id,
    },
  };
  if (!pool.crm_directory_id && pool.name && !next.full_name) {
    next.full_name = pool.name;
    next.display_name = pool.name;
  }
  return next;
}
