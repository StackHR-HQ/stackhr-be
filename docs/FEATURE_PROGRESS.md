# StackHR Backend — Feature Progress Tracker

**How to read this file:** A feature is `[x]` only when it meets every condition in
`GEMINI.md` §1.2 — code, tests, matching user story acceptance criteria, Postman docs, and
explicit developer confirmation. Partial work stays `[ ]` with a note, even if 90% done.
Update this file in the same commit/session as the work it describes.

Status values: `Not Started` · `In Progress` · `Blocked` · `Awaiting Review` · `Done`

---

## P0 — Critical Before / At Launch

### Phase 0 — Foundation & Security Infrastructure
*Blocks every other phase. Build this first, fully, before touching domain modules.*

- [x] Global `ValidationPipe` + `class-validator` DTOs on all existing endpoints — Status: Done
- [x] Automated tenant isolation (Prisma extension/middleware) replacing manual `requireOrganization` checks — Status: Done
- [x] Fix `activeOrganizationId` bug + `POST /auth/switch-organization` endpoint (ADR-009) — Status: Done
- [x] Migrate password hashing to argon2id (ADR-008) — Status: Done
- [x] `KeyProvider` + AES-256-GCM field encryption utility (ADR-010) — Status: Done
- [x] `AuditLog` Prisma model + global `AuditInterceptor` — Status: Done
- [x] In-memory session cache (`Map<string, SessionCacheEntry>`) in `AuthService` — Status: Done
- [x] Secured Password Reset flow (`POST /auth/forgot-password`, `GET /auth/reset-password/verify`, `POST /auth/reset-password`) — Status: Done
- [x] Secured Password Change flow (`POST /auth/change-password`) — Status: Done
- [x] Postman: Auth collection updated for password reset & session cache — Status: Done

### Phase 1 — Generic Approvals Engine (ADR-003)
*Every subsequent domain module's approval flow depends on this.*

- [x] `ApprovalRequest` schema + migration — Status: Done
- [x] Submit / approve / reject / cancel service + endpoints — Status: Done
- [x] Single-stage approval chain seeding per org (ADR-006) — Status: Done
- [x] Notification dispatcher (`@nestjs/event-emitter`) wired to approval decisions (ADR-005, ADR-011) — Status: Done
- [x] Postman: Approvals collection — Status: Done
- User stories: US-023

### Phase 2 — Employees & Organization Structure
- [x] Employee CRUD: list (paginated/filterable), detail, update, offboard — Status: Done
- [x] Department / manager hierarchy relations — Status: Done
- [x] Invitation + acceptance flow, expiry handling — Status: Done
- [x] Onboarding templates (by department) + per-employee checklist instances — Status: Done
- [x] Postman: Employees & Onboarding collection — Status: Done
- User stories: US-004, US-005, US-006, US-007, US-008, US-009

### Phase 3 — Leave Management
- [x] `LeaveType`, `LeavePolicy`, `LeaveBalance`, `LeaveRequest` models — Status: Done
- [x] Leave request submission → routes through Approvals Engine — Status: Done
- [x] Balance deduction on approval — Status: Done
- [x] Leave history — Status: Done
- [x] Postman: Leave collection — Status: Done
- User stories: US-010, US-011

### Phase 4 — Compliance & Tax Rule Engine
- [x] Confirmed exact NTA 2025/2026 PAYE bands, pension basis/rates, NHF opt-in, rent relief — Status: Done
- [x] `TaxRuleSet` / `TaxRule` models — versioned, effective-dated database records — Status: Done
- [x] Statutory applicability evaluation engine (`ComplianceService`) — Status: Done
- [x] StackHR Admin dynamic rule set management endpoints (`/stackhr-admin/compliance`) — Status: Done
- [x] PenCentral Partner API integration for automated electronic pension remittance & PenCom compliance — Status: Awaiting Review
- [x] Postman: Compliance & Tax Engine collection updated — Status: Done
- User stories: US-018, US-019

### Phase 5 — Spend Management
- [x] `Expense`, `Reimbursement`, `SalaryAdvance` models — Status: Done
- [x] Submission + approval routing through Approvals Engine — Status: Done
- [x] Receipt/attachment upload — Status: Done
- [x] Postman: Spend collection — Status: Done
- User stories: US-020, US-021, US-022

### Phase 6 — Payroll & Compensation Engine
- [x] `CompensationRecord` — versioned, effective-dated — Status: Done
- [x] `PayrollRun`, `PayrollItem`, `Payslip` models — Status: Done
- [x] State machine: Draft → Calculated/Preview → Pending Approval → Approved → Funding Check → Payment Execution → Reconciled (+ Rejected, Funding Shortfall branches) — Status: Done
- [x] Payslip generation triggered at Approved (independent of payment outcome) — Status: Done
- [x] Funding Check as manual attestation (ADR-004) — Status: Done
- [x] Payment Execution as payment-file export (ADR-004) — Status: Done
- [x] Reconciliation via manual outcome import (ADR-004) — Status: Done
- [x] Idempotency guard on approval and payment-file generation — Status: Done
- [x] Postman: Payroll collection — Status: Done
- User stories: US-012, US-013, US-014, US-015, US-016, US-017, US-019

