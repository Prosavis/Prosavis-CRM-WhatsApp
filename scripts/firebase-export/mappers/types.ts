import type { UpsertResult } from '../lib/supabase-writer.js';
import type { MigrationContext } from '../lib/migration-context.js';

export type MapperResult = UpsertResult & {
  skipped?: number;
  warnings?: string[];
};

export type MapperFn = (
  ctx: MigrationContext,
  options?: ExportStepOptions
) => Promise<MapperResult>;

export type ExportStepOptions = {
  since?: Date;
  dryRun?: boolean;
};
