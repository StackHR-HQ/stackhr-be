# StackHR Backend — Security Audit Report

| | |
|---|---|
| **Scope** | `stackhr-be` repository (NestJS 11 / Prisma 7 / PostgreSQL), branch `dev` at commit `eb83388` |
| **Audit date** | 2026-10-26 |
| **Method** | Static review of all source, schema, configuration, CI/CD and dependency manifests; non-destructive tooling (`pnpm audit`, `npm audit`, git-history secret pattern scan, existing unit test suite) |
| **Code changes made** | None. No dependencies installed or upgraded, no migrations run, no external systems contacted. |

**Confidence labels used in this report**

- **Confirmed** — the vulnerable code path was traced end to end in source (controller → guard → service → data access). No live exploitation was performed; "Confirmed" means confirmed by code reading, not by a runtime proof of concept.
- **Suspected** — the weakness is visible in code, but exploitability depends on runtime behaviour, deployment configuration or third-party behaviour that could not be verified from the repository.

---

## A. Executive Summary

### Overall posture

StackHR has several good foundations. Passwords use argon2id. Session, invitation and OTP tokens are stored only as hashes. Cookies are HttpOnly and Secure. There is a global whitelisting `ValidationPipe`, Helmet, an HMAC-verified banking webhook, and a newer `/people/*` module whose authorization is consistently correct.

However, the application is **not ready for production from a security perspective**. Several *confirmed* flaws allow ordinary users to escalate privileges, read every colleague's confidential HR and banking data, or cause money to be recorded as paid when it was not, or to be paid to the wrong account.

### Most important risks

1. **Anyone on the internet can become a StackHR platform administrator (SEC-001).** Business signup is open, invitation roles are free-form strings, and platform routes check only the role string. Any self-registered business can invite an address it controls with role `STACKHR_ADMIN`, accept it, set a password via the reset flow, and then edit the **global tax rules that drive PAYE for every tenant**, read the waitlist, and replay other tenants' dead-lettered events.
2. **Any employee can read and modify every employee record in their organization (SEC-002).** The legacy `/employees` API has no role checks and returns full rows, including bank account numbers, TIN, date of birth, address, phone and salary. Any employee can also change colleagues' status, salary, manager and email.
3. **Identity is bound by email address (SEC-005).** Combined with SEC-002, an employee can take over another employee's self-service profile. That lets them redirect the victim's bank details and read their private documents.
4. **Money movement fails open (SEC-003, SEC-004, SEC-006).**
   - Payroll, advances and reimbursements fall back to a **hard-coded placeholder account `0123456789` at bank `000014`** when bank details are missing or unmatched.
   - Transfer failures are swallowed and the record is still marked `EXECUTED`/`PAID`.
   - Reimbursements can be paid **without ever being approved**.
5. **Tenant isolation is application-only and has gaps (SEC-017).** There is no Postgres RLS anywhere, despite the project's own design mandate. The Prisma tenant extension does not cover `findUnique`/`upsert`, interactive transactions, or roughly half of the organization-owned models.

### Business implications

- Exposure of employee PII and salary data across an entire organization, a reportable breach under NDPA 2023 and GDPR where applicable.
- Platform-wide integrity compromise of payroll tax calculations.
- Direct financial loss: salaries paid to wrong or placeholder accounts, unapproved reimbursements, possible double payouts.
- Records showing employees were paid when they were not.

### Audit limitations (summary)

- No runtime testing against a live database; all findings are from static analysis.
- The frontend, the production database and infrastructure (Railway, R2/S3 bucket policies, Postgres roles), and third-party behaviour (Anchor, PenCentral, SendByte) were out of reach.
- 17 of 76 unit test suites could not load locally because packages were missing from `node_modules`.

See section K.

---

## B. System Architecture and Security Boundaries

### Technology stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (Docker `node:20-slim`), optional PM2 cluster (`ecosystem.config.js`, `instances: 'max'`) |
| Framework | NestJS 11 on Express 5 (`@nestjs/platform-express`) |
| ORM / DB | Prisma 7.9 with `@prisma/adapter-pg`, PostgreSQL 16 |
| Auth | First-party: argon2id passwords, opaque random session tokens (SHA-256 hashed in `session.token`), HttpOnly cookie `stackhr_session` **and** bearer token returned in JSON |
| Integrations | Anchor BaaS (virtual accounts, transfers, cards, webhooks), PenCentral (pension remittance), SendByte (email), S3/Cloudflare R2 (documents) |
| Observability | pino logger, Prometheus `/metrics`, OpenTelemetry tracer, DB-backed `audit_log` |
| Deploy | GitHub Actions → `railway up` on push to `main` |

**Architecture:** a modular monolith. There is a single deployable with about 20 domain modules under `src/`, plus a transactional outbox with a 3-second in-process poller.

### Roles derived from code (`src/auth/auth.constants.ts`)

| Role | Surface | Notes |
|---|---|---|
| `BUSINESS_OWNER`, `BUSINESS_ADMIN`, `HR_ADMIN` | Business workspace | Treated identically by every guard list in the codebase ("Org Admin" below) |
| `MANAGER` | Business | Approver role in approvals module; no manager-scope enforcement anywhere |
| `EMPLOYEE` | Business | Self-service |
| `STACKHR_ADMIN`, `STACKHR_SUPPORT` | Platform (cross-tenant) | `organizationId = null`. Gated **only** by role string, never by `userType` |

There is no distinct payroll-admin, contractor or auditor role.

### Request pipeline and enforcement points

```
Client ──► Helmet / CORS / body parsers (json 100kb, urlencoded default)
       ──► RequestContextMiddleware (correlation id, ALS)
       ──► ThrottlerGuard (global, in-memory, keyed on req.ip)
       ──► AuthGuard  (per controller)  → request.user {id, userType, role, organizationId}
       ──► RolesGuard (per controller)  → passes if NO roles declared
       ──► Interceptors: Metrics → Tenant (sets ALS orgId) → Idempotency → Audit → Transform
       ──► Service  ──► PrismaService proxy ──► tenant extension (subset of ops/models) ──► Postgres (no RLS)
```

### Trust boundaries

| # | Boundary | Enforcement found |
|---|---|---|
| TB1 | Internet → API | AuthGuard per controller; several intentionally public routes (auth, invitations, waitlist POST, webhook, `/metrics`, `/health`) |
| TB2 | Business user → other users in same org | RolesGuard role lists and per-service ownership checks. **Inconsistent; see SEC-002, 005, 012, 013, 021** |
| TB3 | Org A → Org B | Prisma tenant extension and hand-written `organizationId` filters. **No RLS; see SEC-017** |
| TB4 | Business user → platform admin | Role string only. **Broken; see SEC-001** |
| TB5 | Anchor → API (webhook) | HMAC-SHA1 over raw body. No replay protection (SEC-019) |
| TB6 | API → Anchor / PenCentral / SendByte / S3 | Env-configured base URLs and global API keys. PenCentral key shared across tenants (SEC-014) |
| TB7 | Background (outbox poller, listeners) → DB | Runs **without** tenant context, so all queries are unscoped |

### Sensitive data inventory (verified in `prisma/schema.prisma`)

| Data | Location | Protection at rest |
|---|---|---|
| Bank account number/name/bank | `Employee.accountNumber`, `accountName`, `bankName`; `OrganizationDepositAccount.accountNumber` | Plaintext |
| Tax / pension identifiers | `Employee.tin`, `pensionRsaNumber`, `pfaCode` | Plaintext |
| DOB, address, phone, personal email, emergency contacts | `Employee.*` | Plaintext |
| Salary and compensation | `Employee.salaryAmount`, `annualSalaryMinor`, `CompensationRecord`, `PayrollItem`, `Payslip` | Plaintext |
| Leave reasons (may contain health data) | `LeaveRequest.reason` | Plaintext |
| Documents (contracts, IDs) | S3/R2 `organizations/<org>/documents/<uuid>` | Bucket config not verifiable |
| Credentials | `User.passwordHash` (argon2id), `Session.token` (SHA-256), `Invitation.tokenHash`, `Verification.value` (hashed) | Good |
| Audit payloads | `AuditLog.payload` | Plaintext, **includes passwords for change-password (SEC-010)** |

`ENCRYPTION_KEY` and `PAYMENT_ENCRYPTION_KEY` are documented in `.env.example` as AES-256-GCM keys, but **nothing in `src/` reads them**.

---

## C. Findings Summary

