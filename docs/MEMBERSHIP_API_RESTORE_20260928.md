# Released mini-program membership API repair

Production base: 16c48c8ce5a (2026-09-28). The released mini program requests GET /api/user/membership-benefits, but this production lineage has neither the route nor its summary helper. GitHub master and production have diverged; do not replace production with the older mini-program release tree.

Scope: restore only the authenticated, read-only summary route and its previously released projection. Keep current production onboarding, service journey and review queue code. No ledger backfill, balance changes, payment changes, data migration, client upload or web rebuild.

Verification: route registration/auth/current-user isolation/error sanitization; ledger projection, shared quota, legacy unknown usage, expired/cancelled protection. Production verification must exercise the registered handler with a read-only customer lookup, not rely on unauthenticated HTTP 401 (global auth also returns 401 for a missing route).

Deployment must require the exact clean production base and use fast-forward only. GitHub master reconciliation is separate; this patch must not overwrite either divergent lineage.
