# Supabase first-time setup

The multiplayer code expects the migration in `supabase/migrations` to be applied to the
Lovable/Supabase project before the updated frontend is deployed.

1. Enable anonymous sign-ins in **Supabase Dashboard → Authentication → Providers → Anonymous**.
   Students still enter only a nickname; the anonymous account is created invisibly and is
   persisted in their browser.
2. Apply the migrations in timestamp order with the Lovable/Supabase migration workflow:
   - `20260808234435_6c703551-b5a1-4e03-8cfb-f88a973b4dc5.sql` (multiplayer foundation)
   - `20260809010000_multiplayer_foundation.sql` (additive market simulation engine)
   The second migration is additive. It keeps existing players and transactions, and adds the
   server market clock, compressed scenario timeline, news price effects, and sampled price
   history.
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

For a short verification run, reset the game, select **10분 테스트** on the operator screen,
then start the game. Use **1주 대회** for the intended one-real-week to one-simulated-year run.
The scenario duration can only be changed while the game is waiting and has no completed ticks.
