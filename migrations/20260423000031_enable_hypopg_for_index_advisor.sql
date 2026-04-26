-- Enable HypoPG for Supabase's extensions.index_advisor helper.
-- This resolves the advisor's missing hypopg_reset() lint error.

CREATE EXTENSION IF NOT EXISTS hypopg WITH SCHEMA extensions;
