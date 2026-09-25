# StackHR Backend — Architecture Decision Log

Status legend: **Accepted** = build to this. **Proposed** = under discussion, don't build yet.
Each entry is dated because tax/compliance decisions in particular may need revisiting.

---

### ADR-001 — Modular monolith, bounded-context modules
**Status:** Accepted — 2026-09-09
**Context:** Single backend developer, pre-revenue-scale product, no current need for
independent scaling or deployment of individual domains.
**Decision:** Single NestJS deployable. Domain modules (Employees, Leave, Payroll,
Compliance, Spend, Approvals) never import each other's repositories/Prisma models
directly. Cross-module communication happens via exported services or domain events.
**Consequence:** Slightly more ceremony than a flat structure, but each module boundary is
the exact seam to cut along if/when a module needs to become its own service.

### ADR-002 — Multi-tenancy: shared Postgres, structural isolation
**Status:** Accepted — 2026-09-09
**Context:** Audit found tenant isolation enforced only via manual per-service checks
(`requireOrganization`), with a live bug where `user.memberships[0]` is used instead of
`Session.activeOrganizationId`.
**Decision:** Every tenant-scoped table keeps an `organizationId` column. Isolation must be
enforced structurally — a Prisma Client Extension or middleware that injects/verifies
`organizationId` on every query — not left to individual service authors to remember.
**Consequence:** One piece of infrastructure to build once (Phase 0), after which it is
architecturally difficult to write a query that leaks across tenants.

### ADR-003 — Approvals: single generic polymorphic engine
**Status:** Accepted — 2026-09-09
**Context:** Leave, Expenses, Reimbursements, Salary Advances, and Payroll all need
approval workflows, and the product UI already renders them in one unified inbox.
**Decision:** One `ApprovalRequest` table: `id, organizationId, type, subjectTable,
subjectId, requesterId, approverId, status, amountSnapshot, metadata, submittedAt,
decidedAt`. Domain modules create rows here; they never build their own approval
status/approver fields.
**Consequence:** New approvable types (e.g. payroll, added after initial design) require
zero changes to the inbox, counts, or history queries — only a new `type` value and a row
insert from the owning module.

### ADR-004 — Financial operations: manual attestation for P0, live payments deferred
**Status:** Accepted — 2026-09-09
**Context:** The priority doc does not list payment-provider integration as P0; the user
stories assume it exists. Real disbursement requires picking/integrating a licensed
provider, webhook handling, and idempotency — real scope, not a subtask.
**Decision:** The payroll run state machine keeps real `Funding Check` and `Payment
Execution` states at P0, but they are satisfied by human action: an admin attests funds are
available, and the system generates a payment file (CSV/bank-upload format) rather than
calling a provider API. `Reconciled` is populated by manual import of per-employee outcomes.
**Consequence:** The `PaymentRecord` schema is designed for provider-driven writes from day
one. P1's real integration replaces *who writes to the table* (a webhook vs. a human) —
no schema or downstream (payslip, reconciliation report) changes required.

### ADR-005 — Notifications: generic dispatcher now, one template at P0
**Status:** Accepted — 2026-09-09
**Context:** "Notifications & Communication" is P1 in the priority doc, but several P0
acceptance criteria require "employee is notified of the decision."
**Decision:** Build the event-driven notification dispatcher at P0 (it reuses the same
domain events the audit log consumes) but only implement the approval-decision → email
template. In-app Notification Center, digests, and reminders are P1.
**Consequence:** P1 adds templates and an in-app surface to an existing pipe; it does not
build the pipe from scratch.

### ADR-006 — Maker-checker: extensible schema, single-stage behavior at P0
**Status:** Accepted — 2026-09-09
**Context:** Configurable multi-stage approval workflows (US-024) are a full epic; the
priority doc only names a fixed "payroll approval workflow" as P0.
**Decision:** `ApprovalRequest`/approval-chain schema supports ordered stages from day one.
At P0, every organization is seeded with exactly one system-default stage per request type.
No admin-facing workflow configuration UI ships at P0.
**Consequence:** Correct extensible data shape without spending P0 time on a
workflow-builder UI that isn't required for launch.

### ADR-007 — Auth: keep DB session tokens, not JWT
**Status:** Accepted — 2026-09-09
**Context:** Audit flagged DB session lookups on every request as a deviation from a
"target" JWT approach that was only ever a placeholder assumption, not a hard requirement.
**Decision:** Keep the existing `Session` table + opaque token model. Immediate revocation
is a real security property worth keeping for a product handling salary/bank data; the
DB-hit cost is negligible at current scale.
**Fix required (not a rewrite):** `toAuthenticatedUser` must resolve tenant context from
`Session.activeOrganizationId`, not `user.memberships[0]`.

### ADR-008 — Password hashing: migrate to argon2id
**Status:** Accepted — 2026-09-09
**Context:** Current implementation uses Node's `crypto.scrypt` with a custom serialization
format. Cryptographically sound but non-standard and harder to audit.
**Decision:** Migrate to the `argon2` npm package (argon2id variant) now, while the real
user base with hashed passwords is near-zero — this is the cheapest point in the product's
life to make this change.

### ADR-009 — Multi-org switching: explicit endpoint, session-based
**Status:** Accepted — 2026-09-09
**Decision:** `POST /auth/switch-organization` verifies the caller is a member of the
target org, then writes `activeOrganizationId` onto the session server-side. No endpoint
trusts a client-supplied `X-Organization-Id` header as tenant context.
**Consequence:** Tenant context is resolved once per switch, not re-validated via a
spoofable header on every request.

### ADR-010 — Field encryption: app-level AES-256-GCM behind a KeyProvider interface
**Status:** Accepted — 2026-09-09
**Decision:** Salary, bank account details, and tax ID/TIN are encrypted at rest using
AES-256-GCM, with the key accessed through a `KeyProvider` abstraction (not inline
`process.env` reads scattered through services). MVP implementation reads the key from an
environment variable.
**Consequence:** Swapping to AWS KMS/Vault later is a new `KeyProvider` implementation, not
a rewrite of every place that touches sensitive fields.

### ADR-011 — Event bus: in-memory `@nestjs/event-emitter` for now
**Status:** Accepted — 2026-09-09
**Decision:** Domain events (audit logging, notification dispatch) use NestJS's built-in
in-memory event emitter. No Redis/BullMQ at P0.
**Revisit when:** payment-provider webhook processing needs retries (P1), or the backend
needs to run more than one instance. Either is a concrete, checkable trigger — not a
"someday."

---

### ADR-012 — NTA 2025/2026 Tax Engine & Dynamic Rule Set Architecture
**Status:** Accepted — 2026-09-09
**Context:** Confirmed Nigeria Tax Act 2025/2026 statutory rates and requirement for admin-updatable tax rules without backend code deployments.
**Decision:**
1. **PAYE Bands:** 0% (first ₦800k), 15% (next ₦2.2m), 18% (next ₦9.0m), 21% (next ₦13.0m), 23% (next ₦25.0m), 25% (above ₦50.0m).
2. **Rent Relief:** Replacing CRA. Formula: `min(20% of declared rent paid, ₦500,000)`. Default is ₦0 unless declared.
3. **Pension:** 8% Employee, 10% Employer on Basic + Housing + Transport (BHT) default, with configurable org overrides.
4. **NHF:** 2.5% of Basic Salary, voluntary opt-in toggle (`nhfOptIn`), default false.
5. **Versioned Engine:** Stored as effective-dated `TaxRuleSet` / `TaxRule` records managed via StackHR Admin endpoints (`/stackhr-admin/compliance`).
