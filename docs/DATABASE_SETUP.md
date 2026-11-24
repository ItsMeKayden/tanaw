# TANAW Database Setup Guide

This guide explains how to configure a local PostgreSQL database and initialize the TANAW database using Prisma.

## 1. Prerequisites

Make sure you have installed:

- Node.js and npm
- PostgreSQL
- pgAdmin (optional, for database management)
- Git

## 2. Clone the Repository

Clone the TANAW repository:

```bash
git clone <REPOSITORY_URL>
```

Navigate to the project directory:

```bash
cd tanaw
```

Install the project dependencies:

```bash
npm install
```

## 3. Create the PostgreSQL Database

Using pgAdmin:

1. Open pgAdmin.
2. Connect to your local PostgreSQL server.
3. Right-click **Databases**.
4. Select **Create → Database**.
5. Set the database name to:

```text
tanaw_db
```

6. Save.

You can also create the database using the PostgreSQL command line:

```sql
CREATE DATABASE tanaw_db;
```

## 4. Configure Environment Variables

Locate the `.env.example` file in the project root.

Create a copy named `.env`.

On PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` and configure the following variables:

```env
# PostgreSQL
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/tanaw_db"

# Auth.js
AUTH_SECRET=""

# Initial Test account
TEST_USER_PASSWORD=""

