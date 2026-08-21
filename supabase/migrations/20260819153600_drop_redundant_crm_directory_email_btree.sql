-- uq_directory_email already enforces uniqueness and covers equality lookups.
-- ILIKE search uses idx_crm_directory_email_trgm, not this btree.
drop index if exists public.idx_directory_email;