| ID | Finding | Severity | Confidence | Affected Component | Exploitability | Status |
|---|---|---|---|---|---|---|
| SEC-001 | Unvalidated invitation role → self-registered user becomes platform admin (and HR_ADMIN → BUSINESS_OWNER) | **Critical** | Confirmed | invitations, auth, stackhr-admin, compliance | Low-privilege, open signup, ~4 requests | Open |
| SEC-002 | Legacy `/employees` API has no role checks; full PII rows readable and writable by any member | **Critical** | Confirmed | employees | Any authenticated employee | Open |
| SEC-003 | Payouts default to placeholder account `0123456789` / bank `000014`; no name enquiry | **High** | Confirmed | payroll, spend | Triggered by missing or unmatched bank data | Open |
| SEC-004 | Transfer failures swallowed, records marked EXECUTED/PAID/DISBURSED; funding check is attestation only | **High** | Confirmed | payroll, spend, banking | Any failed transfer | Open |
| SEC-005 | Self-service identity bound by mutable email → profile, bank-detail and document hijack | **High** | Confirmed | me, leave, people-documents, spend | Any employee (via SEC-002) or any admin | Open |
| SEC-006 | Reimbursements payable without approval; client-chosen amount; approval never applied | **High** | Confirmed | spend | Employee + admin "Pay" click (or CSRF, SEC-011) | Open |
| SEC-007 | Approval requests can be forged for arbitrary subjects; listeners resurrect finished records; cross-tenant variant via outbox | **High** | Confirmed (same-org) / Suspected (cross-tenant) | approvals, spend/payroll listeners, outbox | Any member + an approver | Open |
| SEC-008 | Legacy invitation accept by ID, unauthenticated; any member lists invitation IDs; resend reactivates accepted invites | **High** | Confirmed | invitations | Any member | Open |
| SEC-009 | Offboarding/termination does not revoke access; session cache honours stale role/org for up to 30 days | **High** | Confirmed | auth, employees, people | Former employee | Open |
| SEC-010 | Plaintext current/new passwords and PII written to `audit_log` | **High** | Confirmed | audit | Anyone with DB/backup/log access | Open |
| SEC-011 | CSRF on cookie-authenticated POST endpoints (SameSite=None, urlencoded parser, no token/Origin check) | **High** | Confirmed code path / Suspected deployment | main.ts, auth cookies | Victim admin visits attacker page | Open |
| SEC-012 | Any member reads any employee's compensation history | **High** | Confirmed | payroll | Any member | Open |
| SEC-013 | PenCentral employer code is free-form per org under a shared partner key → cross-tenant pension access/revocation | **High** | Confirmed code / Suspected exploitability | pension | Org admin of any tenant | Open |
| SEC-014 | Tenant isolation is application-only; extension gaps (findUnique, upsert, `$transaction`, missing models, null-org); no RLS; People "RLS" fails open | **High** | Confirmed | database, all modules | Enables/amplifies cross-tenant bugs | Open |
| SEC-015 | Double-execution risks: non-atomic state transitions, idempotency fingerprint ignores route, disburse/pay lack idempotency, transfer POSTs auto-retried | **High** | Suspected | payroll, spend, idempotency, anchor client | Concurrent or retried requests | Open |
| SEC-016 | Leave: any member reads and cancels anyone's leave (incl. approved, refunding days); reasons exposed | Medium | Confirmed | leave | Any member | Open |
| SEC-017 | Expenses/advances/reimbursements lack object-level ownership checks (read, cancel, receipt overwrite) | Medium | Confirmed | spend | Any member | Open |
| SEC-018 | Anchor webhook: no replay or event dedup; deposits increment balance per delivery; one event reconciles a whole run | Medium | Confirmed | banking | Anchor retries, or replay of a captured request | Open |
| SEC-019 | Global tax rule sets editable in place by STACKHR_SUPPORT; no versioning or maker-checker | Medium | Confirmed | compliance | Support account | Open |
| SEC-020 | Approval separation of duties: MANAGER can approve payroll; no manager scope; no second approver for execution; decide race | Medium | Confirmed | approvals, payroll | Manager | Open |
| SEC-021 | Exception filter returns raw internal error messages (Prisma, TypeError) to clients | Medium | Confirmed | common/filters | Any caller | Open |
| SEC-022 | No `trust proxy`; in-memory per-process throttler → shared login bucket (lockout DoS), ineffective limits, useless IP audit | Medium | Confirmed code / Suspected deployment | main.ts, app.module | Unauthenticated | Open |
| SEC-023 | Sensitive identifiers stored in plaintext; documented encryption keys unused | Medium | Confirmed | schema, me, banking | DB/backup access | Open |
| SEC-024 | Production CORS allow-list includes dev `onrender.com` origins with credentials | Medium | Confirmed | main.ts | XSS or compromise on a dev frontend | Open |
| SEC-025 | Employees can change their own bank and tax details with no verification, approval or notification | Medium | Confirmed | me | Employee or session hijacker | Open |
| SEC-026 | Outbox claim is non-atomic → duplicate event processing (e.g. duplicate reimbursements) | Medium | Confirmed race / Suspected impact | common/outbox | Multi-worker or inline processing | Open |
| SEC-027 | Fail-open configuration: Anchor mock mode when key missing, OTP `devCode` when NODE_ENV≠production, default `AUTH_SECRET`, PM2 default env development | Medium | Confirmed | anchor client, auth, ecosystem | Misconfiguration | Open |
| SEC-028 | Corporate card read authorization (any role reads any card incl. live balance; employee filter broken) | Medium | Confirmed | banking | Any member | Open |
| SEC-029 | No MFA for platform or org admins; 30-day absolute sessions with no idle timeout | Medium | Confirmed | auth | Credential theft or phishing | Open |
| SEC-030 | Vulnerable runtime dependencies (multer DoS, body-parser DoS) | Medium | Confirmed (versions) | dependencies | Unauthenticated, upload/compressed-body endpoints | Open |
| SEC-031 | Authentication hardening gaps: non-CSPRNG OTP, no per-account lockout, enumeration, inconsistent password policy, token in JSON body | Low | Confirmed | auth | Varies | Open |
| SEC-032 | Audit trail gaps: no failure/auth/read events, mutable table, `resourceId` likely always null | Low | Confirmed / Suspected (resourceId) | audit | — | Open |
| SEC-033 | Logger redaction gaps; PII and account numbers in interpolated log strings; unvalidated correlation ID | Low | Confirmed | logger, banking, waitlist | Log access | Open |
| SEC-034 | `/metrics` publicly exposed | Low | Confirmed | metrics | Unauthenticated | Open |
| SEC-035 | Unbounded list endpoints / missing pagination caps | Low | Confirmed | employees, leave, payroll, spend, banking, pension | Any member | Open |
| SEC-036 | Over-broad responses: full Organization row to all members; all members list invitations; duplicate `/compliance/alerts` route | Low | Confirmed | organizations, invitations, compliance | Any member | Open |
| SEC-037 | `POST /banking/verify-account` open to every role → NUBAN name enumeration / cost abuse; upstream error text echoed | Low | Confirmed | banking, pension, email | Any member | Open |
| SEC-038 | CI/CD hygiene: no `permissions:`, unpinned Railway CLI next to deploy token, tag-pinned actions, lockfile drift (pnpm vs npm) | Low | Confirmed | .github/workflows | Supply chain | Open |
| SEC-039 | Waitlist duplicate POST discloses stored entry; no max lengths | Low | Confirmed | waitlist | Unauthenticated | Open |
| SEC-040 | Local `docker-compose.yml` publishes Postgres on 0.0.0.0 with default password | Low | Confirmed | docker-compose | Local network | Open |
| SEC-041 | Amount unit ambiguity (kobo vs naira) in compensation DTO could cause 100× payouts | Low | Suspected | payroll | Client integration error | Open |
| SEC-042 | `Idempotency-Key` header not in CORS `allowedHeaders` → browsers cannot use idempotency-protected endpoints | Info | Confirmed | main.ts | Functional | Open |
| SEC-043 | Salary advances never deducted in payroll; no cap on advance amount | Info | Confirmed | spend, payroll | Business logic | Open |
| SEC-044 | Example login passwords in published Postman collection | Info | Confirmed | docs/postman | — | Open |

---

## D. Detailed Findings

> CVSS 4.0 vectors are given for the most severe confirmed technical vulnerabilities. Scores were not machine-computed. Use the FIRST calculator to derive the numeric score from each vector. Assumptions are stated per finding.

### SEC-001 — Unvalidated invitation role allows escalation to platform administrator

- **Severity:** Critical · **Confidence:** Confirmed (static trace; not executed at runtime)
- **CVSS 4.0 vector (assumed):** `AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:L/SC:H/SI:H/SA:L`. PR:L because the attacker needs only a self-registered business account. SC/SI:H because the tax rules affect all tenants.

**Affected files**

- `src/invitations/dto/create-invitation.dto.ts:8-10`: `role` is `@IsString() @IsOptional()` with no allow-list.
- `src/invitations/invitations.service.ts:59`: stores `dto.role` verbatim.
- `src/invitations/invitations.service.ts:186, 212`: copies `invitation.role` into `User.role` and `Member.role`.
- `src/invitations/invitations.controller.ts:50-53`: `POST /invitations/:id/accept` is unauthenticated.
- `src/auth/auth.service.ts:456-528`: `resetPassword` sets `passwordHash` and immediately issues a session.
- `src/auth/auth.service.ts:932-950`: `request.user.role = member.role`.
- `src/auth/roles.guard.ts:27`: compares the role string only and never checks `userType`.
- `src/stackhr-admin/stackhr-admin.controller.ts:10-12`, `src/compliance/compliance.controller.ts:19-21`, `src/waitlist/waitlist.controller.ts:29-31`: platform routes gated by role only.
- `src/auth/auth.controller.ts:63-73`: business signup is open to anyone.

**Explanation**

`Member.role` and `Invitation.role` are free-text columns (`schema.prisma:148,161`). The legacy invitation API lets any org admin store an arbitrary role string and then turns it into a membership. The session's effective role is the membership role, and platform controllers authorize on that string alone.

**Preconditions**

An attacker-controlled mailbox and the ability to register a business, which is open. The SendByte email integration must be configured, as it is in production.

**Attack scenario**

1. Register a business at `POST /auth/business/register`, verify the email, and become `BUSINESS_OWNER` of new org X.
2. `POST /invitations {"email":"attacker2@evil.tld","role":"STACKHR_ADMIN"}`. The response includes the invitation `id`.
3. `POST /invitations/<id>/accept {"fullName":"x","password":"..."}` with no authentication. This creates a BUSINESS user with `Member.role = "STACKHR_ADMIN"` in org X.
   - The accept flow stores the password in the legacy `Account` table, which login never reads.
4. `POST /auth/forgot-password` for `attacker2@evil.tld`, then `POST /auth/reset-password` with the emailed token. `resetPassword` sets `passwordHash` and returns a session whose `role` is `STACKHR_ADMIN`.
5. With that session the attacker can:
   - `POST`/`PATCH /stackhr-admin/compliance/rule-sets` to alter the **global** `TaxRuleSet`, which feeds `ComplianceService.calculatePayrollDeductions` for every tenant's payroll;
   - `GET /waitlist` to read all waitlist PII;
   - `POST /stackhr-admin/outbox/dlq/:id/replay`, whose `findUnique` lookup is unscoped.

The same mechanism lets an `HR_ADMIN` grant `BUSINESS_OWNER` inside their own org.

**Business impact**

Platform-wide integrity compromise of statutory tax deductions, leading to incorrect PAYE for every customer, regulatory exposure and loss of trust. Disclosure of prospect PII.

**Remediation**

1. Restrict `CreateInvitationDto.role` with `@IsIn([...])` to business roles, and enforce "cannot grant a role above your own; never BUSINESS_OWNER".
2. Never copy invitation roles into `User.role`.
3. Add a dedicated `PlatformGuard` that requires `user.userType === 'STACKHR_ADMIN'` **and** `organizationId === null`, and apply it to all `stackhr-admin`, `compliance` admin and waitlist-admin routes.
4. Retire the legacy `/invitations/:id/accept` flow (see SEC-008).
5. Containment: query production for any `Member.role` or `User.role` values outside the expected set, and for any `userType='BUSINESS'` user holding a platform role.

**Regression tests**

- Creating an invitation with `role: 'STACKHR_ADMIN'` or `'BUSINESS_OWNER'` returns 400.
- A BUSINESS-type user with a forged `role: 'STACKHR_ADMIN'` membership receives 403 from every `/stackhr-admin/*` route.

**References:** OWASP API Security Top 10 2023, API5 (Broken Function Level Authorization); CWE-269; CWE-915.

---

### SEC-002 — Legacy `/employees` API: any member has full HR read/write over the organization

- **Severity:** Critical · **Confidence:** Confirmed
- **CVSS 4.0 vector (assumed):** `AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:L/SC:N/SI:N/SA:N`

**Affected files**

- `src/employees/employees.controller.ts:22-83`: `@UseGuards(AuthGuard, RolesGuard)` but **no `@RequireRoles`**. `RolesGuard` returns `true` when no roles are declared (`roles.guard.ts:21-23`).
- `src/employees/employees.service.ts`:
  - `findAll` (190) and `findOne` (251) return the whole `Employee` row; only `invitationToken` is deleted (239).
  - `createEmployee` (57), `updateEmployee` (285), `reassignManager` (372) and `offboardEmployee` (505) have no role checks.
