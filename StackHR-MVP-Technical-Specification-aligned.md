**StackHR MVP & Technical Product** 

**Specification** 

**1\. What StackHR Is** 

**Vision:** To become the operating system for how African businesses manage their people, pay, and spend — starting in Nigeria, built for the world. 

**Mission:** StackHR eliminates the operational chaos of running a business by unifying People Ops, Payroll Ops, and Spend Ops into one AI-powered platform, purpose-built for African SMEs and scalable to global companies. 

**Positioning:** "BambooHR \+ Rippling \+ Bujeti for African SMEs." 

• Marketing: https://www.stackhr.app | Beta app: app.stackhr.app 

• Beta live since July 7, 2026; active pilot acquisition, 5–100 person companies, primarily Abuja/Lagos 

**2\. MVP Product Scope (Original Freeze)** 

The MVP feature set was frozen after reaching the scope below, meaning subsequent work has been bug fixing, UX polish, testing, and deployment hardening (plus the payroll rework in Section 4\) rather than continuous module expansion.

| MVP Area  | Core Features |
| :---- | :---- |
| Authentication  | Signup, login, password/authentication flows |
| Organization  | Company setup, organization profile, branding |
| Employees  | Employee records, employee onboarding, invitations |
| HR  | Employee management, leave management |
| Payroll  | Salary structures, payroll calculation, statutory deductions, payslips |
| Expenses  | Spend/expense management |
| Reimbursements  | Employee reimbursement requests and approvals |
| Salary Advances  | Advance requests and management |
| Approvals  | Approval workflows and role-based actions |
| Notifications  | In-app/email notifications |
| RBAC  | Admin, Manager, Employee roles |

StackHR MVP & Technical Product Specification Page 1 

| MVP Area  | Core Features |
| :---- | :---- |
| Team Management  | Role and permission management |
| Onboarding  | Organization setup, templates, guided setup |
| Testing  | Playwright tests, TypeScript/build validation |
| Infrastructure  | NeonDB PostgreSQL, Cloudflare R2, Vercel, GitHub |

Attendance tracking was scoped out entirely and is not in MVP. 

**3\. Current Implemented Functionality (as of Aug 11, 2026\)** 

**People Operations** 

Employee Management, Leave Management, Document Management, Onboarding (company \+ employee), Org Structure, all live. 

**Payroll Operations** 

Salary Management, Payroll Runs, Payslips, Tax, Bonuses, Deductions, Salary Advances, all live, and the payroll engine has just been substantially reworked (see Section 4). 

**Spend Operations** 

Expense Claims, Reimbursements, Spending Approvals, are all live. 

**Billing & Subscriptions** 

• **Phase 1 (live, tested end-to-end):** 14-day trial state machine, subscriptions PostgreSQL table, TrialBanner, and Anchor payment setup. 

• **Phase 2 (live, tested end-to-end):** Anchor webhook handling with signature verification, daily cron for trial-to-paid conversion and monthly renewals. Expired trials with no payment method correctly downgrade to Free. 

• Anchor payment integration is currently in **test mode**. 

• Stripe (USD tiers — Business/Enterprise) is planned, not built. 

• Marketing site pricing CTAs pass ?plan=<tier> into signup → auto-provisions the correct subscription row. 

**Onboarding Fixes (post-launch)** 

Reduced to essentials; "Need Help?" and "Save & Continue Later" needs to be added; signup validation (Gmail  allowed in beta); onboarding checklist on dashboard; welcome \+ re-engagement email sequence; fixed a production  hang bugin the employee-save step (redirect moved server-side). 

**4\. Current Payroll Architecture** 

**Objective of the rework:** Rebuild payroll as a rule-based compliance engine rather than a collection of hardcoded Nigerian payroll calculations. The engine separates: 

• Payroll calculation logic 

• Jurisdiction-specific tax rules 

• Organization configuration

StackHR MVP & Technical Product Specification Page 2   
• Statutory contribution applicability 

• Audit/version information 

This means future tax-law changes are implemented by updating a versioned rule set, not rewriting the payroll engine. 

**4.1 Tax Rule Architecture** 

• **NG-2026-v1** — based on the Nigeria Tax Act 2025, effective January 1, 2026\. Implements: CRA abolished, rent relief, progressive tax bands, national minimum wage exemption, PAYE computation, statutory contribution rules. 

• **NG-2025** — retained for historical/pre-2026 payroll periods and backward compatibility. 

• **Automatic rule selection:** the rule registry selects the rule set based on the payroll period (e.g. December 2025 → NG-2025, January 2026 → NG-2026-v1). A historical payroll therefore does not change retroactively when current tax rules are updated. 

**4.2 Statutory Contribution Applicability** 

Statutory contributions are **not** treated as universal defaults. Each contribution (Pension, NHF, NHIA, NSITF, ITF) has an applicability rule returning mandatory, voluntary, or not\_applicable, with a plain-language explanation, derived from the organization profile. 

