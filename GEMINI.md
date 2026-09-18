# GEMINI.md — StackHR Backend Agent Operating Guide

This file governs how you (the coding agent) work on this repository. Read it in full before
starting any session. If anything here conflicts with a request from the developer in chat,
the developer's live instruction wins for that task — but flag the conflict rather than
silently overriding this file.

You are building the backend for StackHR — a multi-tenant People/Payroll/Spend platform for
African SMEs. The frontend already exists and is live; you are building the API it will
consume. A frontend developer is waiting on your endpoints, which is why Postman
documentation is not optional polish — it is how integration actually happens.

---

## 1. The working agreement (non-negotiable)

1. **One feature at a time.** Do not start a second feature while the first is incomplete.
   "Incomplete" includes: code written but untested, tests written but not passing, logic
   correct but no Postman docs, or Postman docs written but the feature doesn't yet satisfy
   its linked user story's acceptance criteria.
2. **A feature is only marked done in `docs/FEATURE_PROGRESS.md` when all of the following
   are true simultaneously:**
   - Code implemented and matches the architecture in `docs/DECISIONS.md`
   - Unit and/or integration tests written and passing
   - The feature satisfies every acceptance criterion of its linked user story in
     `docs/product/business-user-stories.md`
   - A Postman request (or folder of requests) exists in
     `docs/postman/StackHR.postman_collection.json` covering every new endpoint, with
     example request bodies and example success/error responses
   - The developer has explicitly confirmed it in chat — you do not self-certify
3. **You do not make major decisions unilaterally.** See §2 for what counts as major.
   When in doubt, ask — a clarifying question costs one message; an undone wrong decision
   costs a rebuild.
4. **You always explain what you did and why**, in plain language, before or alongside any
   code change — not just a diff with no narration. Assume the developer wants to
   understand the system, not just receive working code. If you made a judgment call on
   something small (a variable name, a folder placement), say so briefly; don't stay silent
   about it and don't over-explain trivial things either.
5. **Read-before-write, every session.** Before touching a module, re-read the relevant
   section of `docs/DECISIONS.md` and `docs/FEATURE_PROGRESS.md` so you don't reintroduce
   a pattern that was already rejected.

---

## 2. What counts as a "major decision" (always ask first)

Ask the developer before:
- Adding any new npm dependency (including dev dependencies for testing/tooling)
- Changing the database schema in any way not already specified by an accepted decision
  in `docs/DECISIONS.md`
- Touching authentication, session, or password-hashing logic
- Anything related to money movement — payment execution, funding checks, reconciliation
- Deviating from the generic polymorphic Approvals Engine for any request type (leave,
  expense, reimbursement, salary advance, payroll) — there is never a "just this once,
  a dedicated table is simpler" exception
- Changing how tenant isolation is enforced
- Integrating any third-party service (email, storage, payments, KMS) not already wired in
- Anything affecting the payroll run state machine's states or transitions
- Anything that would take more than ~1-2 hours to undo if it turned out wrong

You do **not** need to ask before: writing tests, writing Postman docs, fixing an obvious
bug within a feature you're already implementing, or asking clarifying questions.

---

## 3. Reference documents (check these before acting)

| File | Purpose |
|---|---|
| `docs/DECISIONS.md` | Accepted architectural decisions (ADR log). Settled — don't re-litigate. |
| `docs/FEATURE_PROGRESS.md` | Source of truth for what's done, in progress, or not started, by priority tier. |
| `docs/product/business-user-stories.md` | Full user stories + acceptance criteria. Every feature must trace to one. |
| `docs/product/feature-priority-list.md` | P0/P1/P2/P3 tiering and the reasoning behind it. |
| `docs/postman/StackHR.postman_collection.json` | Living Postman collection. One collection, folders per module. |

---

## 4. Security & validation baseline (applies to every endpoint, no exceptions)

- Every write endpoint uses a typed DTO with `class-validator` decorators. No
  `@Body() body: Record<string, unknown>` and no manual coercion helpers going forward —
  this includes retrofitting endpoints you touch for other reasons.
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` is
  global, in `main.ts`.
- Every tenant-scoped query goes through the tenant isolation mechanism defined in
  `docs/DECISIONS.md` (ADR-002) — never a manually-typed `where: { organizationId }` you
  wrote by hand in a new service.
- Every endpoint that changes state has an explicit role/permission check via guard or
  decorator, not an inline `if` in the service body.
- Every mutation flows through the audit interceptor once it exists (Phase 0) — don't
  hand-write audit log calls per service.
- Sensitive fields (salary, bank details, tax ID/TIN) go through the field encryption
  utility once it exists (Phase 0) — never stored plaintext from that point forward.
- Employees can only ever fetch/modify their own record via self-service endpoints —
  check this explicitly in the guard, don't rely on role checks alone.

---

## 5. Postman documentation convention

- One collection: `docs/postman/StackHR.postman_collection.json`, organized into folders
  matching backend modules (Auth, Employees, Onboarding, Leave, Payroll, Compliance, Spend,
  Approvals, Audit, Notifications, Billing).
- Every request includes: a short description of what it does and who can call it (which
  roles), an example request body, and saved example responses for both success and at
  least one realistic error case (validation failure, permission denied, or not-found).
- Environment file at `docs/postman/StackHR.postman_environment.json` for local dev,
  parameterizing base URL and holding a placeholder session token variable.
- Update the collection in the same work session as the endpoint, not as a later cleanup
  pass — it is part of the feature, not a follow-up task.

---

## 6. Already-resolved decisions (do not re-ask about these)

The developer has already made the calls below. Build to them; don't propose alternatives
unless new information genuinely changes the tradeoff. Full reasoning in `docs/DECISIONS.md`.

- Modular monolith (NestJS), bounded contexts, no cross-module table access
- Multi-tenancy: shared Postgres, `organizationId` column, enforced structurally (not
  per-service discipline)
- Approvals: one generic polymorphic engine for all request types
- Payroll funding/payment execution: manual attestation + exported payment file for P0;
  live provider integration is P1
- Notifications: generic event dispatcher built now, only the approval-decision email
  template ships at P0
- Maker-checker: schema supports ordered multi-stage approval chains; P0 seeds exactly one
  system-default stage per request type, no admin-configurable workflow UI
- Auth: keep DB session tokens, not JWT
- Password hashing: migrate to argon2id
- Multi-org switching: explicit `POST /auth/switch-organization` endpoint, session-based,
  never a client-supplied org header
- Encryption: app-level AES-256-GCM behind a `KeyProvider` interface, env key for MVP
- Event bus: `@nestjs/event-emitter`, in-memory, until a concrete trigger (payment webhooks
  or horizontal scaling) justifies Redis/BullMQ

---

## 7. Nigeria payroll compliance — handle with extra care

Nigeria's tax framework changed materially on 1 January 2026 (Nigeria Tax Act 2025 / NTAA).
Do not implement PAYE, pension, or NHF calculations from general knowledge or a single blog
source — public sources disagree slightly on exact band thresholds. This is flagged as an
explicit blocker in `docs/FEATURE_PROGRESS.md` under the Compliance phase and requires the
developer to confirm exact figures (ideally from FIRS/Nigeria Revenue Service or a tax
advisor) before the tax rule engine is implemented, not just scaffolded.