- `src/employees/dto/employee-query.dto.ts`: `limit` has `@Min(1)` but no `@Max`.
- `src/employees/dto/update-employee.dto.ts`: accepts `email`, `salaryAmount`, `managerId` and free-text `status`.

**Explanation**

Tenant scoping holds, because the extension scopes `findFirst`/`findMany`/`update`. However, there is no role or ownership enforcement at all. The newer `/people/employees` API is correctly admin-only, but the legacy controller is still registered.

**Attack scenarios (any EMPLOYEE)**

- `GET /v1/api/employees?limit=100000` returns every colleague's `accountNumber`, `bankName`, `tin`, `pensionRsaNumber`, `dateOfBirth`, `address`, `phone`, `personalEmail`, emergency contacts and `salaryAmount`.
- `PATCH /employees/<colleague> {"status":"OFFBOARDED"}` drops the colleague from payroll, since payroll selects `status: 'ACTIVE'`.
- `PATCH /employees/<self> {"salaryAmount": 99999999}`. Payroll falls back to `Employee.salaryAmount` when no compensation record exists, which is true for employees created through onboarding import.
- Email rebinding (SEC-005).

**Business impact:** a complete loss of confidentiality of HR and banking data within each tenant, plus integrity of payroll inputs. This is a reportable personal-data breach.

**Remediation**

1. Immediately add a class-level `@RequireRoles(BUSINESS_OWNER, BUSINESS_ADMIN, HR_ADMIN)` to `EmployeesController`, or remove the controller in favour of `/people/employees`.
2. Return explicit `select` DTOs rather than raw rows.
3. Add `@Max(100)` to `limit` and `@IsIn` to `status`.

**Regression tests:** an EMPLOYEE session receives 403 on every `/employees` route, and an admin response does not contain `invitationToken` or unselected fields.

**References:** OWASP API1:2023 (BOLA) and API3:2023 (Broken Object Property Level Authorization); CWE-862.

---

### SEC-003 — Payouts fall back to a hard-coded placeholder account and bank

- **Severity:** High · **Confidence:** Confirmed

**Affected files**

- `src/payroll/payroll.service.ts:545-571`: `bankCode = matchedBank?.nipCode ?? '000014'`, `accountNumber = emp?.accountNumber ?? '0123456789'`.
- `src/spend/spend.service.ts:321-328` (advances) and `:613-620` (reimbursements): same pattern.

**Explanation**

`Employee.bankName` is free text and is matched by exact, case-insensitive name against Anchor's bank list.

- If there is no match (for example "GTBank" versus "Guaranty Trust Bank"), the bank code silently becomes `000014`.
- If the account number is missing, it becomes `0123456789`.
- No name enquiry (`verifyAccount`) is performed before the transfer.

**Preconditions:** missing or non-canonical bank data, which is common given free-text entry.

**Scenario:** an employee's salary is transferred to the right account number at the wrong bank, which may belong to a stranger, or to a placeholder account. The payment is irrecoverable or slow to recover.

**Business impact:** direct financial loss, wage-payment liability, and reconciliation failures.

**Remediation**

1. Remove every placeholder default and refuse to build a transfer when the bank code or account number is missing or unresolved.
2. Store the NIP bank code, not a bank name.
3. Require a successful name enquiry with a fuzzy name match before an employee becomes payable, and re-verify on change.

**Regression test:** `executePayment` with an employee lacking an `accountNumber` throws, or excludes that employee and marks the item failed, and never calls the transfer API with `0123456789`.

**References:** CWE-1188 (insecure default initialization).

---

### SEC-004 — Transfer failures are swallowed and records are still marked paid; funding check is self-attested

- **Severity:** High · **Confidence:** Confirmed

**Affected files**

- `src/payroll/payroll.service.ts:573-585`: `executePayrollTransfers(...).catch(() => null)`, then an unconditional `status: 'EXECUTED'`.
- `src/spend/spend.service.ts:342-356` (advance → `DISBURSED`) and `:634-648` (reimbursement → `PAID`), after `.catch(() => null)`.
- `src/payroll/payroll.service.ts:440-454`: computes `isSufficient` but sets `FUNDING_CHECK_PASSED` based only on `dto.confirmed`.
- `src/banking/banking.service.ts` throws "Insufficient balance", but that error is swallowed by the callers above.

**Scenario**

Insufficient balance, an Anchor 4xx/5xx, a timeout or an open circuit breaker all still record the payroll run as `EXECUTED`, and the run can then be reconciled. Employees are not paid, but the system says they were. Re-execution is blocked by the state machine.

**Business impact:** unpaid wages recorded as paid, false financial records, and payslips issued for money never sent.

**Remediation**

1. Let transfer errors propagate.
2. Introduce `PAYMENT_FAILED` / `PARTIALLY_PAID` states with per-item outcomes.
3. Gate `FUNDING_CHECK_PASSED` on a fresh balance sync and `isSufficient`.

**Regression test:** a mocked Anchor client that rejects leaves the run in a failed state, with no `EXECUTED` status and no payslips.

**References:** CWE-390, CWE-754.

---

### SEC-005 — Self-service identity is bound by mutable email address

- **Severity:** High · **Confidence:** Confirmed

**Affected files**

The caller's employee record is resolved with `employee.email == user.email`:

- `src/me/me.service.ts:24-44` (`getEmployeeForUser`)
- `src/people/documents/people-documents.service.ts:206-209` (document download for non-admins)
- `src/leave/leave.service.ts:99, 131, 279`
- `src/spend/spend.service.ts:370-377, 402-409, 434-441`. Where no employee matches, these also fall back to *all* org records.
- `src/people/leave/people-leave.service.ts:112-121`: the self-approval check compares emails.

**Explanation**

`Employee.email` is editable by any member via SEC-002, and by admins via `/people/employees`. A reliable link already exists in `Employee.userId`, which is unique, but these code paths don't use it.

**Attack scenario**

1. Employee A changes their own record's email to something else.
2. Employee A sets victim B's `Employee.email` to A's login email.
3. `/me/profile` now returns B's record.
4. `PATCH /me/profile {"accountNumber": ..., "bankName": ...}` rewrites B's bank details (salary diversion), and `/me/documents` plus `/people/documents/:id/download` returns B's private documents.

An admin can use the same steps to approve their own leave.

**Remediation:** resolve "me" through `Employee.userId === user.id` everywhere, fail closed when there is no linked employee, and treat email as display data only.

**Regression test:** changing `Employee.email` does not change which record `/me/profile` returns.

**References:** CWE-639 (authorization bypass through user-controlled key).

---

### SEC-006 — Reimbursements can be paid without approval

- **Severity:** High · **Confidence:** Confirmed

**Affected files**

- `src/spend/spend.service.ts:457-500` (`createReimbursement`): submits an approval with `type: 'EXPENSE', subjectTable: 'reimbursement'`.
- `src/spend/spend.listener.ts:35-56`: routes `EXPENSE` decisions to `handleExpenseApproval`, which looks up an *expense* by the reimbursement id, finds nothing, and returns. The reimbursement is therefore never approved.
- `src/spend/spend.service.ts:589-603` (`payReimbursement`): only rejects `status === 'PAID'`, so PENDING, REJECTED and CANCELLED claims are payable.
- `expenseId` is not checked for ownership or org, the `amount` is client-chosen, and nothing stops multiple reimbursements per expense.

**Scenario:** an employee files `POST /reimbursements {"amount": 5000000, "expenseId": "<any approved expense>"}`. The claim appears as PENDING, and an admin "Pay" click, or a CSRF'd click (SEC-011), sends the money with no approval gate.

**Remediation**

1. Require `status === 'APPROVED'` in `payReimbursement`.
2. Add a reimbursement branch to the listener.
3. Validate the linked expense (same org, owned by the caller, approved, and not already reimbursed with `@unique expenseId`).
4. Derive the amount from the expense.

**Regression test:** paying a PENDING or REJECTED reimbursement returns 400.

**References:** CWE-841 (improper enforcement of behavioral workflow).

---

### SEC-007 — Forged approval requests can resurrect finished records; cross-tenant variant via the outbox

- **Severity:** High · **Confidence:** Confirmed for the same-org path; Suspected for the cross-tenant path (needs runtime validation)

**Affected files**

- `src/approvals/approvals.controller.ts:33`: `POST /approvals` is open to any role.
- `src/approvals/approvals.service.ts:34-58`: accepts any `type`/`subjectTable`/`subjectId`/`amountSnapshot`/`metadata` and never validates the subject.
- Listeners load subjects with unscoped `findUnique` and treat only `APPROVED`/`REJECTED` as terminal:
  - `src/spend/spend.listener.ts:49, 127, 136`
  - `src/payroll/payroll.listener.ts:30-37`
- `src/approvals/approvals.service.ts:470-480`: events go through the outbox, and the background poller runs with no tenant context.

**Same-org scenario**

1. An employee whose advance is already `DISBURSED` posts `/approvals {"type":"SALARY_ADVANCE","subjectTable":"salary_advance","subjectId":"<own advance>"}`.
2. An approver approves what looks like a normal request.
3. The listener flips the advance back to `APPROVED`, and `disburseSalaryAdvance` accepts it again, so it is paid twice.

Approving a forged `REJECTED` decision against an executed payroll run corrupts its status.

**Cross-tenant scenario (Suspected)**

The forged `subjectId` references another org's record.

1. The inline, tenant-scoped update fails.
2. The outbox retries the event from `setInterval` with no tenant context, so the extension does not scope the update, and the foreign record is modified.

This requires the target UUID.

**Remediation**

1. Remove public `POST /approvals`, or validate that the subject exists in the caller's org, is owned by the requester, is pending, and has no open request.
2. In listeners, filter by `event.organizationId` and transition only from pending states with a conditional `updateMany`.

**Regression test:** submitting an approval for another user's record, a non-pending record or a foreign-org record returns 400 or 404, and a listener given a terminal-state subject makes no change.

**References:** OWASP API1:2023, CWE-841.

---

### SEC-008 — Legacy invitation acceptance is bearer-by-ID and unauthenticated

- **Severity:** High · **Confidence:** Confirmed

**Affected files** (`src/invitations/invitations.controller.ts:39-53`, `invitations.service.ts`)

- `GET /invitations` (98-120) has only `AuthGuard`, so **any member** receives every org invitation's `id`, email, role and inviter.
- `GET /invitations/:id` (122-153) is unauthenticated and returns email, role, `employeeId`, `inviterId` and org slug.
- `POST /invitations/:id/accept` (155-256) is unauthenticated and requires only the ID. It:
  - ignores `tokenHash`;
  - adds memberships for existing users without their consent;
  - marks the employee `ACTIVE`, which skips onboarding.
