-- Reconcile CI/local migrations with migration history recorded on the remote database.
--
-- Error seen in GitHub Actions: "Remote migration versions not found in local migrations directory"
-- with version `20260428100600`. This file restores the naming/version parity so
-- `supabase db push` can run. The statement is deliberately idempotent-safe.
SELECT 1;
