# Cardora — VCF Contact Collections

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply PostgreSQL migrations from `drizzle/postgres`. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

Cardora account login uses email/password with scrypt hashes and revocable database sessions. Per-owner Gmail authorization remains a separate Google OAuth integration.

## Account verification

- Sign-up requires an international phone number. Kenyan numbers (`+254`) verify with an SMS one-time code; other countries verify the account email with a time-limited link. SMS campaign access remains limited to verified Kenyan numbers.
- Configure `BREVO_API_KEY` and a verified sender in `BREVO_SENDER_EMAIL` to send email verification. Set `APP_URL` to the public site origin (for example `https://cardora.wolvarex.com`) so verification links return to the correct host. `CARDORA_PUBLIC_ORIGINS` can also provide the public origin.
- Set those values in the local ignored `.env` and the production environment file. `.env.example` contains variable names and safe placeholders only. Without mail delivery configured, sign-up outside Kenya is disabled with a clear message.
- Run `pnpm db:migrate` to add the email-verification timestamp and one-time token table before deploying this change.

## Authentication rollout

- Cardora uses PostgreSQL. Apply migrations in `drizzle/postgres` with `pnpm db:migrate` before serving the application. The root-level SQL files are historical MySQL migrations and must not be applied to PostgreSQL.
- Public sign-up never links to a pre-existing account by email. Existing owners may be enabled separately by an operator on the production VPS with `pnpm exec tsx scripts/migrate-legacy-email-account.ts`. The script requires the exact legacy user ID and matching stored email, refuses duplicate/ambiguous identities, hides password entry, and asks for an explicit typed confirmation. It updates only `emailAuthEmail` and `passwordHash` on that account row.
- Do not run the legacy account migration as part of application startup or deployment. Operators should point `DATABASE_URL` at the intended PostgreSQL database and run the script once for each deliberately selected account.

## Subscriptions and quotas

- The seeded Free plan allows **100 accepted contacts across all of an owner's collections** and **5 retained collection links**. Each link keeps its own contact limit too. Lowering a plan preserves existing data and blocks further additions until usage is within the new limits.
- Administrators can edit plan names, descriptions, contact/link quotas, prices and statuses, and can manually assign a plan to an owner in **Admin → Subscriptions**. Owners can review their current plan and usage in **Plan & usage**.
- Paid self-service checkout is not enabled yet. The Paystack production flow is pending the final renewal-method choice and production-only server credentials/webhook setup. No payment is collected in Preview; never place a Paystack secret in browser code.

`server/_core/publicConfig.ts` exposes only named public runtime values. Private keys stay server-side. The platform serves managed `/manus-storage/` assets; the application does not register a second proxy.

Platform configuration is readable and editable through `webdev.config`. Default settings are initial values, not enforced constraints. The agent may modify the files, commands and configuration or follow the flexible guide for another stack.
