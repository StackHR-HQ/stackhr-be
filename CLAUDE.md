# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`stackhr-be` is the backend for **StackHR** — an HR/payroll/spend management platform for African SMEs ("BambooHR + Rippling + Bujeti for African SMEs"). It serves both business users and StackHR platform administrators. Use `StackHR-MVP-Technical-Specification-aligned.md` at the repo root for full product/domain context (roles, payroll architecture, MVP scope, roadmap) before designing new modules.

Stack: NestJS 11, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL. Authentication is first-party (argon2 password hashing, DB-backed sessions, HTTP-only cookies and bearer tokens). Better Auth and Supabase are **not** used, despite the `init_better_auth` migration name and the Supabase skills in `.agents/skills/`.

## Commands

- Install deps: `pnpm install` (runs `prisma generate` via `postinstall`; client is generated into `generated/prisma`, not `node_modules`)
- Local Postgres: `docker compose up postgres` (matches the default `DATABASE_URL` in `.env.example`); copy `.env.example` to `.env` first
- Dev server (watch mode): `pnpm run start:dev` · debug: `pnpm run start:debug`
- Build / prod start: `pnpm run build` → `pnpm run start:prod` (entry is `dist/src/main.js`)
- Lint (auto-fix): `pnpm run lint` · Format: `pnpm run format`
- Typecheck (CI runs this separately): `pnpm exec tsc --noEmit`
- Unit tests: `pnpm run test` · watch: `pnpm run test:watch` · coverage: `pnpm run test:cov`
- Single test file: `pnpm exec jest path/to/file.spec.ts` · by name: `pnpm exec jest -t "test name"`
- E2E: `pnpm run test:e2e` (`test/jest-e2e.json`; specs in `test/*.e2e-spec.ts`)
- Prisma: `pnpm run db:migrate` (`prisma migrate dev`), `db:generate`, `db:push`, `db:studio`. Re-run `db:generate` after any `schema.prisma` change.

CI (`.github/workflows/dev-ci.yml`, `main-ci.yml`) runs typecheck, lint, unit tests, and build; `main` also deploys. `postman-sync.yml` syncs the Postman collection.

## Architecture

Modular monolith (ADR-001 in `docs/DECISIONS.md`): one deployable, one module per bounded context under `src/` (auth, organizations, employees, people, onboarding, invitations, leave, approvals, payroll, pension, compliance, spend, billing, banking, audit, notifications, me, waitlist, stackhr-admin). Domain modules must not reach into each other's Prisma models — go through exported services or domain events (`@nestjs/event-emitter`; see `*.listener.ts`, `banking/events`, `approvals/events`).

