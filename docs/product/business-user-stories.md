# StackHR Business User Stories

*Business User Story Map and Acceptance Criteria — converted from
`StackHR_Business_User_Stories.docx` for agent readability. Source of truth for wording
disputes remains the original docx.*

## Epic 1 — Account Creation & Organization Setup

**US-001 — Create a StackHR account**
As a business owner/admin, I want to create a StackHR account using my business and
personal information, so that I can set up my organization and start managing employees.
- Admin can enter name, email, password, and required business information.
- Required fields are validated.
- Duplicate accounts are handled appropriately.
- Organization is created after successful registration.
- User becomes the initial organization administrator.
- User is redirected to organization onboarding.
- Account information is securely associated with the correct organization.

**US-002 — Set up organization**
As an organization admin, I want to configure my company's basic information, so that
StackHR can personalize the platform and use the information for HR and payroll operations.
- Admin can provide company/legal name, registration information, address, industry,
  company size, and contact information.
- Organization information can be updated later.
- Changes are reflected in relevant HR and payroll processes.

**US-003 — Complete Organization Onboarding**
As an organization admin, I want to complete a guided onboarding process, so that I can
configure the minimum required settings before using StackHR.
- Onboarding displays progress.
- Admin can complete setup progressively.
- Admin can identify incomplete steps.
- Admin can save progress and continue later.
- Completed onboarding status is persisted.
- Appropriate help/support is available when the admin is unable to proceed.

## Epic 2 — Employee Management

**US-004 — Add an employee**
As a HR/Admin, I want to create an employee record, so that I can manage that employee
through StackHR.
- Admin can create an employee.
- Required employee information is validated.
- Employee is associated with the correct organization.
- Employee appears in the employee directory.
- Employee information can be used by relevant HR and payroll workflows.
- Invitation/access can be initiated where applicable.

**US-005 — Invite Employees**
As an Admin/Manager, I want to invite employees to StackHR so that they can access their
employee portal and complete required activities.
- Admin can invite an employee.
- Invitation contains the appropriate onboarding/access link.
- Invitation status is tracked.
- Admin can resend an invitation.
- Expired invitations can be handled.
- Employee cannot access another organization's data.

**US-006 — Manage Employee Records**
As a HR/Admin, I want to view and update employee information so that employee records
remain accurate.
- Admin can search employees.
- Admin can filter employees.
- Admin can view employee profiles.
- Admin can update permitted information.
- Employee information is reflected in payroll where applicable.
- Important changes are auditable.

**US-007 — Manage the organization structure**
As an Admin, I want to organize employees into departments, teams, and reporting
relationships so that the company's structure is accurately represented.
- Admin can create departments/teams.
- Employees can be assigned to departments or teams.
- Managers can be assigned.
- Reporting relationships can be represented.
- Organization structure is reflected in relevant workflows.

## Epic 3 — Employee Onboarding

**US-008 — Configure Employee Onboarding**
As an Admin, I want to configure employee onboarding requirements so that new employees
provide the information and documents the company requires.
- Admin can define onboarding requirements.
- Required employee information can be specified.
- Required documents can be specified.
- Employee onboarding progress is visible.
- Admin can identify incomplete onboarding.
- Employees can complete onboarding without exposing another employee's information.

**US-009 — Monitor employee onboarding**
As an HR/Admin, I want to see onboarding progress for each employee so that I can identify
incomplete tasks and follow up where necessary.
- Each employee has an onboarding status.
- Admin can see completed tasks.
- Admin can see outstanding tasks.
- Admin can identify missing documents or information.
- Employee can continue onboarding later.
- Completion status is updated when required information is submitted.

## Epic 4 — Leave Management

**US-010 — Configure Leave Policies**
As an admin, I want to configure leave types and policies so that employees can request
leave according to company rules.
- Admin can configure supported leave types.
- Leave allowances can be defined.
- Policies can be associated with employees where applicable.
- Leave balances can be calculated.

**US-011 — Manage leave requests**
As an employee's Manager/Admin, I want to review leave requests so that I can approve or
reject employee leave.
- Pending requests are visible.
- Request details are accessible.
- Authorized approvers can approve or reject.
- Rejection can include a reason.
- Employee is notified of the decision.
- Leave balance is updated appropriately.
- Request status is retained for future reference.

## Epic 5 — Payroll

**US-012 — Configure Payroll**
As an Admin, I want to configure payroll settings so that StackHR calculates payroll
according to my organization's rules and applicable Nigerian requirements.
- Admin can configure tax rule sets, statutory contributions, contribution preferences,
  contribution rates, salary-component classifications, pension calculation base, and
  compliance profile.
