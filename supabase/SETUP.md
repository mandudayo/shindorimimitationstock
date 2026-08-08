# Supabase first-time setup

The multiplayer code expects the migration in `supabase/migrations` to be applied to the
Lovable/Supabase project before the updated frontend is deployed.

1. Enable anonymous sign-ins in **Supabase Dashboard → Authentication → Providers → Anonymous**.
   Students still enter only a nickname; the anonymous account is created invisibly and is
   persisted in their browser.
2. Apply `20260809010000_multiplayer_foundation.sql` with the Supabase migration workflow.
3. In **Authentication → Users**, create the email/password account that the operator will use.
4. Run the following once in the Supabase SQL editor, replacing the email address:

```sql
insert into public.admin_users (user_id)
select id
from auth.users
where email = 'teacher@example.com'
on conflict (user_id) do nothing;
```

Do not put the operator password, service-role key, or unreleased scenario values in this
repository. The browser uses only the publishable key; privileged game actions are checked by
database functions and the `admin_users` table.
