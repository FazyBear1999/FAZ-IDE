# SiteGround Real Accounts Setup (Supabase + Google OAuth)

This guide turns FAZ IDE accounts from local-only into real cloud accounts with Google login.

## 0) What was added in code

- Auth config: `assets/js/config.js` (`AUTH` export)
- Supabase auth client: `assets/js/auth/supabaseAccount.js`
- App integration: `assets/js/app.js`
- Account modal UI controls: `index.html`, `assets/css/components.css`, `assets/js/ui/elements.js`
- Supabase SQL: `config/supabase-account-profiles.sql`

Default behavior remains safe:
- If auth keys are empty, app stays in local mode.
- After keys are configured, cloud auth activates automatically.

---

## 1) Create Supabase project

1. Go to Supabase dashboard and create a new project.
2. Save these values (Project Settings → API):
   - Project URL
   - `anon` public key
3. In Authentication → Providers, enable Google.
4. Keep Supabase dashboard open for redirect URLs in later steps.

---

## 2) Create Google OAuth app

1. Open Google Cloud Console.
2. Create (or select) a project.
3. Configure OAuth Consent Screen:
   - App name
   - Support email
   - Authorized domains (include your SiteGround domain)
4. Create OAuth Client ID:
   - Application type: Web application
5. Add Authorized Redirect URI:
   - Use the exact callback URL shown by Supabase Google provider page.
6. Copy:
   - Google Client ID
   - Google Client Secret
7. Paste these into Supabase Google provider settings and save.

Important:
- URI must match exactly (protocol, domain, path, trailing slash behavior).
- Use production domain for production.

---

## 3) Configure Supabase Auth URLs

In Supabase Authentication URL settings:

1. Site URL:
   - `https://your-domain.com`
2. Additional Redirect URLs:
   - `https://your-domain.com/`
   - `https://www.your-domain.com/` (if you use both)

If you test staging previews, add those URLs too.

---

## 4) Create account tables + policies

1. Open Supabase SQL editor.
2. Run SQL from:
   - `config/supabase-account-profiles.sql`
3. Verify table exists:
   - `public.account_profiles`
   - `public.account_workspace_state`
4. Verify RLS is enabled and policies exist.

Why this matters:
- Users can only read/write their own profile row.
- Users can only read/write their own workspace cloud state row.
- Prevents cross-user data leaks.

---

## 5) Configure FAZ IDE project keys (safe deploy-time injection)

Keep `assets/js/config.js` committed with placeholder/empty auth values in git.

Before packaging for SiteGround, set environment variables in PowerShell:

```powershell
$env:SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_PUBLIC_KEY"
# Optional (default is /)
$env:SUPABASE_OAUTH_REDIRECT_PATH = "/"
```

Then run:

```powershell
npm run deploy:siteground
```

The deploy script injects those values only into `release/siteground/public_html/assets/js/config.js`.

Notes:

- `anon` key is safe to expose in frontend apps.
- Never place service role keys in frontend code.
- This keeps live keys out of tracked source files and out of normal commits.

---

## 6) SiteGround hosting hardening checklist

In SiteGround Site Tools:

1. Security → SSL Manager:
   - Install SSL certificate.
2. Security → HTTPS Enforce:
   - Turn ON.
3. Speed → Caching:
   - Exclude auth callback/root path from aggressive HTML caching if needed.
4. Security → WAF:
   - Keep ON.
5. Security → Backups:
   - Ensure daily backups are active.

If using Cloudflare/CDN:
- Keep SSL mode Full (strict).
- Do not cache dynamic auth responses.

---

## 7) Deploy and verify

1. Run your release gate locally:
   - `npm run test:all`
2. Deploy package as you already do to SiteGround.
3. Open production site in incognito.
4. Click Account → Connect Google.
5. Complete consent and return to site.
6. Confirm:
   - Header account name updates
   - Account status shows connected
   - Save Cloud Profile works
   - Workspace/theme/layout/lessons restore after login on another device
   - Sign out works

---

## 8) Production QA script (must-pass)