**Pension example** (considers sector, employee count, PenCom exemption): 

| Organization  | Pension |
| :---- | :---- |
| PenCom-approved exempt scheme  | Not applicable |
| Public service  | Mandatory |
| Private, 15+ employees  | Mandatory |
| Private, 3–14 employees  | Voluntary |
| Private, \<3 employees  | Voluntary |

Employee count is derived from the employee table, not supplied by the browser, so crossing the statutory threshold automatically changes applicability. ITF applicability similarly considers employee count and turnover. New statutory schemes can be added without changing the core payroll evaluator. 

**4.3 Configurable Contributions** 

Orgs can configure voluntary contributions (e.g. NHIA, additional voluntary pension, life assurance). Configured rate bounds are enforced at both validation and resolution levels, so a malicious or corrupted request cannot bypass statutory constraints. 

**4.4 Pension Calculation Base** 

Supports gross, basic, or BHT (Basic \+ Housing \+ Transport). Salary components classify as Basic / Housing / Transport / Other. If BHT can't be properly determined, there's a controlled fallback to gross with a warning. 

**4.5 Payroll Settings** 

Persisted at organization level: tax rule set, statutory contribution configuration, compliance profile, contribution preferences, applicable rates, salary-component classifications. Payroll runs auto-load these saved settings. 

**4.6 Payroll Auditability** 

Every payroll run is designed to be reproducible. Recorded per run: tax rule set ID, tax rule version, payroll engine version, generated-by, generated-at, approval information, compliance summary, settings snapshot.

StackHR MVP & Technical Product Specification Page 3   
Tax rule version and engine version are **deliberately separate,** tax law changes ≠ payroll calculation-engine changes. 

**4.7 Payroll Settings Snapshot** 