- **Entry/bootstrap** (`src/main.ts`): global prefix `v1/api` (excluded: `/metrics`, `/health`, banking webhook), global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` (DTOs must declare every accepted field), `helmet`, raw-body capture for webhook signature verification, CORS from hardcoded dev/prod origin lists plus `FRONTEND_URL`. Listens on `PORT` (default 3001 in docs/compose), `0.0.0.0`.
- **Request pipeline** (wired in `src/app.module.ts`): `RequestContextMiddleware` (AsyncLocalStorage + traceparent) → `ThrottlerGuard` → auth/roles guards (`src/auth`: `AuthGuard`, `RolesGuard`, `@RequireRoles`) → interceptors `Metrics`, `Tenant`, `Idempotency`, `Audit`, `Transform` → `GlobalExceptionFilter`. Responses are wrapped by `TransformInterceptor` (opt out with the bypass decorator in `src/common/interceptors`).
- **Tenant isolation is application-level, not Postgres RLS.** `TenantInterceptor` puts `organizationId` from the session into an AsyncLocalStorage (`src/database/tenant-context.ts`). `PrismaService` (`src/database/prisma.service.ts`) wraps the client in a Proxy that routes models listed in `TENANT_SCOPED_MODELS` through an extension that injects/forces `organizationId` on reads, writes, and creates. Consequences:
  - **A new org-owned model must be added to `TENANT_SCOPED_MODELS`** or it is unscoped.
  - Background work (outbox, listeners, webhooks) has no request tenant; use `runWithTenantContext` / `runBypassingTenantContext` deliberately.
  - Raw queries and nested/relation reads are not auto-scoped.
  - `tenant-isolation.spec.ts` covers this; keep it passing.
- **Reliability layer** (`src/common`): `idempotency` (header-keyed leases with replay; apply to money-moving endpoints), `outbox` (transactional outbox with a polling processor, retries, dead-letter table — pass the `prismaTx` into `OutboxService.createEvent` so the event commits atomically with the change), `resilience` (circuit breaker + retry/backoff `ResilientClient`, use for third-party calls), `metrics` (Prometheus at `/metrics`), `telemetry`, `logger` (pino with PII/credential redaction).
- **External integrations**: Anchor BaaS (banking, virtual accounts, cards, payroll disbursement; webhook guarded by signature + `ANCHOR_WEBHOOK_SECRET`) in `src/banking/anchor`; PenCentral (Nigerian pension remittance) in `src/pension`; SendByte (email) in `src/notifications`; S3/Cloudflare R2 for documents and payslips. All keys are in `.env.example`, which documents which are required vs. optional in dev.
- **Platform admin vs. business workspace**: StackHR Admin is a cross-tenant surface (`src/stackhr-admin`, `User.userType`), not an org role. Bootstrapped from `STACKHR_ADMIN_*` env vars.

## Conventions and gotchas

- Unit specs (`*.spec.ts`) live next to the code (jest `rootDir: "src"`, config inline in `package.json`); `test/` is e2e only. Prettier: single quotes, trailing commas.
- TypeScript: `nodenext` resolution, decorators on, `strictNullChecks` on but `noImplicitAny` off. ESLint deliberately allows `any` and downgrades floating promises / unsafe args to warnings — don't tighten without discussion.
- `BigInt` is JSON-serialized as `Number` (polyfilled in `main.ts` and `prisma.service.ts`); watch precision on money values.
- Only two migrations exist (`init_better_auth`, `custom_auth`); the schema has grown beyond them, so check whether a new migration is needed rather than assuming `db push` state.
- `docs/DECISIONS.md` (ADRs), `docs/FEATURE_PROGRESS.md`, `docs/product/*` (user stories, priorities), and `docs/postman/StackHR.postman_collection.json` are the working record. `GEMINI.md` describes a workflow where a feature isn't done until it has tests, Postman docs for each new endpoint, and explicit developer confirmation — follow that when adding endpoints.

## Skills to load before writing code

Project skills live in `.agents/skills/` (tracked in `skills-lock.json`); load the relevant one first:

- **nestjs-best-practices** — any Nest module, controller, service, guard, or DI wiring.
- **prisma-client-api** / **prisma-cli** — queries, schema changes, and migrations (Prisma 7).
- **tdd** — this repo follows red-green TDD: confirm test seams with the user before writing tests, one seam/test/implementation per cycle, no bulk test-then-implement.
- supabase-*, better-auth-best-practices — not applicable (auth and DB access are in-house); ignore unless that changes.

## Domain constraints to carry into design

- **Every organization-owned table carries `organizationId`** and must be tenant-scoped as described above (the spec's "RLS" goal is currently met by the Prisma extension; don't rely on per-service checks alone).
- **Payroll is rule-based, not hardcoded**: calculation logic, jurisdiction tax rules, org configuration, statutory-contribution applicability, and audit/version info are separate concerns, so tax-law changes are data updates, not code rewrites. Tax rule version and payroll engine version are tracked separately.
- **Statutory contributions are computed, not assumed** — applicability (mandatory/voluntary/not_applicable) derives from org profile (sector, employee count, exemptions).
- Roles are **Admin / Manager / Employee**; access is purely role-based (tier-based feature gating is explicitly deferred).
- Scale on measured bottlenecks; don't introduce microservices preemptively.
