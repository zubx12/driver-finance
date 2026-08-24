# Rule: Security Policy

Applies to: all database migrations, all Supabase client code, all API routes.

- Every table storing user data must have Row-Level Security enabled before it is considered done.
- Never grant a role broader access "to save time" — request explicit sign-off in the PR description if a policy seems like it needs to be looser than the role's documented scope in `design.md`.
- Service-role keys are for server-side scheduled jobs (e.g. the monthly salary auto-draft) only — never expose a service-role key to any client bundle.
- Receipt images and any uploaded file live in private Storage buckets; generate signed URLs on request, never public URLs.
- No hardcoded credentials, tokens, or connection strings anywhere in the repo — use environment variables, and confirm `.env*` files are gitignored.
- Any new RLS policy must be accompanied by a test proving both: (a) the intended user CAN access their own data, and (b) a different user of the same role CANNOT access it.