- Settings are persisted at the organization level.
- Only authorized users can change payroll settings.
- Changes apply appropriately to future payroll runs.

**US-013 — Manage employee compensation**
As an HR/Admin, I want to configure employee salaries and compensation components so that
StackHR can accurately calculate payroll.
- Admin can manage basic salary, housing, transport, other allowances, bonuses,
  deductions, and salary changes.
- Compensation changes have an effective date.
- Compensation is associated with the correct employee.
- Payroll uses the applicable compensation information for the payroll period.
- Previous payroll calculations are not unintentionally changed by later salary updates.

**US-014 — Run payroll**
As a payroll administrator/Manager/Admin, I want to generate a payroll run so that StackHR
calculates what the company owes its employees and their associated statutory obligations.
- System loads persisted payroll settings.
- Determines applicable tax rules based on the payroll period.
- Calculates employee earnings and deductions.
- Calculates employer contributions and net salary.
- Generates compliance information.
- Produces a payroll summary.
- Records the payroll engine version, applicable tax rule version, and settings snapshot.

**US-015 — Review payroll**
As a payroll administrator/Manager/admin, I want to preview payroll before approval so that
I can identify errors before money is paid.
- Preview displays gross payroll, total deductions, employer contributions, net payroll,
  employee count, total employer cost, and compliance warnings.
- Administrator can review individual employee calculations.
- Errors or warnings are clearly identified.
- Preview represents the same persisted payroll summary that will be approved.

**US-016 — Approve payroll**
As the authorized payroll approver, I want to approve a payroll run so that the
organization can proceed with payroll processing.
- Only authorized users can approve payroll.
- Payroll cannot be approved twice.
- Approval is recorded.
- Approver identity and timestamp are recorded.
- Payroll settings snapshot remains immutable.
- Unapproved payroll cannot proceed to payment execution.

**US-017 — Generate payslips**
As a payroll administrator/Manager/admin, I want to generate payslips after payroll
approval so that employees have a record of their compensation.
- Payslips correspond to the approved payroll.
- Each employee receives the correct payslip in their dashboard and via email.
- Payslip contains earnings, deductions and net pay.
- Payslip is associated with the correct payroll run.
- Employees can access their own payslip only.

## Epic 6 — Payroll Compliance

**US-018 — Determine statutory applicability**
As a payroll administrator, I want to determine which statutory contributions apply to my
organization, so that I don't have to manually interpret every requirement.
- System evaluates applicable rules based on relevant organization information.
- Each contribution displays whether it applies, mandatory/voluntary status, applicable
  rate, rate limits, reason, legal reference and current status.

**US-019 — Preserve historical payroll calculations** *(Status: Future / Required backlog
capability)*
As an organization, I want to keep historical payroll reproducible so that changes to tax
rules or payroll configuration don't alter previously processed payroll.
- Each payroll run stores tax rule ID, tax rule version, payroll engine version, settings
  snapshot, generation timestamp, generated by and approval information.
- Future changes to payroll settings must not rewrite historical payroll.

## Epic 7 — Expenses

**US-020 — Manage Employee Expenses**
As an Admin/Manager, I want to review employee expense claims, so that company spending can
be controlled.
- Admin can view submitted expenses.
- Expenses can be filtered by status.
- Expense details and receipts are accessible.
- Admin can approve or reject expenses.
- Rejection can include a reason.
- Employee is notified of the outcome.
- Expense decision is retained in history.

## Epic 8 — Reimbursements

**US-021 — Process reimbursements**
As a Finance/Admin user, I want to process approved employee reimbursements, so that
employees receive money owed to them.
- Approved expenses can move into reimbursement.
- Reimbursement status is tracked.
- Payment information is recorded.
- Employee can see reimbursement status.
- Completed reimbursements are retained in history.
- Failed reimbursement payments can be identified.

## Epic 9 — Salary Advances

**US-022 — Manage Salary Advance Requests**
As an Admin/Manager, I want to review employee salary advance requests, so that the company
can control salary advances according to its policies.
- Pending requests are visible.
- Employee eligibility can be determined.
- Admin can approve or reject.
- Decision is recorded.
- Employee receives notification.
- Advance is tracked through its lifecycle.
- Approved advances can be incorporated into the appropriate payroll/deduction process.

## Epic 10 — Approvals

