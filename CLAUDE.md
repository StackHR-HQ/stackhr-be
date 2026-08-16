# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`stackhr-be` is the backend for **StackHR** — an HR/payroll/spend management platform for African SMEs ("BambooHR + Rippling + Bujeti for African SMEs"). The repo currently contains only the unmodified NestJS starter scaffold (`AppController`/`AppService`/`AppModule`) — real domain modules have not been built yet. Use `StackHR-MVP-Technical-Specification-aligned.md` at the repo root for full product/domain context (roles, payroll architecture, MVP scope, roadmap) before designing new modules.

Note: that spec describes an existing separate production app (React+Vite frontend, NeonDB, BetterAuth, Vercel). The skills installed in this repo (`better-auth`, `supabase-postgres`, `supabase-server`) indicate this backend is being built against **Supabase** (Postgres + auth), not NeonDB directly — confirm the intended stack with the user before assuming parity with the spec's "Current Stack" table.

## Commands

- Install deps: `pnpm install` (pnpm is the package manager — `pnpm-lock.yaml` is present)
- Dev server (watch mode): `pnpm run start:dev`
- Debug (watch mode + inspector): `pnpm run start:debug`
- Build: `pnpm run build`
- Production start (after build): `pnpm run start:prod`
- Lint (auto-fix): `pnpm run lint`
- Format: `pnpm run format`
- Unit tests: `pnpm run test`
- Watch unit tests: `pnpm run test:watch`
- Single test file: `pnpm exec jest path/to/file.spec.ts`
- Single test by name: `pnpm exec jest -t "test name"`
- Coverage: `pnpm run test:cov`
- E2E tests: `pnpm run test:e2e` (uses `test/jest-e2e.json`; specs live in `test/*.e2e-spec.ts`)

## Architecture notes

- Standard Nest structure: `src/main.ts` bootstraps `AppModule` via `NestFactory`, listening on `process.env.PORT` (falls back to 3000).
- Unit test config lives inline in `package.json` (`jest` key) with `rootDir: "src"` — new `*.spec.ts` files should sit next to the code they test, not in a separate `test/` tree. `test/` is reserved for e2e specs only.
- TypeScript config: `nodenext` module resolution, decorators enabled (`emitDecoratorMetadata`, `experimentalDecorators`), `strictNullChecks` on but `noImplicitAny` off. ESLint has `@typescript-eslint/no-explicit-any` turned off and treats floating promises / unsafe arguments as warnings, not errors — don't tighten these without discussion, they're deliberate for this codebase.
- Env vars currently defined in `.env`: `PORT`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL` (`DATABASE_URL` is present but commented out).

## Skills to load before writing code

This repo ships project-level skills under `.agents/skills/` (tracked in `skills-lock.json`). Load the relevant one before touching the corresponding area — they encode non-obvious rules, not general framework docs:

- **nestjs-best-practices** — before writing/reviewing any Nest module, controller, service, guard, or DI wiring.
- **supabase-postgres-best-practices** — before any schema/migration/RLS/index/SQL work, even a one-column change.
- **supabase-server** — before writing server-side code that creates Supabase clients or verifies inbound auth (uses the `auth: 'user'|'publishable'|'secret'|'none'` API, not legacy `anon`/`service_role` keys).
- **better-auth-best-practices** — if/when Better Auth is wired into this backend.
- **tdd** — this repo follows red-green TDD: confirm test seams with the user before writing tests, one seam/test/implementation per cycle, no bulk test-then-implement.

## Domain context to carry into design decisions

From the product spec, these are load-bearing constraints for any backend work in this domain (not just payroll):

- **Multi-tenancy is `org_id`-scoped on every organization-owned table**, enforced via Postgres RLS — never rely on application-layer checks alone for tenant isolation.
- **Payroll is rule-based, not hardcoded**: calculation logic, jurisdiction tax rules, org configuration, statutory-contribution applicability, and audit/version info are deliberately separate concerns so tax-law changes are data updates, not code rewrites. Tax rule version and payroll engine version are tracked separately.
- **Statutory contributions are computed, not assumed** — applicability (mandatory/voluntary/not_applicable) is derived from org profile (sector, employee count, exemptions), not a fixed default.
- Roles are **Admin / Manager / Employee**, access is purely role-based (no tier-based feature gating yet — explicitly deferred).
- Scaling principle from the spec: preserve the current architecture and scale based on measured bottlenecks rather than pre-building for hypothetical scale (e.g. don't introduce microservices preemptively).
