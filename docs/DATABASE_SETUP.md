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

## 5. Apply Database Migrations

Run:

```bash
npx prisma migrate deploy --config prisma7.config.ts
```

This applies all pending migrations in `prisma/migrations` to your local PostgreSQL database.

The migrations create the required database tables, relationships, constraints, and other schema changes.

## 6. Generate the Prisma Client

Run:

```bash
npx prisma generate --config prisma7.config.ts
```

This generates the Prisma Client based on the current database schema.

## 7. Seed the Database

Run:

```bash
npm run db:seed
```

The seeder initializes:

- Five system roles:
  - SYSTEM_ADMIN
  - PRESIDENT
  - ADMISSION
  - REGISTRAR
  - GUIDANCE
- Sixteen permissions covering the configured modules.
- Role-permission assignments.
- The initial SYSTEM_ADMIN account, if it does not already exist.

The seeder uses `SYSTEM_ADMIN_PASSWORD` from `.env`.

## Important: If a SYSTEM_ADMIN account already exists, the seeder skips account creation. It does not reset or change the existing account's password.

## 8. Create Test Accounts (Optional)

To create the four test accounts, run:

```bash
npx tsx scripts/create-test-users.ts
```

The script uses `TEST_USER_PASSWORD` from `.env`.

It creates or updates the following accounts:

| Account        | Username                   | Role      |
| -------------- | -------------------------- | --------- |
| Test President | test.president@example.com | PRESIDENT |
| Test Admission | test.admission@example.com | ADMISSION |
| Test Registrar | test.registrar@example.com | REGISTRAR |
| Test Guidance  | test.guidance@example.com  | GUIDANCE  |

The email addresses are temporarily used as usernames.

Test-user creation is disabled in production.

## 9. Verify Database Setup

Check migration status:

```bash
npx prisma migrate status --config prisma7.config.ts
```

Expected result:

```text
Database schema is up to date!
```

You can also inspect the database using pgAdmin.

Verify that the following tables contain the expected data:

- `tbl_user_account`
- `tbl_role`
- `tbl_permission`
- `tbl_role_permission`

## 10. Run TANAW

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

You can now log in using your configured SYSTEM_ADMIN or test account credentials.

---

## Important Notes

- Always apply pending migrations before running the seeder.
- Run the seeder after migrations when setting up a new local database.
- Do not run `prisma migrate reset` on a database containing data you want to preserve.
- Do not commit `.env` or share actual passwords and secrets.
- Commit new Prisma migrations and seeder changes so other developers can reproduce database updates.
- The official-account migration only copies the five specified accounts if matching records exist in the legacy `User` table. It does not automatically copy accounts from another developer's separate local database.
- Each developer maintains their own local PostgreSQL database.
