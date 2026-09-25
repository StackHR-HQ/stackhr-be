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
- [x] Postman: Auth collection updated for switch-organization endpoint — Status: Done

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