# Initial SYSTEM_ADMIN account
SYSTEM_ADMIN_PASSWORD=""
```

Replace the database username and password with your local PostgreSQL credentials.

Configure the other variables:

- `AUTH_SECRET`: A secure secret used by Auth.js.
- `TEST_USER_PASSWORD`: Password for the four test accounts.
- `SYSTEM_ADMIN_PASSWORD`: Initial password for the SYSTEM_ADMIN account.

Both account passwords must be between 8 and 72 characters.

Generate a secure Auth.js secret if needed:

```bash
npx auth secret
```

Do not commit or share your `.env` file.

## 5. Set Up the Database (Migrate, Generate, Seed)

Run one command:

```bash
npm run db:setup
```

This runs, in order:

| Step | Script | What it does |
| ---- | ------ | ------------ |
| 1 | `npm run db:migrate` | Applies every migration in `prisma/migrations` (`prisma migrate deploy`) |
| 2 | `npm run db:generate` | Regenerates the Prisma Client in `generated/prisma` |
| 3 | `npm run db:seed` | Adds the required and reference data |

`npm run db:seed` creates or completes:

- **Access control:** the 5 roles, 16 module permissions and their default role assignments. Defaults are only applied to permissions nobody has configured yet, so access changed on the User Management page is kept.
- **SYSTEM_ADMIN account** (`systemadmin@tanaw.com`) using `SYSTEM_ADMIN_PASSWORD`. An existing account's password is never changed.
- **Test accounts** (one per role) using `TEST_USER_PASSWORD`. Skipped if the variable is empty; re-running resets their passwords.
- **Admission stages:** Application Submitted → For Examination → Exam Completed → Passed / Qualified / Failed → Enrolled / Not Enrolled. Qualified is the waiting list: applicants who pass after their course's quota is full, admitted later from Admission → Additional Applicants.
- **Reference data:** Quezon City districts and barangays, the 3 campuses, 7 programs, and a starter list of schools.
- **Admission cycle 2026-2027** (active), only if no such cycle exists, plus a default passing score (75%) when the active cycle has none.
- **Map boundaries:** Quezon City barangay shapes from `prisma/seeds/geo/qc-barangays.geojson` into `tbl_barangay.boundary_geojson`, and each district's outline into `tbl_district.boundary_geojson` (source and license: `prisma/seeds/geo/README.md`).
- **Course recommendation:** the 5 exam competencies (Mathematics, English, Science, Logical Reasoning, Filipino) and default course-to-competency weights for courses that have none (weights edited in the app are kept).

The seeder is **idempotent**: it only adds what is missing, so it is safe to run as often as you like.

### Test accounts

| Account        | Username / email           | Role      |
| -------------- | -------------------------- | --------- |
| Test President | test.president@example.com | PRESIDENT |
| Test Admission | test.admission@example.com | ADMISSION |
| Test Registrar | test.registrar@example.com | REGISTRAR |
| Test Guidance  | test.guidance@example.com  | GUIDANCE  |

Test accounts are never created when `NODE_ENV=production`. To reset only their passwords: `npx tsx scripts/create-test-users.ts`.

## 6. Demo Data (Optional)

For sample applicants to work with:

```bash
npm run db:seed:demo
```

This adds, on top of the normal seed:

- 36 demo applicants spread across every admission stage, with 1st–3rd program choices.
- A "TANAW Admission Test" exam and results for applicants who took it.
- Stage history, and sample Form 138 / PSA documents for every third applicant.
- 100 exam questions (20 per competency), answers for every examined demo applicant, and generated course recommendations.
- Quotas for the active cycle: overall, per campus and per program (existing quotas are kept).

Demo applications use the `DEMO-` application number prefix (e.g. `DEMO-2026-0001`), so they never collide with real ones (`TANAW-2026-0001`).

To remove the demo applicants and recreate them fresh:

```bash
npm run db:seed:reset-demo
```

Only `DEMO-` applications and their applicants are removed; your own records are untouched. Demo data is never seeded in production.

## 7. Updating an Existing Local Database (after `git pull`)

Whenever you pull changes that touch `prisma/`:

```bash
npm install
npm run db:setup
```

Then restart `npm run dev`, because the dev server keeps the old Prisma Client until it restarts.

This keeps your existing data. Migrations convert it where needed; for example, the stage "For Evaluation" is renamed to "Passed" and stage-history authors are linked to their `tbl_user_account`.

Check the result:

```bash
npm run db:status
```

Expected:

```text
Database schema is up to date!
```

### If `db:migrate` fails

- **"drift detected" / "migration was modified":** your database was changed outside of migrations (usually by `npm run db:push`). If your local data is disposable, reset it. **This deletes all local data:**

  ```bash
  npx prisma migrate reset --config prisma7.config.ts
  npm run db:setup
  ```

- **A failed migration is recorded:** fix the cause shown in the error, then mark it rolled back and run setup again:

  ```bash
  npx prisma migrate resolve --rolled-back <migration_name> --config prisma7.config.ts
  npm run db:setup
  ```

## 8. Verify Database Setup

You can inspect the database with pgAdmin. After seeding, these tables should contain data:

- `tbl_role`, `tbl_permission`, `tbl_role_permission`, `tbl_user_account`
- `tbl_admission_stage`, `tbl_admission_cycle`, `tbl_passing_score_setting`
- `tbl_district`, `tbl_barangay`, `tbl_branch`, `tbl_program`, `tbl_school`

## 9. Run TANAW

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Log in with the SYSTEM_ADMIN account or a test account.

---

## Important Notes

- **Never use `npm run db:push` or `npm run db:pull` on a shared schema.** They bypass migrations and cause drift for everyone. Schema changes must be made with a new migration (`npx prisma migrate dev --create-only --name <change> --config prisma7.config.ts`, review the SQL, then commit it).
- Commit the migration folder, `prisma/schema.prisma`, the `generated/prisma` output, and seeder changes together so others can reproduce the update.
- Never edit or delete a migration that has already been pushed; add a new one instead.
- Do not run `prisma migrate reset` on a database containing data you want to preserve.
- **Audit log:** database triggers record every insert, update, delete and truncate in `tbl_audit_log` (User Management → Audit Log). A migration that creates a new table must end with `SELECT tanaw_audit_attach('"tbl_new_table"');` (or `SELECT tanaw_audit_attach_all();`), or changes to that table will not be logged. Entries are tamper-proof: once committed they cannot be edited or deleted (a retention clean-up must first run `SELECT set_config('tanaw.audit_maintenance', 'on', true);` in its transaction).
- Do not commit `.env` or share actual passwords and secrets.
- Each developer maintains their own local PostgreSQL database; data (accounts, applicants) is not shared through Git. Use the seeders to get the same baseline.