**US-023 — Manage Approvals**
As an Admin, I want to manage pending organizational approvals from one place, so that I
don't have to check every module individually.
- Approval center can surface leave, expenses, reimbursements, salary advances and payroll.
- Each approval shows requester, request type, amount where applicable, date, current
  status and required action.

**US-024 — Configure maker-checker workflows**
As an organization, I want to define multi-step approval workflows so that sensitive
operations require appropriate authorization.
- Admin can define approval stages.
- Admin can assign an approver or role to each stage.
- A request cannot skip a required approval stage.
- Each approval decision is recorded.
- Rejected requests stop the workflow.
- Requester can see current approval status.
- Approval history is retained.
> **Note (ADR-006):** P0 seeds one system-default stage only; full configurability is P1.

## Epic 11 — Financial Operations

**US-025 — Set up a business financial account**
As an organization admin, I want to connect/set up a business financial account through
StackHR, so that StackHR can facilitate payroll and other approved financial operations.
- Organization completes required business verification.
- Financial account setup status is visible.
- Account information is securely stored.
- Account status is synchronized with the financial provider.
- Failed or rejected verification is clearly communicated.
- Only authorized users can access financial account information.
> **Note (ADR-004):** Live provider integration is P1; P0 uses manual attestation.

**US-026 — Fund payroll**
As a payroll administrator/admin, I want to verify that sufficient funds are available
before executing payroll so that payroll payments don't fail due to insufficient funds.
- System shows payroll required amount, available funds and funding status.
- If funds are insufficient, payroll must not proceed to payment execution.
- Administrator is clearly informed of the funding shortfall.
- Funding status is associated with the relevant payroll run.
> **Note (ADR-004):** P0 = manual attestation of fund availability, not a live balance check.

**US-027 — Execute payroll payments**
As an authorized payroll administrator/admin, I want to initiate employee salary payments
after payroll approval so that employees receive their salaries.
- Payroll must be approved before payment.
- Payment instructions are generated from approved payroll.
- Each payment has a unique reference.
- Payment status is tracked.
- Provider responses are recorded.
- Payment status can be updated from provider responses/webhooks.
- Duplicate payment execution is prevented.
- Failed payments can be identified and handled.
- Payment records remain associated with the relevant payroll run.
> **Note (ADR-004):** P0 = payment file export, not live provider API calls.

**US-028 — Reconcile Payroll Payments**
As a Finance Administrator/admin, I want to reconcile payroll payments against the approved
payroll run so that I know exactly which employee payments succeeded or failed.
- System shows total employees, total payroll, successful payments, failed payments and
  pending payments.
- Each payment has employee, amount, destination, status, provider reference, timestamp
  and failure reason where applicable.
> **Note (ADR-004):** P0 = manual outcome import.

## Epic 12 — Notifications

**US-029 — Receive business notifications**
As an Admin/Manager, I want to receive notifications about important organizational events,
so that I can act without constantly checking every module.
- Notifications may include payroll ready, payroll approved, payroll failed, incomplete
  onboarding, leave requests, expense requests, reimbursement status, salary advance
  requests, payment failure, compliance warnings and subscription events.
- Notifications direct the recipient to the relevant action where applicable.
> **Note (ADR-005):** P0 ships only the approval-decision email template.

## Epic 13 — Billing & Subscriptions

**US-030 — Manage subscription**
As an organization admin, I want to manage my StackHR subscription so that I can understand
my current plan and billing status.
- Admin can see current plan, trial status, subscription status, payment method, billing
  history and renewal date.
- Subscription status is kept current.
- Payment failures are communicated.
- Admin can understand whether the organization has active access.

## Epic 14 — Security & Access

**US-031 — Manage team access**
As an organization admin, I want to manage who has access to StackHR and what they can do,
so that sensitive employee and financial information is protected.
- Admin can invite team members.
- Admin can assign roles.
- Admin can manage permissions.
- Admin can remove access.
- Admin can review access status.
- Current roles include Admin, Manager and Employee.

## Epic 15 — Audit & Accountability

**US-032 — View organizational activity**
As an admin, I want to see important actions performed within my organization so that I can
investigate changes and maintain accountability.
- Track payroll created/modified/approved, employee added, salary changed, expense
  approved, bank information changed, payment initiated/failed/completed and role changed.
- Audit trail captures actor, action, resource, timestamp, organization and relevant
  metadata.

---

## Core Business Journey
Create organization → Add employees → Onboard employees → Configure compensation → Run
payroll → Review payroll → Approve payroll → Fund payroll → Pay employees → Generate
payslips → Reconcile payments