- `resendInvitation` (279-303) resets **any** invitation, including accepted or revoked ones, back to `pending`.

**Scenario:** an employee lists invitations, picks a pending invite for a new hire, and accepts it with their own password. That pre-provisions the account under the victim's email with the invited role, consumes the real token-based invitation and breaks the victim's onboarding. Combined with SEC-001, this is the escalation vector.

**Remediation**

1. Delete the ID-based accept and preview endpoints. Use only the token-hash flow in `AuthService.acceptEmployeeInvitation`, which is well designed.
2. Restrict `GET /invitations` to admins.
3. Allow resend only for `pending`/`expired`, and rotate the token on resend.

**Regression test:** `POST /invitations/:id/accept` returns 404 because the route is removed, and an EMPLOYEE gets 403 on `GET /invitations`.

**References:** CWE-639, CWE-306.

---

### SEC-009 — Offboarding does not revoke access; the session cache pins stale authorization

- **Severity:** High · **Confidence:** Confirmed

**Affected files**

- `src/employees/employees.service.ts:505-528` and `src/people/employees/people-employees.service.ts:535` only change `Employee.status`.
- No code path deletes `Member` rows, bans users or revokes sessions on offboarding. `session.updateMany` appears only in logout, reset-password and change-password (`auth.service.ts:505, 570, 595`).
- Login does not check employee status (`auth.service.ts:752-824`).
- `src/auth/auth.service.ts:76, 602-655, 1016-1025` caches `AuthenticatedUser` in a per-process `Map` with TTL equal to the full session lifetime of 30 days. Role, membership and ban changes made directly in the DB are not observed until eviction, and eviction only happens on the worker that handled the logout or password change. Under PM2 cluster mode, other workers keep honouring the token.

**Scenario:** a terminated employee keeps their existing session and can also log in again. With SEC-002 they retain read access to all colleagues' PII and salaries.

**Remediation**

1. On offboard or terminate: remove or disable the `Member`, revoke all sessions (`revokedAt`), and evict the cache.
2. Reject login and `validateSession` for offboarded employees.
3. Reduce the cache TTL to 30–60 seconds, or move to a shared cache with invalidation.

**Regression test:** after offboarding, existing tokens return 401 and login fails.

**References:** OWASP ASVS V3.3 (session termination); CWE-613.

---

### SEC-010 — Plaintext passwords and PII stored in `audit_log`

- **Severity:** High · **Confidence:** Confirmed

**Affected files**

- `src/audit/audit.interceptor.ts:22-48`: global, records the body of every successful POST/PUT/PATCH/DELETE.
- `src/audit/audit.service.ts:46-68`: redacts only the exact keys `password`, `confirmPassword`, `token`, `secret`, `code`, and does not recurse into arrays.
- `src/auth/dto/change-password.dto.ts:6, 11`: uses `currentPassword` and `newPassword`, which are not redacted.

**Explanation**

Every successful `POST /auth/change-password` stores the user's old and new passwords in plaintext in `audit_log.payload`. The audit log also captures:

- bank account numbers from `/banking/verify-account` and `/me/profile`;
- TIN, DOB and phone from employee DTOs;
- salary from compensation DTOs.

On write failure, `console.error(error)` may print the Prisma arguments, including the payload, to stdout, bypassing pino redaction (Suspected).

**Impact:** anyone with DB, backup or log access obtains current passwords, and password reuse amplifies the damage. This also violates data minimization.

**Remediation**

1. Switch to an allow-list of auditable fields per route, or a recursive deny-pattern (`/pass|token|secret|otp|code|pin|cvv|account|bvn|nin|tin|salary/i`).
2. Purge existing `audit_log` rows for `POST /auth/change-password`, and consider forcing password rotation for affected users.

**Regression test:** an audit entry for change-password contains no password values.

**References:** CWE-532, CWE-312.

---

### SEC-011 — Cross-Site Request Forgery on cookie-authenticated endpoints

- **Severity:** High · **Confidence:** Confirmed code path; Suspected deployment (assumes the frontend relies on the cookie, which is the default flow)

**Affected files**

- `src/auth/auth.service.ts:675-704`: the cookie is `SameSite=None; Secure` in production.
- `src/auth/auth.service.ts:657-673`: the cookie is accepted as a credential.
- `src/main.ts:46-51`: only the JSON parser is customised. Nest's default urlencoded parser stays enabled, so `application/x-www-form-urlencoded` bodies are parsed and validated like JSON.
- There is no CSRF token, Origin check or custom-header requirement.

**Explanation:** CORS does not stop "simple" cross-site form POSTs. The browser sends the cookie and the action executes, even though the attacker cannot read the response.

**Attack scenario:** a logged-in org admin visits an attacker page that auto-submits forms to:

- `POST /v1/api/reimbursements/<id>/pay`, which pays the attacker's unapproved claim (SEC-006);
- `POST /v1/api/spend/advances/<id>/disburse`;
- `POST /v1/api/payroll/runs/<id>/submit` or `/calculate`;
- `POST /v1/api/invitations` with `email=...&role=BUSINESS_OWNER`.

Endpoints that require `Idempotency-Key` (payroll execute, pension submit and pay) are protected, because a custom header forces a preflight.

**Remediation**

1. Serve the API on a same-site domain (for example `api.stackhr.app`) and set `SameSite=Lax` or `Strict`.
2. Additionally verify `Origin`/`Sec-Fetch-Site` on state-changing requests, or require a custom header or CSRF token.
3. Disable the urlencoded parser.

**Regression test:** a POST with a cookie, a form content type and a foreign `Origin` returns 403.

**References:** OWASP CSRF Prevention Cheat Sheet; CWE-352.

---

### SEC-012 — Any member can read any employee's compensation history

- **Severity:** High · **Confidence:** Confirmed

**Affected files:** `src/payroll/payroll.controller.ts:47-53`. `GET /payroll/compensation/:employeeId` has no `@RequireRoles`, unlike every other payroll route. `payroll.service.ts:94` checks only the org.

**Scenario:** an employee takes a colleague's employee ID from the directory or org chart and reads their full basic, housing, transport and other allowance history.

**Remediation:** add `@RequireRoles(...ADMIN_ROLES)`. Employees already have `/me/compensation-history` for their own data.

**Regression test:** an EMPLOYEE gets 403 for another employee's ID.

**References:** OWASP API1:2023.

---

### SEC-013 — PenCentral employer binding is free-form under a shared partner key

