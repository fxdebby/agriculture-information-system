# Cultiva (Agriculture Information System)

Static web app (HTML, JavaScript, Bootstrap) on a Supabase PostgreSQL database.

## 1. Database (Supabase SQL Editor)
The project database consists of five core tables: crop, farmer, farm, planting, and harvest, structured according to the principles of Third Normal Form (3NF).
1. **Only if those tables are not in your Supabase project yet:** run `database/01_original_tables.sql`.
   It creates them with the sample data. It also works as a reset, because it drops and recreates everything first.
2. Run `database/02_normalize.sql`. It converts the tables in place to 3NF (keeps all rows), adds the lookup tables,
   constraints, audit columns, login roles, views and security rules. It stops with a clear message if run twice.
3. Run `database/03_profile_and_photo.sql`. It adds the optional profile photo (a private Supabase Storage bucket) and lets users edit their own name and photo, but never their own role.
4. (Optional) Run `database/04_account_check.sql`. It lets the sign-in page say "This account is not registered yet" for an email that has no account. It reveals only yes or no. To switch it off again run `drop function public.account_exists(text);`
5. Run `database/05_roles_and_requests.sql`. It adds the Moderator role, the approval requests and the kick-out function.
   It is safe to run again: if you ran an older copy, run this one so staff can also send **crop** requests.
6. Open **Authentication > Users** and add your own user (tick "Auto confirm user").
7. Make yourself Administrator:
   `update profiles set role_id = 1 where email = 'your-email@example.com';`

## 2. Run locally
1. Copy `config.example.js` to `config.js`.
2. Paste your Project URL and **anon/public** key (Project Settings > API). Never use the `service_role` key.
3. Run `python -m http.server 8000` in this folder and open http://localhost:8000

## 3. Deploy on Netlify
1. Push this folder to GitHub. `config.js` is ignored by `.gitignore`, so no keys are committed.
2. On Netlify choose **Add new site > Import from Git**.
3. Under **Site settings > Environment variables** add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
4. Deploy. `netlify.toml` builds `config.js` from those variables.

## Roles and approvals
- **Administrator** (exactly one): changes records directly, manages crops, sees the **Accounts** page, changes roles
  and can **kick out** any member.
- **Moderator** (any number): changes records directly and approves or rejects staff requests (**Requests** tab, next to Reports).
  Each request card has an X that closes it for that person only (the database keeps it); the Pending / Approved /
  Rejected / All counts and the red count on the tab go down. Next to the tabs, **Restore N closed** brings them back and,
  for the administrator only, **Delete N permanently** removes them from the database for good. Both ask "Do you wish to
  proceed?" first (Yes / No). Permanent delete needs the latest `05_roles_and_requests.sql`.
- **Staff** (any number): can look at everything, but add / edit / delete are sent as **requests**, for crops as well
  as farmers, farms, plantings and harvests. Nothing changes until an administrator or moderator approves it.
  The "changes are sent for approval" notice has an X button and hides itself after 5 seconds. On **My profile**, staff
  can remove finished entries from their own **My requests** list with the X; this only hides them for that person,
  and administrators and moderators still see every request in the **Requests** tab.

Setup: run `database/05_roles_and_requests.sql` in the Supabase SQL Editor **before** you deploy the matching app files.
New accounts you create under Authentication > Users start as Staff; the administrator promotes them on the Accounts page.
Tip: in Supabase, Authentication > Sign In / Providers, turn off "Allow new users to sign up" so only you can create accounts.

## PHP part
The app also ships with a small PHP layer. The screens look and work exactly the same; PHP only adds server-side features.
- `index.php` serves the same page as `index.html`. It reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the server
  (environment variables, or `config.local.php`), so the keys are not stored in the page files.
  It also sends security headers.
- `api/export.php` creates a CSV file of any of the six reports (with the chosen dates). It uses the signed-in user's own
  token, so the database's Row Level Security still decides what that user may export. Dates, report names and tokens
  are validated, and text that looks like a spreadsheet formula is neutralized.
- `api/ping.php` lets the page detect PHP. The **Export CSV** button on the Reports page only appears when PHP is running.
- `lib.php` holds the shared helpers.

### Run it with PHP on your computer
1. Install PHP 8.1 or newer with the curl extension (XAMPP includes both), or use XAMPP's Apache.
2. Copy `config.local.example.php` to `config.local.php` and fill in your Project URL and publishable key.
3. In this folder run `php -S localhost:8000` and open http://localhost:8000
   (With XAMPP, put the folder in `htdocs` and open it through `http://localhost/...`.)

### Deploy with PHP
Netlify cannot run PHP, so the Netlify site keeps the plain HTML/JavaScript version (no Export button).
To publish the PHP version, use any host that runs PHP:
- a PHP web host: upload the files, then create `config.local.php` on the server; or
- a host that builds from the included `Dockerfile` (it uses PHP 8.3 with Apache): set the environment variables
  `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the host.

## Files
- `index.html`: page layout and modals
- `app.js`: login, dashboard, CRUD modules, reports
- `config.example.js`: template for `config.js`
- `index.php`, `lib.php`, `api/export.php`, `api/ping.php`, `Dockerfile`, `.htaccess`: the PHP layer
- `config.local.example.php`: template for the PHP server's settings