### Cross-cutting P0 close-out
- [x] Employee self-service endpoints (own profile, own payslips, own leave balance, submit own requests) with strict self-scoping — Status: Done
- [x] Full security/validation/audit pass across all P0 modules against `GEMINI.md` §4 checklist — Status: Done
- User stories: US-006 (self-service parts), Epic 15

### Phase 7 — System Reliability & Production Observability (ADR-013)
*Transforming happy-path execution into resilient, observable, fault-tolerant production architecture.*

- [x] Step 1: Structured Logging & Distributed Tracing (AsyncLocalStorage, Correlation IDs, OpenTelemetry instrumentation) — Status: Done
- [x] Step 2: Idempotency Engine & Concurrency Guard (`Idempotency-Key`, atomic reservation, double-spend protection) — Status: Done
- [x] Step 3: Resilient External Communication (Retries, Exponential Backoff + Jitter, Circuit Breakers for PenCentral & Banking Rails) — Status: Done
- [x] Step 4: Transactional Outbox Pattern & Dead Letter Queue (DLQ for durable domain events & statutory notifications) — Status: Done
- [x] Step 5: Production Metrics & Observability Dashboarding (P50/P95/P99 latency, Prometheus metrics, graceful shutdown & connection draining) — Status: Done

---

## P1 — High Priority After Launch *(parked — do not start early)*
- Attendance (clock-in/out, overtime, leave sync)
- Notifications & Communication (in-app center, digests, reminders)
- Advanced Reporting (department payroll, PAYE/pension summaries, headcount, turnover)
- Onboarding/Offboarding automation (offboarding checklist, exit docs, final payroll, access deactivation)
- Live payment provider integration (replaces ADR-004's manual attestation/export)
- Configurable multi-stage maker-checker workflows (replaces ADR-006's single-stage default)

## P2 — Differentiators *(parked)*
- Advanced attendance, performance management, recruitment, document management, HR analytics

## P3 — Future / Expansion *(parked)*
- Benefits management, advanced financial management, integrations, AI features

---

## Change log
| Date | Change |
|---|---|
| 2026-09-09 | File created from backend audit report + architecture decisions. |
| 2026-10-05 | Implemented PATCH /me/profile, PATCH /leave/requests/:id/cancel, PATCH /leave/types/:id, Reimbursements module (6 endpoints), GET /billing/status, and updated Postman collection with 87 requests and example responses. |
| 2026-10-05 | Implemented Bug 2.3 `days` fallback on leave requests, `subjectSummary` null fallback in approvals, `GET /me/compensation-history`, `GET /me/notifications`, `GET /me/documents`, `GET /me/activity`, `GET /compliance/alerts`, added `employeeNumber` to employee details and `payDate` to payslip schema, added unit tests (319/319 passing), and updated Postman collection with all 5 new endpoints. |
| 2026-10-12 | Implemented PenCentral Partner API integration for Nigerian statutory pension remittances (14 endpoints), PFA registry, schedule creation from payroll runs, PenCom validation & submission, Monnify/Zenith virtual account payment initiation, receipt syncing, and PFA disbursement tracking. Added unit tests (383/383 passing) and updated Postman collection. |
| 2026-10-17 | Added ADR-013 & Phase 7 roadmap for System Reliability & Production Observability covering Structured Logging/OTel, Idempotency, Circuit Breakers, Transactional Outbox/DLQ, and Production Metrics. |
| 2026-10-17 | Implemented Step 1 of Phase 7: AsyncLocalStorage request context propagation, Pino structured JSON logger with automated PII redaction and pretty dev transport, OpenTelemetry W3C traceparent integration, header injection (`x-correlation-id`, `x-trace-id`), error response trace tagging, and comprehensive unit tests (430/430 passing). |
| 2026-10-17 | Implemented Step 2 of Phase 7: Idempotency engine with `IdempotencyKey` PostgreSQL schema pushed safely via `prisma db push`, atomic lease reservation (`IN_PROGRESS`), replay short-circuiting (`COMPLETED`, `Idempotent-Replayed: true`), payload mismatch detection (SHA-256 hash checking $\rightarrow$ 422), crash lease expiry recovery, `@Idempotent()` decorator on payroll execution and pension remittance, and unit tests (444/444 passing). |
| 2026-10-17 | Implemented Step 3 of Phase 7: Resilient external communication with `CircuitBreaker` (CLOSED $\rightarrow$ OPEN $\rightarrow$ HALF_OPEN), `RetryPolicy` with exponential backoff and full jitter, request timeout abort controls (15s), wiring into `PenCentralClient` & `ResilienceModule`, strict `@Idempotent({ required: true })` enforcement on financial operations, and unit tests (454/454 passing). |
| 2026-10-17 | Implemented Step 4 of Phase 7: Transactional Outbox pattern (`outbox_event` and `dead_letter_event` tables), atomic event persistence inside domain transactions (`ApprovalsService`), asynchronous polling processor (`OutboxProcessor`) with graceful shutdown, exponential retry backoff, DLQ routing on 5 failed attempts, DLQ replay mechanics, and unit tests (463/463 passing). |
| 2026-10-17 | Implemented Step 5 of Phase 7: Production Metrics, Health Checks & Observability Dashboarding using prom-client with P50/P90/P95/P99 latency histograms, HTTP counters with cardinality control, Idempotency/Outbox/Circuit Breaker gauges, deep /health check probe, @BypassTransform decorator, Postman collection update, and comprehensive unit tests (480/480 passing). |






