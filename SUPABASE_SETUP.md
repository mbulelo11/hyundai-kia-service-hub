# Supabase setup

The app's current lead intake data maps to the `public.leads` table. Apply the
SQL migration with the Supabase CLI from the repository root:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Copy `.env.example` to `.env` and set the project URL and anon key from
**Project Settings → API** before wiring the mobile client to Supabase.

The migration enables row-level security. Users must be authenticated before
they can read or write leads; inserts must set `created_by` to the signed-in
user's ID. The Supabase service-role key must never be included in the Expo
client.