- **Severity:** High · **Confidence:** Confirmed code path; Suspected exploitability (depends on which employer codes are attached to StackHR's partner account)

**Affected files**

- `src/pension/pension.service.ts:236-253`: `PATCH /pension/config` stores any string as `penCentralEmployerCode`.
- `schema.prisma:101`: the column is not unique.
- `src/pension/pencentral.client.ts`: one global API key for all tenants.
- Dashboard, compliance report, schedule submission and `revokeEmployer` (`pension.service.ts:203-234`) all act on that stored code.

**Scenario:** an admin of org A sets org B's employer code and then reads B's pension dashboard, submits schedules as B, or calls `DELETE /pension/employers`, which revokes B's grant on the shared partner account.

**Remediation**

1. Only allow binding through validate → attach, and persist the grant ID.
2. Make the code unique across orgs.
3. Remove the free-form PATCH.

**Regression test:** PATCHing an employer code returns 400 or 405, and attaching a code already bound to another org fails.

**References:** CWE-639.

---

### SEC-014 — Tenant isolation is application-only and incomplete

- **Severity:** High (systemic) · **Confidence:** Confirmed

**Affected files**

- `src/database/prisma.service.ts:12-34`: the `TENANT_SCOPED_MODELS` list omits org-owned models such as `Department`, `Team`, `Document`, `AuditEvent`, `CompensationHistory` and onboarding templates.
- `src/database/prisma.service.ts:53-110`: scopes only `findFirst/findMany/count/aggregate/groupBy/update/updateMany/delete/deleteMany/create/createMany*`. It does **not** scope `findUnique`, `findUniqueOrThrow`, `findFirstOrThrow`, `upsert` or `updateManyAndReturn`, and it does nothing when `organizationId` is null (platform users and background jobs).
- `src/database/prisma.service.ts:117-130`: the proxy redirects only model accessors. `$transaction` resolves to the **base** client, so every interactive `tx` is unscoped. This covers all `TenantPrismaService.run` calls (the whole People module), onboarding and invitation acceptance.
- `src/people/tenant/tenant-prisma.service.ts:20-29`:
  - `SET LOCAL ROLE stackhr_app` and `set_config('app.org_id')` errors are swallowed ("fallback gracefully").
  - No role or RLS policy exists in the repo: there are no `CREATE POLICY` or `ENABLE ROW LEVEL SECURITY` statements, and migrations cover only the auth tables.
  - In Postgres a failed statement aborts the transaction, so either the role exists out of band (unverified) or People calls fail.
- `CLAUDE.md` requires RLS-enforced tenant isolation.

**Impact:** isolation rests on every developer remembering explicit `organizationId` filters. Today the explicitly written filters in the People module are correct, but any omission becomes a cross-tenant leak, and several findings above (SEC-007, SEC-001 DLQ replay) exploit exactly these gaps.

**Remediation**

1. Add proper migrations with RLS policies on every org-owned table, keyed on `current_setting('app.org_id')`, with a non-owner application role. Fail closed if the GUC or role cannot be set.
2. Wrap `$transaction` so `tx` is the extended client.
3. Extend the scoped operations to all reads and writes, and add the missing models.
4. Use composite `(organizationId, id)` foreign keys for cross-entity references.

**Regression test:** an integration test with two orgs asserting that every repository method returns or modifies nothing across the boundary, including inside transactions and with `findUnique`.

**References:** OWASP ASVS V4.1; CWE-284.

---

### SEC-015 — Double-execution and idempotency weaknesses on money-moving operations

- **Severity:** High · **Confidence:** Suspected (needs concurrency testing, and Anchor's duplicate-reference behaviour is unknown)

**Affected files**

- `src/payroll/payroll.service.ts:511-585`: reads the status, transfers, then runs an unconditional `update`. There is no atomic state claim.
- `src/spend/spend.service.ts:292` (`disburseSalaryAdvance`) and `:589` (`payReimbursement`): no `@Idempotent` and no conditional transition.
- `src/common/idempotency/idempotency.service.ts`:
  - The fingerprint hashes only the body, not the method, route or params. Reusing one key for `runs/A/execute` and `runs/B/execute` (both empty bodies) replays A's response and silently skips B.
  - Lease takeover and FAILED retry are read-then-update rather than compare-and-set.
  - The 120-second lease can expire during a slow bulk transfer.
  - Create errors are retried with unbounded recursion.
- `src/banking/anchor/anchor.client.ts` with `src/common/resilience/retry-policy.ts`: timeouts are treated as transient, so a transfer POST that timed out but was processed can be re-sent.
- The internal `balanceKobo` check-then-decrement is a TOCTOU race.

**Scenario:** two admins, a double click, or a client retry with a new key triggers two bulk payroll transfers or two advance or reimbursement payouts.

**Remediation**

1. Atomically claim state transitions, for example `updateMany({where:{id, status:'FUNDING_CHECK_PASSED'}, data:{status:'EXECUTING'}})`, and require `count === 1`.
2. Add `@Idempotent({required:true})` to disburse and pay.
3. Include method, route, params and user in the idempotency fingerprint.
4. Do not auto-retry non-idempotent POSTs unless Anchor guarantees reference uniqueness.
5. Use a conditional decrement (`balanceKobo >= amount`).

**Regression test:** two concurrent `executePayment` calls result in exactly one transfer call.

**References:** CWE-362, CWE-367.

---

### SEC-016 — Leave requests: any member can read and cancel anyone's leave

- **Severity:** Medium · **Confidence:** Confirmed

**Affected files** (`src/leave/leave.service.ts`)

- `cancelLeaveRequest` (425-493) checks only the org, not ownership. Cancelling an `APPROVED` request refunds `usedDays`, even for leave already taken.
- `getLeaveHistory` (259) with an arbitrary `employeeId` and `getLeaveRequestDetails` (318) expose other employees' requests and `reason`, which may contain health information.
- `getLeaveBalances` (95) returns all org balances when the caller has no employee record.
- `src/leave/leave.controller.ts:72-102` has no role restrictions on these routes, and `limit` is unbounded.

**Scenario:** an employee reads colleagues' medical leave reasons, cancels a rival's approved leave, or recovers their own already-taken days.

**Remediation:** owner-only cancel (by `userId`) while pending or future-dated; admin override. Scope history and details to self, direct reports, or admin. Add `@Max` to `limit`.

**Regression test:** an employee gets 403 or 404 when cancelling or viewing another employee's leave.

---

### SEC-017 — Spend: missing object-level ownership checks

- **Severity:** Medium · **Confidence:** Confirmed

**Affected files** (`src/spend/spend.service.ts`)

- `getExpenseDetails` (187) and `getReimbursementDetails` (490-510) let any member read any claim.
- `cancelExpense` (212), `cancelSalaryAdvance` (255) and `cancelReimbursement` (512) let any member cancel any request, including approved reimbursements.
- `attachReceipt` (103) lets any member overwrite the receipt URL on any expense in any status: evidence tampering, or a phishing link shown to approvers.
- List endpoints fall back to all org records when no employee matches the caller's email.

**Remediation:** resolve the employee by `userId`, require ownership or an admin role, block receipt changes after submission, and fail closed.

**Regression test:** an employee cannot read, cancel or modify another employee's expense, advance or reimbursement.

---

### SEC-018 — Anchor webhook lacks replay protection and over-trusts events

- **Severity:** Medium · **Confidence:** Confirmed

**Affected files**

- `src/banking/anchor/anchor-webhook.guard.ts:22-63`: HMAC-SHA1 over the raw body with a constant-time compare, which is good. There is no timestamp or nonce, and no event ID is persisted.
- `src/banking/banking.service.ts:398-419`: `deposit.successful` runs `balanceKobo: { increment }` on every delivery.
- `src/banking/banking.service.ts:452-467`: one `transfer.successful` event with a `pyr_<runId>` reference reconciles the **whole run** from any status.
- Advances and reimbursements are marked `DISBURSED`/`PAID` from any status (`:517, :574`).

**Scenario:** Anchor's at-least-once redelivery, or a replay of a captured signed request, inflates the org's internal balance. That balance gates payroll funding views.

**Remediation**

1. Store `data.id` with a unique constraint and skip duplicates.
2. Reconcile per item and only from expected states.
3. Periodically resync the balance from Anchor instead of summing webhook amounts.

**Regression test:** delivering the same signed webhook twice increments the balance once.

---

### SEC-019 — Global tax rules editable in place by support staff

- **Severity:** Medium · **Confidence:** Confirmed

**Affected files**

- `src/compliance/compliance.controller.ts:19-52`: `STACKHR_SUPPORT` can create and patch rule sets and seed.
- `src/compliance/compliance.service.ts:290-330`: bands are deleted and recreated in place, with no immutable version history.
- IDs are `TRS-${Date.now()}`, which is collision-prone.

**Impact:** one support account, or a compromise of one, silently changes PAYE for every tenant. Historical runs lose a reproducible rule version, contrary to the spec's "tax rule version tracked separately".

**Remediation:** make SUPPORT read-only; use append-only versioned rule sets with maker-checker approval and explicit audit events; use UUIDs.

---

### SEC-020 — Approval separation-of-duties gaps

- **Severity:** Medium · **Confidence:** Confirmed

**Affected files** (`src/approvals/approvals.service.ts`)

- `:432-445`: `MANAGER` may decide every approval type, including `PAYROLL`, with no direct-report scope.
- `:113-124, 334-362`: managers list every org approval, enriched with payroll totals and every employee's advance amount and reason.
- `:420, 447`: decide is read-then-update and not conditional, so concurrent decisions emit two events.
- Whoever approves a payroll run can also run funding-check and execute; there is no second approver.
- Self-approval **is** correctly blocked (`:426`).

**Remediation:** restrict payroll approval to owner or admin, enforce manager scope, use a conditional `updateMany` on `status:'PENDING'`, and require a distinct executor for payroll.

---

### SEC-021 — Internal error messages returned to clients

- **Severity:** Medium · **Confidence:** Confirmed

**Affected file:** `src/common/filters/global-exception.filter.ts:57-59, 79-89`. For non-`HttpException` errors the response includes `exception.message` and `exception.name` (for example `PrismaClientKnownRequestError`), with no environment gate. Prisma messages include model and field names, constraint names and sometimes argument values. Stacks are logged server-side only, which is good.

**Remediation:** return a generic message plus the correlation ID for non-HTTP errors, and map known Prisma codes (P2002 → 409, P2025 → 404) to safe messages.

**Regression test:** a forced Prisma error yields a response containing no "prisma" or "invocation" text.

**References:** CWE-209.

---

### SEC-022 — Rate limiting ineffective behind a proxy and across workers

- **Severity:** Medium · **Confidence:** Confirmed code; Suspected deployment impact

**Affected files**

- No `app.set('trust proxy', …)` anywhere in `src/`.
- `src/app.module.ts:50-55, 86-89`: in-memory `ThrottlerModule` keyed on `req.ip`.
- `src/auth/auth.controller.ts`: 5 requests/min on login.

**Effects behind Railway's edge proxy**

- All clients share one bucket, so an attacker can lock every tenant out of login with 5 requests per minute.
- Under PM2 cluster mode the limits multiply per worker.
- `Session.ipAddress` and `audit_log.ipAddress` record the proxy address.
- There is no per-account throttling or lockout.

**Remediation**

1. Set `trust proxy` to the exact hop count. Never set it to `true`, which allows `X-Forwarded-For` spoofing; also note the `proxy-addr` advisory in SEC-030.
2. Use Redis-backed throttler storage.
3. Add per-account login throttling.

---

### SEC-023 — Sensitive identifiers stored in plaintext; documented encryption keys unused

- **Severity:** Medium · **Confidence:** Confirmed

**Details**

- Plaintext columns:
  - `Employee.accountNumber`, `tin`, `pensionRsaNumber`, `phone`, `dateOfBirth`
  - `OrganizationDepositAccount.accountNumber`
  - `Account.accessToken`, `refreshToken`, `idToken`
  - `IdempotencyKey.responseBody`, which retains financial responses indefinitely
- `ENCRYPTION_KEY` and `PAYMENT_ENCRYPTION_KEY` are never read in `src/`.
- `src/me/dto/update-me-profile.dto.ts:17` contains a TODO acknowledging encryption is not wired.

**Remediation:** add an AES-256-GCM field-encryption helper (random 96-bit IV, versioned keys from a KMS or secret manager, no default fallback) for bank and tax identifiers. Add a TTL clean-up job for idempotency responses.

---

### SEC-024 — Production CORS allows development origins

- **Severity:** Medium · **Confidence:** Confirmed

**Affected file:** `src/main.ts:22-30, 82-86`. `PROD_DEFAULT_ORIGINS` includes `https://stackhr-webapp-dev.onrender.com` and other `onrender.com` hosts, with `credentials: true`.

**Scenario:** an XSS in, or an unreviewed deploy of, the dev webapp performs credentialed reads of production data for any user who visits it, since cookies are `SameSite=None`.

**Remediation:** in production, allow only `stackhr.app` hosts, driven by environment configuration.

---

### SEC-025 — Unverified self-service bank and tax detail changes

- **Severity:** Medium · **Confidence:** Confirmed (the disbursement impact depends on SEC-003)

**Affected files:** `src/me/dto/update-me-profile.dto.ts:85-125` and `src/me/me.service.ts:317-361`. Employees write `accountNumber`, `accountName`, `bankName`, `tin`, `pensionRsaNumber` and `pfaCode` directly. There is no name enquiry, no approval and no notification, and `avatarUrl` accepts any string.

**Impact:** a session hijacker, or an attacker using SEC-005, redirects salary. Payroll reads `Employee.accountNumber` (`payroll.service.ts:551-557`).

**Remediation:** route bank changes through a NUBAN name-match plus admin approval, notify the employee on their old contact details, apply a cooling-off period before the next payroll, and require an `https:` avatar URL.

---

### SEC-026 — Outbox claim is non-atomic

- **Severity:** Medium · **Confidence:** Confirmed race; Suspected impact

**Affected files**

- `src/common/outbox/outbox.service.ts:55-80`: runs `findMany` and then an unconditional update to `PROCESSING`. Every PM2 worker polls every 3 seconds, and `approvals.service.ts:478` also processes inline.
- `src/spend/spend.listener.ts:58-81` creates reimbursements, and `Reimbursement.expenseId` is not unique.

**Remediation:** claim with `UPDATE … WHERE status=… RETURNING` or `FOR UPDATE SKIP LOCKED`, and make handlers idempotent with unique constraints and conditional updates. Payslips are already protected by `@@unique([payrollRunId, employeeId])`.

---

### SEC-027 — Fail-open configuration defaults

- **Severity:** Medium · **Confidence:** Confirmed

**Details**

- `src/banking/anchor/anchor.client.ts:48-63`: when `ANCHOR_API_KEY` is unset, all transfers, cards and balances return fixtures, and payroll, advances and reimbursements are then marked paid (SEC-004).
- `src/auth/auth.service.ts:874-878`: when SendByte is unset and `NODE_ENV !== 'production'`, the OTP is returned in the response as `devCode`.
- `ecosystem.config.js` defaults to `NODE_ENV: 'development'`, which enables `devCode`, localhost CORS and non-Secure `Lax` cookies if PM2 starts without `--env production`.
- `src/auth/auth.service.ts:895`: `AUTH_SECRET` falls back to `'development-only-secret'`.
- `src/banking/anchor/anchor-webhook.guard.ts:24-27`: the webhook accepts unsigned requests when `NODE_ENV === 'test'`.

**Remediation:** validate required configuration at boot and refuse to start in production without the secrets; remove mock fallbacks from production builds; default PM2 to production.

---

### SEC-028 — Corporate card read authorization

- **Severity:** Medium · **Confidence:** Confirmed

**Affected files**

- `src/banking/banking.controller.ts:96-106` and `banking.service.ts:282-304`: `GET /banking/cards/:id` is open to any role and returns live Anchor card details (balance, limit).
- `GET /banking/cards` filters EMPLOYEE results by `user.id` against `card.employeeId`, which holds an Employee ID. Employees see nothing, while managers see everything.
- `IssueCardDto` has no upper limit.

**Remediation:** map the user to their employee record, enforce ownership on `:id`, cap limits, and require approval for issuance and increases.

---

### SEC-029 — No MFA and long-lived sessions for privileged accounts

- **Severity:** Medium · **Confidence:** Confirmed

**Details**

- There is no MFA anywhere, including `POST /auth/admin/login` for platform administrators and payroll-executing org admins.
- Sessions last an absolute 30 days (`auth.constants.ts:2`), with no idle timeout and no rotation on privilege-relevant events.
- Session tokens are also returned in JSON bodies, which encourages browser-storage persistence and undermines `HttpOnly`.

**Remediation:** TOTP or WebAuthn for platform admins (mandatory) and org admins (strongly encouraged, mandatory for payroll execution); short idle timeouts for privileged roles; step-up authentication for payroll execute and bank-detail changes; stop returning tokens in bodies for browser clients.

---

### SEC-030 — Vulnerable runtime dependencies

- **Severity:** Medium · **Confidence:** Confirmed (versions in `package-lock.json`, which is what CI and Docker install)

`npm audit --package-lock-only --omit=dev` reports 9 production advisories (1 critical, 7 high, 1 moderate):

| Package (installed) | Advisory | Applicable? |
|---|---|---|
| `multer` 2.3.0 (via `@nestjs/platform-express`) | Multiple DoS: GHSA-q7qp-rjg7-q26m, GHSA-3pph-fpjx-jg34; fileFilter race | **Yes**: document upload uses multer (`people-documents.controller.ts`) |
| `body-parser` 2.x < 2.4.0 | DoS via trailing bytes after compressed body (GHSA-27r3-jxmh-p828) | **Yes**: all JSON endpoints, including public ones |
| `proxy-addr` < 2.0.8 | IP spoofing via IPv4-mapped IPv6 trust subnet (GHSA-jqcg-44mw-7w3h, critical) | **Not currently**: `trust proxy` is unset. Becomes relevant when SEC-022 is fixed with subnet-based trust |
| `prisma` / `@prisma/config` → `deepmerge-ts`, `mysql2` | Stack exhaustion; MySQL auth downgrade | Low: CLI/config only; MySQL is not used |
| `fast-uri` | Several URI parsing issues | Low: build-time tooling path |

Dev-only (`pnpm audit`, full tree): `handlebars` (critical, via `ts-jest`), `brace-expansion`, `js-yaml`, `qs` (via `supertest`). These are not shipped in the runtime image, but CI executes them.

**Remediation:** upgrade `@nestjs/platform-express` (pulls `multer` ≥ 2.5 and `body-parser` ≥ 2.4) and `prisma` to patched versions; keep a single lockfile (see SEC-038).

---

### SEC-031 — Authentication hardening gaps (Low)

- **Severity:** Low · **Confidence:** Confirmed

All references are in `src/auth/auth.service.ts` unless noted.

- **OTP generation:** uses `Math.random()` (`:881-883`). Use `crypto.randomInt`.
- **No per-account attempt limit:** verify-email, login and reset rely only on per-IP throttling, which is weakened by SEC-022.
- **Account enumeration:**
  - signup returns 409 "account exists" (`:247-249`);
  - invitation preview returns `hasAccount`;
  - login does no dummy hash work when the user is absent (timing);
  - login returns "Please verify your email" only after a correct password.
- **Inconsistent password policy:** the legacy invitation accept requires a minimum of 8 characters (`invitations/dto/accept-invitation.dto.ts`), versus 12 elsewhere.
- **Reset token in the URL query string:** may leak via Referer or logs on the frontend.

---

### SEC-032 — Audit trail gaps (Low)

- **Severity:** Low · **Confidence:** Confirmed; `resourceId` point Suspected

**Gaps**

- Only successful mutations are recorded. Failed logins, 401/403 responses, permission denials, sensitive reads (payslip and PII exports) and DLQ replays (the row is deleted at `outbox.service.ts:200`) are not.
- `audit_log` has no append-only protection; the application role can UPDATE or DELETE it.
- `AuditInterceptor` runs before `TransformInterceptor` and reads `responseBody.id` from the wrapped response, so `resourceId` is likely always null.
- Write failures are silently dropped.

**Remediation:** explicit security events (login success and failure, role change, offboard, replay, export); DB-level append-only (REVOKE UPDATE/DELETE, or a trigger); alerting on repeated 403s and privilege changes.

---

### SEC-033 — Logging hygiene (Low)

- **Severity:** Low · **Confidence:** Confirmed

**Gaps**

- `PINO_REDACT_PATHS` (`src/common/logger/logger.constants.ts:21`) misses `cookie`, `set-cookie`, `currentPassword`, `newPassword`, `code`, `otp`, `apiKey`/`x-api-key`, `phone`, `dateOfBirth` and `pensionRsaNumber`.
- Pino redaction does not apply to template-string messages, which most call sites use. Examples:
  - account numbers: `anchor.client.ts:120, 150, 421`, `banking.service.ts:440`
  - emails: `waitlist.service.ts`, `email.service.ts`, `invitations.service.ts:91`
- The client-supplied `x-correlation-id` is reflected into headers and logs without length or charset validation (`request-context.middleware.ts:9-13`).

No reset URLs or invitation tokens are logged.

---

### SEC-034 — Public `/metrics` endpoint (Low)

- **Severity:** Low · **Confidence:** Confirmed

**Details:** `src/main.ts:56-65` and `src/common/metrics/metrics.controller.ts` expose:

- the route inventory, including admin and banking routes;
- per-route volumes and 401/403 rates;
- DLQ depth;
- circuit-breaker names;
- runtime details.

Each scrape also triggers a DB count. IDs are normalised, so no user or org identifiers appear.

**Remediation:** protect with a bearer token or network allow-list, or serve on an internal port.

---

### SEC-035 to SEC-044 — Lower-severity and informational items

| ID | Detail | Files | Remediation |
|---|---|---|---|
| SEC-035 | Unbounded lists: `EmployeeQueryDto.limit`, `LeaveQueryDto.limit` without `@Max`; `payroll getRuns` (includes all items), `getPayslips`, `getAllCompensations`, spend lists, cards, pension schedules | `employees/dto/employee-query.dto.ts`, `leave/dto`, `payroll.service.ts`, `spend.service.ts:366-455` | Cap page size (≤100) and paginate everywhere |
| SEC-036 | `GET /organizations` returns the full Organization row (taxId, metadata, `penCentralEmployerCode`) to any role; any member lists invitations; two `GET /compliance/alerts` handlers, one with no role restriction (registration order decides) | `organizations.service.ts:21-29`, `invitations.controller.ts:39-43`, `compliance/tenant-compliance.controller.ts` | Explicit selects for non-admins; remove the duplicate route |
| SEC-037 | `POST /banking/verify-account` open to every role (NUBAN name enumeration, Anchor cost); Anchor, PenCentral and email provider error text echoed to clients | `banking.controller.ts:38-42`, `anchor.client.ts:394, 480, 573`, `pencentral.client.ts`, `email.service.ts:65-68` | Restrict and throttle per user; return generic upstream errors |
| SEC-038 | Workflows lack `permissions:`; `npm install -g @railway/cli` unpinned in the job holding `RAILWAY_TOKEN`; actions pinned by tag; no protected `environment`; CI and Docker use `npm ci` + `package-lock.json` while development uses pnpm (lockfiles last updated 2026-10-17 vs 2026-09-24) | `.github/workflows/*.yml`, `Dockerfile` | `permissions: contents: read`; pin CLI version and action SHAs; protected production environment; single lockfile |
| SEC-039 | Duplicate waitlist POST returns the stored name, position and business; no max lengths | `waitlist.service.ts:17-33`, DTO | Generic response; `@MaxLength` |
| SEC-040 | Local compose publishes Postgres on `0.0.0.0:5432` with password `postgrespassword` | `docker-compose.yml` | Bind to 127.0.0.1 |
| SEC-041 | `SetCompensationDto` documents `basicSalary` as kobo, but tax bands and payout (`× 100`) treat it as naira, so a client following the DTO doc would cause 100× payouts | `payroll/dto/set-compensation.dto.ts`, `payroll.service.ts:561` | Pick one unit (minor units), validate bounds |
| SEC-042 | CORS `allowedHeaders` omits `Idempotency-Key`, so browsers cannot call `@Idempotent({required:true})` endpoints cross-origin | `main.ts:82-86` | Add the header (and `X-Correlation-Id`) |
| SEC-043 | Advances record `monthlyDeduction`, but payroll never deducts it; no maximum on advance amount or months | `spend.service.ts:153-166`, `payroll.service.ts:210-319` | Implement recovery; cap relative to salary |
| SEC-044 | Example login passwords (including for `admin@stackhr.app`) in the Postman collection, synced to published docs. They look like placeholders and don't match `.env.example` | `docs/postman/StackHR.postman_collection.json:394, 586, 1727` | Replace with `{{variables}}`; confirm none is a real credential |

---

## E. Attack Surface Inventory

### Unauthenticated endpoints

| Route | Purpose | Notes |
|---|---|---|
| `GET /`, `GET /health` | Health | Runs `SELECT 1` |
| `GET /metrics` | Prometheus | **SEC-034** |
| `POST /` , `POST /banking/webhook` | Anchor webhook | HMAC-verified; **SEC-018** |
| `POST /v1/api/auth/business/register|signup`, `verify-email`, `resend-verification`, `business/login`, `admin/login`, `forgot-password`, `reset-password`, `GET reset-password/verify` | Auth | Throttled per IP (**SEC-022**) |
| `GET /v1/api/auth/invitations/:token`, `POST /auth/invitations/accept` | Token-based invite | Well designed |
| `GET /v1/api/invitations/:id`, `POST /v1/api/invitations/:id/accept` | Legacy ID-based invite | **SEC-008 / SEC-001** |
| `POST /v1/api/waitlist` | Waitlist | **SEC-039** |

### Authenticated, but no role restriction (any member, including EMPLOYEE)

These are the endpoints where authorization **could not be verified as sufficient**, or was found deficient.

| Route(s) | Issue |
|---|---|
| `/employees` (all 8 routes) | **SEC-002** |
| `GET /payroll/compensation/:employeeId` | **SEC-012** |
| `POST /approvals`, `GET /approvals`, `GET /approvals/chain-config` | **SEC-007**; list is role-filtered in the service |
| `GET /invitations` | **SEC-008** |
| `/leave/balances`, `/leave/history`, `/leave/requests`, `/leave/requests/:id`, `/leave/requests/:id/cancel` | **SEC-016** |
| `/spend/expenses*`, `/spend/advances*`, `/reimbursements*` (except pay/disburse) | **SEC-017** |
| `GET /banking/banks`, `POST /banking/verify-account`, `GET /banking/cards`, `GET /banking/cards/:id` | **SEC-028, SEC-037** |
| `GET /organizations` | **SEC-036** |
| `GET /compliance/active-rule-set`, `GET /compliance/alerts` (tenant) | **SEC-036** |
| `GET /people/documents/:id/download` | Service-level ownership check, broken by **SEC-005** |
| `/me/*` | Self-scoped by email (**SEC-005**) |
| `GET /pension/pfas` | Reference data |
| `GET /onboarding/status` | Low risk |

### Administrative and financial operations (org-admin roles)

- **Payroll:** `POST /payroll/compensation`, `runs`, `runs/:id/calculate`, `submit`, `funding-check`, `execute` (Idempotency required), `reconcile`; `GET` runs, payslips, audit-events.
- **Spend:** `POST /spend/advances/:id/disburse`, `POST /reimbursements/:id/pay` (no idempotency; **SEC-006, SEC-015**).
- **Banking:** `GET /banking/deposit-account`, `POST deposit-account/sync`, `POST cards`, `PATCH cards/:id/freeze|limit`.
- **Pension:** all `/pension/*` except `pfas` (**SEC-013**).
- **People:** all `/people/*` (correctly class-level admin; document upload uses multer, **SEC-030**).
- **Onboarding:** `/onboarding/company|complete|employees|employees/import`.
- **Invitations:** `POST`, `DELETE`, `POST :id/resend` (**SEC-001, SEC-008**).

### Platform operations (`STACKHR_ADMIN` / `STACKHR_SUPPORT`; reachable via SEC-001)

- `GET /stackhr-admin/me`, `GET /stackhr-admin/outbox/dlq`, `POST /stackhr-admin/outbox/dlq/:id/replay`
- `GET|POST|PATCH /stackhr-admin/compliance/rule-sets`, `POST /stackhr-admin/compliance/seed-nta2026`
- `GET /waitlist`

### Background and internal

- Outbox poller (3 s, no tenant context).
- Approval, leave, payroll and spend event listeners.
- Anchor and PenCentral outbound clients.
- SendByte email.
- S3/R2 document storage.

---

## F. Access Control Matrix

Roles as implemented. **Org Admin** = `BUSINESS_OWNER` / `BUSINESS_ADMIN` / `HR_ADMIN`; no code path distinguishes them. Legend:

- ✅ allowed
- ❌ denied
- ◐ conditional (as stated)
- ⚠️ allowed **but should not be**
- ? unverified

| Resource / action | Employee | Manager | Org Admin | STACKHR_SUPPORT | STACKHR_ADMIN |
|---|---|---|---|---|---|
| Own profile (`/me/profile`) read/update | ◐ by email match (SEC-005) | ◐ same | ◐ same | ❌ (no org) | ❌ (no org) |
| All employees: full PII read (`/employees`) | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| Employee create/update/offboard (`/employees`) | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| Employees via `/people/employees` | ❌ | ❌ | ✅ | ❌ | ❌ |
| Other employee's compensation history | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| Payroll runs (create/calc/submit/execute) | ❌ | ❌ | ✅ | ❌ | ❌ |
| Payroll approval decision | ❌ | ⚠️ (all types) | ✅ (not own) | ❌ | ❌ |
| Payslips (org-wide) | ❌ | ❌ | ✅ | ❌ | ❌ |
| Own payslips | ◐ by email | ◐ | ◐ | ❌ | ❌ |
| Leave: own request create | ✅ | ✅ | ✅ | ❌ | ❌ |
| Leave: other's request read/cancel | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| Leave decision (`/people/leave`) | ❌ | ❌ | ✅ (self check by email) | ❌ | ❌ |
| Expense/advance/reimbursement: own create | ✅ | ✅ | ✅ | ❌ | ❌ |
| Expense/advance/reimbursement: other's read/cancel | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| Reimbursement pay / advance disburse | ❌ | ❌ | ✅ (pay without approval ⚠️) | ❌ | ❌ |
| Submit arbitrary approval request | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ |
| Documents: upload / list | ❌ | ❌ | ✅ | ❌ | ❌ |
| Documents: download | ◐ company docs + own (by email) | ◐ | ✅ | ❌ | ❌ |
| Invitations: create | ❌ | ❌ | ✅ (any role string ⚠️) | ❌ | ❌ |
| Invitations: list | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| Invitations: accept by ID | ⚠️ unauthenticated | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Corporate cards: issue/freeze/limit | ❌ | ❌ | ✅ | ❌ | ❌ |
| Corporate card read by ID | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| Bank account verification (NUBAN lookup) | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ |
| Pension config/schedules | ❌ | ❌ | ✅ (free-form employer code ⚠️) | ❌ | ❌ |
| Organization settings (full row) read | ⚠️ | ⚠️ | ✅ | ? | ? |
| Global tax rule sets: read | ❌ | ❌ | ◐ active set only | ✅ | ✅ |
| Global tax rule sets: write | ❌ | ❌ | ⚠️ via SEC-001 | ⚠️ (should be read-only) | ✅ |
| DLQ list/replay (cross-tenant) | ❌ | ❌ | ⚠️ via SEC-001 | ✅ | ✅ |
| Waitlist list | ❌ | ❌ | ⚠️ via SEC-001 | ✅ | ✅ |
| Access after offboarding | ⚠️ retained | ⚠️ | ⚠️ | n/a | n/a |

---

## G. Dependency and Configuration Findings

### Tool results

| Tool | Target | Result |
|---|---|---|
| `pnpm audit` | `pnpm-lock.yaml`, full tree | 38 advisories: 3 critical, 21 high, 11 moderate, 3 low. Critical ones are `handlebars` (dev, via ts-jest) and `proxy-addr` (runtime, not currently exploitable) |
| `npm audit --package-lock-only --omit=dev` | `package-lock.json` (what CI and Docker install) | 9 production advisories: 1 critical, 7 high, 1 moderate. See SEC-030 for applicability |
| Git history secret scan | All commits; regexes for AWS keys, private keys, cloud Postgres URLs, `*_API_KEY=` / `S3_SECRET_ACCESS_KEY=` with real-looking values | **No matches.** Only `.env.example` (placeholders) was ever committed; `.env` is git-ignored and docker-ignored |
| Unit tests (`jest`) | 76 suites | **59 suites / 423 tests passed.** 17 suites failed to load because `prom-client`, `pino` and `@opentelemetry/api` are absent from the local `node_modules`; not installed, per audit constraints |

### Secret management

- No real credentials were found in tracked files or history.
- Secrets are read from environment variables; there is no secret-manager integration.
- Several have insecure fallbacks (SEC-027).
- The documented field-encryption keys are unused (SEC-023).
- Postman docs contain example passwords (SEC-044).

### Insecure configuration

- Dev origins in the production CORS list (SEC-024).
- No `trust proxy` (SEC-022).
- `SameSite=None` cookies with no CSRF protection (SEC-011).
- Public `/metrics` (SEC-034).
- PM2 defaults to development (SEC-027).
- Default urlencoded parser enabled (SEC-011).

### Infrastructure

**Good**

- Dockerfile: multi-stage build, non-root `USER node`, no secrets baked in, `.env` in `.dockerignore`.

**Issues**

- Production deploys with `railway up` and no migration step. The schema is applied out of band (`db push` per `docker-compose.yml`), so the database state is not reproducible from the repo and no RLS or DB-role definitions are versioned.
- CI hygiene gaps (SEC-038).

### Not verifiable from the repo

TLS termination, Railway network exposure of Postgres, DB role privileges, R2/S3 bucket ACLs and public-access settings, backup encryption and retention, Anchor and PenCentral account configuration, SendByte domain authentication (SPF, DKIM, DMARC).

---

## H. Recommended Remediation Roadmap

### P0 — Immediate (containment; days)

| Finding | Change | Dependencies | Effort | Validation |
|---|---|---|---|---|
| SEC-001 | `@IsIn` allow-list on invitation role; add `PlatformGuard` (userType + null org) to all platform routes | None | S | 400 on forged role; 403 for BUSINESS user with platform role |
| SEC-001 | **Containment:** query production for `Member.role`/`User.role` outside the expected set, and BUSINESS users holding platform roles; diff `TaxRuleSet` against the expected NTA 2026 values | DB access | S | Query output reviewed and anomalies remediated |
| SEC-002 | Class-level `@RequireRoles(org admin)` on `EmployeesController`, or disable it | Confirm the frontend uses `/people/employees` | S | EMPLOYEE gets 403 on all `/employees` routes |
| SEC-008 | Remove `GET/POST /invitations/:id[/accept]`; restrict `GET /invitations` to admins | Frontend uses the token flow | S | Routes return 404/403 |
| SEC-012 | `@RequireRoles` on `GET /payroll/compensation/:employeeId` | None | XS | EMPLOYEE gets 403 |
| SEC-003 / SEC-004 | Remove placeholder bank defaults; propagate transfer errors; do not mark EXECUTED/PAID on failure | None | M | Failed or missing-data transfers leave records unpaid |
| SEC-006 | Require `APPROVED` status in `payReimbursement` | None | XS | 400 on paying PENDING |
| SEC-010 | Redact `currentPassword`/`newPassword` (pattern-based, recursive); purge affected audit rows | None | S | No password values in audit rows |
| SEC-027 | Fail startup in production if `ANCHOR_API_KEY`, `AUTH_SECRET` or `SENDBYTE_API_KEY` is missing | Deployment secrets present | S | Boot fails without the secrets |

### P1 — High priority (weeks)

| Finding | Change | Dependencies | Effort | Validation |
|---|---|---|---|---|
| SEC-005 | Resolve "me" by `Employee.userId` across me, leave, spend, documents and people-leave | Backfill `userId` links | M | Changing email does not change identity |
| SEC-009 | Revoke membership and sessions on offboard; block offboarded logins; short-TTL or shared session cache | None | M | Offboarded tokens return 401 |
| SEC-007 | Remove or validate `POST /approvals`; org-scoped, conditional listener transitions | None | M | Forged or terminal-subject approvals rejected |
| SEC-011 | Origin / Sec-Fetch-Site check or custom header on state-changing requests; disable urlencoded parser; plan same-site API domain with `SameSite=Lax` | Frontend header change | M | Cross-origin form POST returns 403 |
| SEC-013 | Bind PenCentral employer only through attach, with a unique code; remove PATCH | PenCentral grant model | M | Cannot set another org's code |
| SEC-014 | Versioned migrations with RLS and an app role; extended `$transaction`; full operation and model coverage | Migration baseline from current prod schema | L | Two-tenant integration suite passes |
| SEC-015 | Atomic state claims; idempotency on disburse and pay; route-aware fingerprint; no auto-retry of transfer POSTs | None | M | Concurrent execute produces one transfer |
| SEC-016 / SEC-017 | Ownership checks for leave and spend reads, cancels and receipts | SEC-005 | M | Cross-employee access denied |
| SEC-029 | MFA for platform admins (mandatory) and payroll executors | None | M | Admin login requires a second factor |
| SEC-030 | Upgrade `@nestjs/platform-express` and `prisma`; regenerate the lockfile | SEC-038 lockfile decision | S | `npm audit --omit=dev` clean of high/critical |

### P2 — Medium priority

| Finding | Change | Effort | Validation |
|---|---|---|---|
| SEC-018 | Webhook event-ID dedup; per-item reconciliation; balance resync | M | Duplicate webhook is a no-op |
| SEC-019 | SUPPORT read-only; append-only versioned tax rules with maker-checker | M | PATCH by SUPPORT returns 403; history retained |
| SEC-020 | Payroll approval limited to admins; manager scope; conditional decide | M | Manager gets 403 on payroll approval |
| SEC-021 | Generic 500 responses | S | No internal text in responses |
| SEC-022 | `trust proxy` (exact hops); Redis throttler; per-account login limits | M | Per-client limits observed behind the proxy |
| SEC-023 / SEC-025 | Field encryption for bank and tax IDs; verified, approved bank-detail changes | L | Ciphertext at rest; bank change requires approval |
| SEC-024 | Production CORS from env, stackhr.app only | XS | Dev origin rejected in production |
| SEC-026 | Atomic outbox claim; unique `Reimbursement.expenseId` | S | Concurrent pollers process each event once |
| SEC-028 | Card ownership and limit caps | S | Employee sees only own card |

### P3 — Hardening

SEC-031 to SEC-044:

- auth hardening (CSPRNG OTP, enumeration, password policy);
- audit coverage and append-only storage;
- logging redaction;
- protected `/metrics`;
- pagination caps;
- response minimization;
- CI permissions and pinning;
- single lockfile;
- compose binding;
- unit consistency;
- advance recovery;
- Postman cleanup;
- CORS header for `Idempotency-Key`.

Add SAST (for example Semgrep with NestJS rules) and dependency scanning (Dependabot or Renovate) to CI.

---

## I. Security Test Plan

Use a local database with synthetic data. Create two organizations (Org A, Org B), each with users for Owner, HR_ADMIN, MANAGER and two EMPLOYEEs (E1, E2), plus one STACKHR_SUPPORT and one STACKHR_ADMIN. Mock the Anchor, PenCentral and SendByte clients; no real transfers or emails.

| # | Test | Expected secure behaviour | Finding |
|---|---|---|---|
| T1 | Org A HR_ADMIN `POST /invitations {role:"STACKHR_ADMIN"}` | 400 | SEC-001 |
| T2 | BUSINESS user whose membership role is `STACKHR_ADMIN` calls `GET /stackhr-admin/outbox/dlq` and `PATCH /stackhr-admin/compliance/rule-sets/:id` | 403 | SEC-001 |
| T3 | E1 calls `GET /employees`, `GET /employees/:E2`, `PATCH /employees/:E2` | 403 | SEC-002 |
| T4 | E1 `GET /payroll/compensation/:E2` | 403 | SEC-012 |
| T5 | E1 changes `Employee(E2).email` to E1's login email (as admin), then E1 `GET /me/profile` | Returns E1's record | SEC-005 |
| T6 | Unauthenticated `POST /invitations/:id/accept` | 404 (route removed) | SEC-008 |
| T7 | Offboard E1, then reuse E1's existing token and attempt login | 401 / login rejected | SEC-009 |
| T8 | `executePayment` with an employee missing `accountNumber`; mocked transfer rejects | Transfer not called with a placeholder; run not EXECUTED | SEC-003/004 |
| T9 | Admin `POST /reimbursements/:id/pay` on a PENDING claim | 400 | SEC-006 |
| T10 | E1 `POST /approvals` for E2's advance, for E1's DISBURSED advance, and for an Org B advance ID | 400/404; listener makes no change | SEC-007 |
| T11 | `POST /auth/change-password`, then inspect `audit_log.payload` | No password values | SEC-010 |
| T12 | Cookie-authenticated form POST (`application/x-www-form-urlencoded`) with `Origin: https://evil.example` to `/reimbursements/:id/pay` | 403 | SEC-011 |
| T13 | Two concurrent `POST /payroll/runs/:id/execute` with different idempotency keys | Exactly one bulk-transfer call | SEC-015 |
| T14 | Same idempotency key reused for `runs/A/execute` then `runs/B/execute` | Second request rejected (key/route mismatch), not replayed | SEC-015 |
| T15 | Every repository method invoked under an Org A context with Org B IDs, including within `TenantPrismaService.run` and via `findUnique` | No rows returned or modified | SEC-014 |
| T16 | E1 `PATCH /leave/requests/:E2request/cancel`; E1 `GET /leave/history?employeeId=E2` | 403/404 | SEC-016 |
| T17 | E1 reads, cancels or attaches a receipt to E2's expense, advance or reimbursement | 403/404 | SEC-017 |
| T18 | Same signed `deposit.successful` webhook delivered twice | Balance incremented once | SEC-018 |
| T19 | STACKHR_SUPPORT `PATCH /stackhr-admin/compliance/rule-sets/:id` | 403 | SEC-019 |
| T20 | MANAGER decides a PAYROLL approval | 403 | SEC-020 |
| T21 | Force a Prisma error (e.g. `?limit=abc` on a DLQ route) | Generic message, no Prisma text | SEC-021 |
| T22 | Org A admin `PATCH /pension/config` with Org B's employer code | Rejected | SEC-013 |
| T23 | 6 failed logins for one account from rotating IPs | Account-level throttle engages | SEC-022/031 |
| T24 | Boot with `NODE_ENV=production` and no `ANCHOR_API_KEY` | Startup fails | SEC-027 |

Run T1–T24 in CI as a security regression suite. T13 and T15 need a real Postgres test database, which `docker-compose.yml` already provisions as `stackhr_test`.

---

## J. Production Readiness Checklist

| Area | Status | Evidence |
|---|---|---|
| Authentication: password storage | **Pass** | argon2id (`auth.service.ts:953-955`); scrypt legacy re-hashed on login |
| Authentication: session tokens | **Pass** | 256-bit random, SHA-256 hashed at rest, HttpOnly/Secure cookie |
| Authentication: MFA / session lifetime | **Fail** | No MFA; 30-day absolute sessions (SEC-029) |
| Authentication: revocation | **Fail** | Offboarding retains access; per-process 30-day cache (SEC-009) |
| Authentication: brute-force protection | **Fail** | Per-IP only, broken behind the proxy (SEC-022) |
| Authorization: function level | **Fail** | Platform roles reachable by business users (SEC-001); unguarded `/employees` (SEC-002) |
| Authorization: object level | **Fail** | SEC-005, 012, 016, 017, 028 |
| Tenant isolation | **Fail** | No RLS; extension gaps; unscoped transactions (SEC-014) |
| Employee data protection | **Fail** | Org-wide PII exposure (SEC-002); plaintext identifiers (SEC-023); passwords in audit log (SEC-010) |
| Payroll security | **Fail** | Placeholder payees, swallowed failures, unapproved payouts, races (SEC-003/004/006/015) |
| API security: validation | **Pass** (with gaps) | Global whitelist/forbid pipe; missing `@Max` and allow-lists (SEC-035, SEC-001) |
| API security: CSRF / CORS | **Fail** | SEC-011, SEC-024 |
| API security: error handling | **Fail** | SEC-021 |
| File security | **Pass** (partial) | Admin-only upload, server-generated keys, MIME + magic bytes, size cap, authenticated downloads. Not verified: bucket privacy, malware scanning |
| Webhook security | **Pass** (partial) | HMAC + constant-time compare; no replay protection (SEC-018) |
| Database and infrastructure | **Not Verified** | Dockerfile good; production DB roles, network exposure, TLS and backups not in repo |
| Dependency management | **Fail** | Applicable high-severity DoS advisories; dual lockfiles (SEC-030, SEC-038) |
| Secrets management | **Pass** (partial) | No committed secrets; insecure fallbacks (SEC-027) |
| Logging and monitoring | **Fail** | Redaction gaps; no auth-failure or security events; public metrics (SEC-032/033/034) |
| Backup and recovery | **Not Verified** | No backup configuration in repo |
| Incident response | **Not Verified** | No runbooks or alerting definitions in repo |

---

## K. Audit Limitations

- **No runtime exploitation.** Every finding comes from static analysis. No local database was provisioned and no server was started, because provisioning would require `prisma db push` (a schema change) and installing missing packages, both outside the agreed constraints. Findings marked Confirmed were traced through code. They are not proven against a running instance.
- **Unit tests:** 17 of 76 suites could not load because `prom-client`, `pino` and `@opentelemetry/api` are not installed locally. Results for those suites are unknown.
- **Out of scope / not available:**
  - the frontend applications (token storage, CSP, XSS, use of cookie vs bearer);
  - the production database (actual schema, whether the `stackhr_app` role or any RLS exists out of band, data contents);
  - Railway configuration (proxy hops, network exposure, environment variables);
  - R2/S3 bucket policies;
  - Anchor, PenCentral and SendByte account configuration and behaviour (e.g. transfer-reference uniqueness, webhook retry semantics, which employer codes are attached to the partner key);
  - backups and disaster recovery;
  - DNS, TLS and email authentication.
- **Dependency analysis** relies on `npm audit` / `pnpm audit` advisory data as of the audit date; applicability was assessed manually. No SAST tool was available or installed.
- **Secret scanning** used targeted regexes over git history rather than a dedicated scanner (e.g. gitleaks or trufflehog), so unusual secret formats could be missed.
- **Regulatory:** observations about the NDPA 2023 and GDPR are technical. They include:
  - data minimization failures (SEC-002, SEC-010);
  - missing encryption at rest for financial identifiers (SEC-023);
  - no retention or deletion mechanism for audit logs, idempotency responses or offboarded employee data;
  - no data-subject export or deletion workflow.

  Whether these constitute non-compliance, and whether any past exposure is notifiable, needs legal or DPO review. Nothing in this report is a legal compliance determination.