When a run is generated, StackHR captures the resolved settings used for that specific run, so future settings changes never rewrite the historical interpretation of an existing payroll (e.g. changing NHIA from 3%→5% later doesn't alter the August 2026 payroll). 

**4.8 Compliance Summary** 

Each run generates: gross payroll, employee deductions, employer contributions, net payroll, employee count, total employer cost, statutory remittance lines, audit metadata, compliance warnings, rule explanations. The remittance model distinguishes **employee contribution** vs **employer contribution,** foundation for future statutory remittance exports. 

**4.9 Payroll Preview** 

Before approval, admins see: gross payroll, total deductions, employer contributions, net payroll, employee count, total cost to employer, sourced from the persisted payroll summary, so what's approved is exactly what was calculated. 

**4.10 Compliance UX** 

Every contribution should explain: what it is, whether mandatory, why it applies, applicable rate, rate limits, legal reference, current status, so payroll administrators don't need to understand underlying legislation to configure StackHR correctly. 

**5\. Known Technical Limitations** 

**Payroll:** 

• No employee-level statutory profiles yet (PFA/RSA, NHF, NHIA, tax identifiers) — planned to be requested only when relevant, not made universally mandatory. 

• Rent relief is supported by the tax engine but currently lacks the employee-level annual rent field needed to populate it. 

• BHT/salary component classification is currently **organization-level only**; more granular employee-specific allowance structures will eventually need employee-level classification. 

• Payroll approval is not yet a fully configurable maker-checker workflow (see Section 12). 

• No payroll period/revision versioning model yet (e.g. "August 2026 Payroll — Revision 2"). **Billing:** 

• Subscription tiers do not enforce feature access — RBAC controls access independently of tier (feature gating intentionally deferred). 

• Anchor payment integration is in test mode; Stripe for USD tiers not yet built. 

**Capacity:** 

• Tested to \~200 employees per company. Database architecture is believed capable of \~500/company but this has **not been formally stress-tested,** this distinction should not be collapsed in external communication. 

**Known code debt:** 

• One pre-existing ESLint error in PlanPicker.tsx, untouched by the payroll work. 

**6\. Current Stack**

| Layer | Technology |
| :---- | :---- |
| Framework | React JS + Vite |
| Language | TypeScript |
| Authentication | BetterAuth |
| Database | NeonDB PostgreSQL |
| Database security | PostgreSQL RLS |
| Storage | Cloudflare R2 |
| Email | Sendbyte |
| Payments | Anchor |
| Hosting | Vercel |
| Error monitoring | Sentry |
| Analytics | Google Analytics 4 |
| Source control | GitHub |
| Theming | Application-level dark/light mode |
| Testing | Playwright (E2E), TypeScript/build validation |

The beta application and marketing site are deployed through Vercel with GitHub-based deployment and automatic deployment on push. The current architecture uses NeonDB PostgreSQL as the primary relational database, PostgreSQL RLS for tenant isolation, Cloudflare R2 for object/media storage, Sendbyte for transactional email, Anchor for payments, Sentry for error monitoring, and Google Analytics 4 for analytics.

**Security & Data**

• RLS policies remain the database-level tenant isolation mechanism across organization-owned PostgreSQL tables; 36/36 RLS tests were passing at the pre-payroll-rework baseline.  
• NIN/BVN encryption is in place.  
• UUID validation is enforced across employee routes (src/lib/uuid.ts).  
• Self-approval security bypass has been fixed.  

**Environment Configuration**

Environment variables are managed through the deployment environment for BetterAuth, NeonDB, Cloudflare R2, Sendbyte, Anchor, Vercel, Sentry, and Google Analytics 4. Secrets stay outside GitHub/source control.

**7\. User Roles & Permissions** 

• **Roles:** Admin, Manager, Employee. 

• **Model:** Purely role-based via rbac.ts MATRIX — access is **not** currently tied to subscription tier or status (see Section 5/11). 

• Team management supports assigning/managing these roles and permissions. 

StackHR MVP & Technical Product Specification

Page 5   
**8\. Core Workflows** 

1\. **Company onboarding** → org setup, branding, guided templates. 

2\. **Employee lifecycle** → invitation → onboarding → records (offboarding not built). 

3\. **Leave** → request → approval routing → tracking. 

4\. **Payroll run** → load org payroll settings → calculate (tax rules \+ statutory applicability \+ pension base) → generate compliance summary → preview → approval → settings snapshot recorded → payslip generation. 

5\. **Expense/reimbursement** → claim submission → approval → reimbursement. 

6\. **Salary advance** → request → approval → disbursement tracking. 

7\. **Billing** → trial start → payment setup → recurring charge (Anchor) → renewal/downgrade. 

**Planned future payslip flow:** Payroll Approved → Generate Payslip → Save to Employee Account → Notify Employee → Email Payslip (moving away from email-only distribution; employees should access payslip history from their account). 

**9\. Database / Domain Structure** 

• **Multi-tenancy:** every organization-owned table uses org\_id as the fundamental tenant boundary. 

• **Security:** Row Level Security enforced at the PostgreSQL layer, the application should never rely solely on frontend checks for tenant isolation. 

• **Modularity:** major domains are conceptually separated — People, Payroll, Spend — and this modularity should continue as the product expands. 

• Tables: subscriptions, expense\_claims, reimbursements, salary\_advances, plus core employee/org/payroll tables (\~29 tables total under RLS). 

• No full ERD is maintained in documentation; recommend generating one directly from the current PostgreSQL schema for onboarding/reference rather than reconstructing it from notes. 

**10\. Current Technical Debt** 

• Tier-based feature gating — deferred, still open. 

• Stripe billing for USD tiers — not yet built, still open. 

• Employee-level statutory profile fields — not yet built (Section 5/12). 

• Employee-level salary component classification — not yet built (currently org-level only). 

• Configurable maker-checker approval workflow for payroll — not yet built. 

• Payroll period/revision versioning model — not yet built. 

• One pre-existing ESLint error in PlanPicker.tsx. 

• (Resolved, for context — not open debt): UUID validation bug across employee routes, self-approval security bypass, onboarding employee-save redirect hang. 

**11\. Explicitly Out of MVP Scope** 

• Attendance tracking . 

• Tier-based feature gating (deferred, role-based access only for now).

StackHR MVP & Technical Product Specification Page 6   
• Stripe/USD recurring billing (Anchor/NGN is the current payment path; Anchor is still in test mode). 

• Employee-level statutory profiles, rent-relief field, employee-level salary component classification. • Configurable maker-checker payroll approval workflow. 

• AI features: payroll anomaly detection, AI-assisted leave/approval routing, expense/spend fraud detection, spend & payroll analytics (roadmap only, not built). 

**12\. Section 2 & Future Roadmap** 

**Payroll backlog (from the rework, tracked deliberately rather than silently ignored):** 

• Employee-level statutory profiles (PFA/RSA, NHF, NHIA, tax identifiers) requested only when relevant, not universally mandatory. 

• Employee-level annual rent field to activate rent relief, not compulsory as not all organization follow it. • Employee-level salary component classification (beyond current org-level BHT classification). 

• Configurable maker-checker approval workflow (e.g. HR→Approve, or HR→Finance→Approve, or HR→Finance→CFO→Approve). 

• Payroll period/revision versioning (e.g. "August 2026 Payroll — Revision 2"). 

• Payslip-to-account delivery (not email-only). 

• Statutory remittance exports (built on the employee/employer contribution split already in the compliance summary). **Broader near-term priorities:** 

• AI product layer (anomaly detection, fraud detection, analytics, AI-assisted approvals). 

• Tier-based feature gating. 

• Stripe integration for USD tiers. 

• Use-of-funds plan includes hiring first team member(s) alongside GTM and infrastructure/compliance work. **13\. Scalability Roadmap** 

**Principle:** Preserve the current architecture initially rather than prematurely introducing microservices. Scale based on measured bottlenecks, not architecture for hypothetical scale. 

• **Stage 2 — Growth:** Database indexing, query optimization, RLS performance, background jobs, scheduled jobs, caching where justified, observability, load testing, better audit infrastructure. 

Page 7 