Test each item on desktop + mobile:

1. First login with Google succeeds.
2. Reload keeps session.
3. Save Cloud Profile updates `display_name` + `account_type`.
4. Open second browser account; data is isolated.
5. Sign out clears active session state.
6. Re-login restores same profile + synced workspace state.
7. Failed OAuth (cancel) returns gracefully.
8. Site still works in local mode if keys are removed.

---

## 9) Security rules you should keep

1. Never store passwords yourself (managed auth only).
2. Use Google OAuth + Supabase session handling.
3. Use least privilege RLS policies only.
4. Keep dependencies pinned and updated.
5. Keep CSP strict and avoid inline scripts where possible.
6. Log auth errors without exposing tokens.
7. Rotate compromised keys immediately.

---

## 10) Troubleshooting quick map

### Google button disabled
- Cause: missing `SUPABASE_URL` or `SUPABASE_ANON_KEY`
- Fix: set deploy env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) and redeploy.

### OAuth starts but returns signed out
- Cause: redirect URL mismatch
- Fix: align Google redirect URI + Supabase Site URL/Additional Redirect URLs exactly.

### Cloud profile save fails
- Cause: table/policy mismatch
- Fix: rerun `config/supabase-account-profiles.sql`, confirm RLS policies.

### Works locally, fails on SiteGround
- Cause: domain/caching mismatch
- Fix: verify production domain URLs in Supabase and disable full-page caching for auth return flow.

---

## 11) Backend lesson stats queries (Supabase SQL editor)

After users sign in and sync, you can inspect lesson/account progress directly:

```sql
select *
from public.account_lesson_stats
order by lesson_xp desc
limit 100;
```

Top users by completions:

```sql
select id, display_name, account_type, lessons_completed, lesson_level, lesson_xp, updated_at
from public.account_lesson_stats
order by lessons_completed desc, lesson_xp desc
limit 100;
```

Users active today:

```sql
select id, display_name, lesson_last_active_day, lesson_daily_streak, lesson_best_streak
from public.account_lesson_stats
where lesson_last_active_day = to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD')
order by lesson_daily_streak desc, lesson_best_streak desc;
```

Cloud sync freshness:

```sql
select id, display_name, last_cloud_sync_at, updated_at
from public.account_lesson_stats
order by coalesce(last_cloud_sync_at, updated_at) desc
limit 100;
```

---

## 12) Optional professional upgrades (next)

1. Add server-side token verification endpoint for privileged actions.
2. Add audit log table for auth/profile changes.
3. Add account deletion flow with confirmation.
4. Add legal docs links in auth area (Privacy/Terms).
5. Add role model (admin/mod/user) with policy-based access.

---

## 13) When you must update Google Cloud or Supabase

You do not need routine updates if your domain and auth setup stay the same.

Update Google Cloud + Supabase only when one of these changes happens:

1. Domain or protocol changes (example: new domain, www vs non-www, http to https).
   - Update Google OAuth Authorized Redirect URIs.
   - Update Supabase Site URL and Additional Redirect URLs.

2. Redirect mismatch/login errors appear.
   - Re-check exact URI match across Google and Supabase.

3. Key rotation/security event.
   - Rotate Supabase anon key in Supabase.
   - Replace key in `assets/js/config.js` and redeploy.

4. You add/change profile columns or policy logic.
   - Re-run `config/supabase-account-profiles.sql` in Supabase SQL editor.

5. CSP blocks auth or API calls after hosting/security changes.
   - Re-verify CSP in `.htaccess` allows `https://esm.sh`, `https://*.supabase.co`, and `wss://*.supabase.co`.

Optional live cloud test (safe, off by default):

- New test file: `tests/account-cloud-live.spec.js`
- Runs only when enabled:
  - PowerShell: `$env:FAZ_LIVE_CLOUD_TEST = "1"`
  - Then run: `npx playwright test tests/account-cloud-live.spec.js`
- If no signed-in Google session exists in that browser context, test self-skips and does not fail your normal suite.
