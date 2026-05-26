import { v5 as uuidv5 } from 'uuid';

/** Namespace fijo Prosavis — UUID v5 determinístico para re-ejecución idempotente. */
export const MIGRATION_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export function firebaseIdToUuid(sourceCollection: string, firebaseId: string): string {
  return uuidv5(`${sourceCollection}/${firebaseId}`, MIGRATION_NAMESPACE);
}

export type IdMapEntry = {
  source_collection: string;
  firebase_id: string;
  supabase_id: string;
};

export function buildIdMapEntry(
  sourceCollection: string,
  firebaseId: string,
  supabaseId?: string
): IdMapEntry {
  return {
    source_collection: sourceCollection,
    firebase_id: firebaseId,
    supabase_id: supabaseId ?? firebaseIdToUuid(sourceCollection, firebaseId),
  };
}
