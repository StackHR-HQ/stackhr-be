# People backend endpoint requirements

Status: proposed backend handoff, based on the frontend inspected on 2026-09-13. Backend availability has not been verified. Paths marked **Declared** already appear in the frontend API adapter; paths marked **Proposed** need new frontend integration as well as backend implementation.

The current People flow needs **13 read endpoints and 3 mutation endpoints** to load its screens and persist its existing interactions. Company setup adds one existing, separate endpoint. Additional employee and configuration management operations are listed at the end as future scope.

## Scope and source of truth

| Section      | Screens covered                                                                     |
| ------------ | ----------------------------------------------------------------------------------- |
| Employees    | Directory, status tabs, search, employee profile and its ten tabs                   |
| Leave        | Requests, calendar, types, policies, balances                                       |
| Documents    | Company documents, employee documents, templates, upload                            |
| Organization | Departments, teams, reporting structure, org chart                                  |
| Onboarding   | Company setup link and department defaults, employee progress, templates, checklist |

Implementation references:

- [API adapter](../src/features/people/api/people-api.ts), [service switch](../src/features/people/api/people-service.ts), and [response types](../src/features/people/types/people-types.ts).
- [People pages](../src/features/people/pages), [query hooks](../src/features/people/hooks), and [mock API](../src/features/people/api/people-mock-api.ts).
- [HTTP client](../src/lib/http.ts) and [environment configuration](../src/lib/env.ts).
- [Company setup API](../src/features/onboarding/api/onboarding-api.ts) and [setup payload types](../src/features/onboarding/types/onboarding-types.ts).

The mock API derives profile records and checklist progress from seed data. Production responses must use persisted records. A declared adapter method is not evidence of an implemented backend route.

## Shared contract

- Paths below are relative to `VITE_API_BASE_URL`, which defaults to `/api`. For example, `/people/employees` becomes `/api/people/employees` with the default configuration.
- The HTTP client sends credentials and an `Authorization: Bearer <token>` header when a token exists. Resolve the authenticated user and active organization server-side; validate organization membership for every referenced ID.
- Existing reads return a **bare JSON array or object**, not `{ data: ... }`. The adapter already unwraps Axios's response `data`. Return `[]` for empty collections and `404` for a missing employee.
- Use stable, opaque string IDs. Dates such as employment start and leave dates use `YYYY-MM-DD`; event timestamps use ISO 8601 with a timezone. The backend determines IDs, actors, timestamps and calculated totals.
- Proposed mutation responses use `200` for updates and `201` for document creation. Return the persisted representation, so the UI can refresh from authoritative state.
- Proposed errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "End date must follow start date", "fields": { "endDate": "Invalid date range" } } }`. `fields` is optional. Use `400` for malformed requests, `401` unauthenticated, `403` unauthorized, `404` absent or inaccessible resources, `409` state conflicts, `413` oversized uploads, `415` unsupported files, and `422` field/business validation failures. Frontend error handling must be added for mutations.
- Record an audit event for successful writes, including organization, actor, target, timestamp and relevant changes. Do not log file contents or sensitive personal/bank information.

### Access proposal

These permissions are requirements to confirm against the backend's role model, not behavior enforced by the current People components. Admins manage their organization; managers may view approved directory information and act on leave requests for their authorized reports; employees may access their own records and explicitly shared company documents. Deny self-approval. Restrict personal information, compensation, payroll and private files separately from the directory.

`EmployeeDetail` currently requires all profile sections. Initially restrict that aggregate endpoint to roles authorized for the complete payload. Supporting partially authorized profiles requires nullable/omitted sections or separate section reads, updated frontend types, and permission-aware tabs; do not send restricted fields merely because a tab is hidden.

### Filtering and pagination

The current adapter sends no query parameters and expects complete collections. Employee search, status counts, document search, calendar filtering and organization trees are calculated in the browser. Do not silently paginate these responses: that would produce incomplete counts, missing reports and partial calendars.

`GET /people/employees` supports opt-in offset pagination and filtering. Supplying any of `page`, `pageSize`, `search`, or `employmentStatus` returns `{ items, page, pageSize, total }`; the defaults are `page=1` and `pageSize=25`, with a maximum page size of 100. Search is case-insensitive across full name, email, and job title. `employmentStatus` accepts `active`, `pending_invitation`, `onboarding`, or `offboarding`. Results are stably ordered by full name then ID.

Calls without these parameters retain the current bare-array response for the existing frontend. The frontend must migrate its adapter before it sends query parameters, and it must obtain organization-wide status counts separately if it needs counts unaffected by pagination. Org charts and selectors continue to require a complete authorized collection or dedicated lookup endpoints.

## 1. Employees

| Status   | Method and path                      | Purpose / response                                                                                                              |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Declared | `GET /people/employees`              | Directory, status counts, manager/direct-report lookup, employee selectors and organization views. Returns `EmployeeSummary[]`. |
| Declared | `GET /people/employees/{employeeId}` | All employee profile tabs. Returns `EmployeeDetail`; `404` when unavailable.                                                    |

`EmployeeSummary` fields:

| Field                                                                   | Type / meaning                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `id`, `fullName`, `email`, `avatarInitials`, `jobTitle`, `departmentId` | Strings; `departmentId` references a department in this organization |
| `managerId`                                                             | Employee ID or `null` for a root employee                            |
| `employmentType`                                                        | `Full-time`, `Part-time`, `Contract`, `Intern`                       |
| `employmentStatus`                                                      | `active`, `pending_invitation`, `onboarding`, `offboarding`          |
| `startDate`                                                             | Date-only string                                                     |

`EmployeeDetail` includes every summary field plus:

| Field            | Required shape / consuming tabs                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workLocation`   | String; overview and employment                                                                                                                                       |
| `personalInfo`   | Strings: `dateOfBirth`, `gender`, `maritalStatus`, `nationality`, `phone`, `address`, `emergencyContactName`, `emergencyContactPhone`, `emergencyContactRelationship` |
| `compensation`   | `salary: number`, `currency: string`, `payFrequency: string`, `bankName: string`, `bankAccountLast4: string`                                                          |
| `leaveBalance`   | `{ type, totalDays, usedDays }[]`; day counts are numbers                                                                                                             |
| `leaveRequests`  | `{ id, type, startDate, endDate, days, status }[]`; status is `pending`, `approved` or `rejected`                                                                     |
| `documents`      | `{ id, name, category, uploadedAt, fileSize }[]`; all strings, including formatted `fileSize`                                                                         |
| `payslips`       | `{ id, periodLabel, payDate, netPay, currency, status }[]`; numeric `netPay`, status `paid` or `processing`                                                           |
| `expenses`       | `{ id, date, category, description, amount, currency, status }[]`; numeric `amount`, status `pending`, `approved` or `rejected`                                       |
| `salaryAdvances` | `{ id, requestedAt, amount, currency, repaymentMonths, status }[]`; numeric amount/months; status `pending`, `approved`, `rejected`, `disbursed` or `repaid`          |
| `activity`       | `{ id, description, timestamp }[]`                                                                                                                                    |

Return empty arrays for sections with no records. Current monetary fields are displayed directly as currency amounts; the proposed compatibility contract uses major currency units, with exact decimal/minor-unit storage internally. Do not expose full bank account details through `bankAccountLast4`.

Payroll and Spend own payslips, expenses and salary advances. The profile can aggregate authorized read models from those domains; it does not require duplicate People write endpoints. Activity must reflect actual events. Current profile tabs and directory do not offer employee create/edit/delete controls.

Future server filters: `search` over name/email/job title, `employmentStatus`, `departmentId`, `managerId`, `employmentType`.

## 2. Leave

| Status   | Method and path                                     | Purpose / response                                                                                                                         |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Declared | `GET /people/leave/requests`                        | Requests table and calendar. Returns `LeaveRequestWithEmployee[]`.                                                                         |
| Declared | `GET /people/leave/types`                           | Leave type catalog. Returns `LeaveType[]`.                                                                                                 |
| Declared | `GET /people/leave/policies`                        | Policy cards. Returns `LeavePolicy[]`.                                                                                                     |
| Declared | `GET /people/leave/balances`                        | Employee balances table. Returns `EmployeeLeaveBalanceRow[]`.                                                                              |
| Proposed | `PATCH /people/leave/requests/{requestId}/decision` | Persist Approve/Reject buttons. Body `{ "status": "approved" }` or `{ "status": "rejected" }`; returns updated `LeaveRequestWithEmployee`. |

Response models:

- `LeaveRequestWithEmployee`: profile leave-request fields plus `employeeId`, `employeeName`, `avatarInitials`.
- `LeaveType`: `{ id, name, defaultDays, paid, tone, description }`; `defaultDays` is numeric, `paid` boolean, and `tone` is `accent`, `positive`, `warning`, `critical` or `neutral`.
- `LeavePolicy`: `{ id, title, description }`. These display fields are insufficient to encode accrual, carryover or approval rules; store enforceable policy configuration separately.
- `EmployeeLeaveBalanceRow`: `{ employeeId, employeeName, avatarInitials, balances: [{ type, totalDays, usedDays }] }`.

Example decision response:

```json
{
  "id": "leave_123",
  "employeeId": "emp_123",
  "employeeName": "Ada Okafor",
  "avatarInitials": "AO",
  "type": "Annual Leave",
  "startDate": "2026-09-21",
  "endDate": "2026-09-23",
  "days": 3,
  "status": "approved"
}
```

Decision requirements:

- Authorize the reviewer, disallow self-approval, and allow only `pending → approved` or `pending → rejected`. An identical retry returns the existing result without double accounting; an opposite decision after resolution returns `409`.
- Update request, balance ledger and audit event atomically. Revalidate eligibility and available balance when approving. Calculate chargeable days from the organization's work schedule, holidays and policy, not the browser's calendar-day count.
- Proposed initial balance semantics: `usedDays` includes approved charged days; pending requests do not deduct days. Confirm this against the intended leave policy. Return balance types in a consistent order across rows because the current table derives columns from its first row.
- The calendar currently shows **pending and approved** requests, excluding rejected ones. Reuse the requests endpoint; no calendar endpoint is needed. Future `from`/`to` filters must use overlap (`startDate <= to && endDate >= from`), including the visible grid's adjacent-month days.
- Future request filters: `employeeId`, `departmentId`, `status`, `leaveTypeId`, `from`, `to`; balances may add `employeeId` and leave year. Existing request/balance types use display names; add stable `leaveTypeId` before introducing leave creation or type renaming.

## 3. Documents

| Status   | Method and path                   | Purpose / response                                                                    |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| Declared | `GET /people/documents/company`   | Company documents table. Returns `CompanyDocument[]`.                                 |
| Declared | `GET /people/documents/employees` | Employee documents table/search. Returns `EmployeeDocumentRow[]`.                     |
| Declared | `GET /people/documents/templates` | Template catalog. Returns `DocumentTemplate[]`.                                       |
| Proposed | `POST /people/documents`          | Persist Upload Document. Multipart body below; returns `201` with the saved document. |

Response models:

- `CompanyDocument`: `{ id, name, category, uploadedAt, fileSize, visibility }`, all strings.
- `EmployeeDocumentRow`: `{ id, name, category, uploadedAt, fileSize, employeeId, employeeName, avatarInitials }`, all strings.
- `DocumentTemplate`: `{ id, name, category, description }`, all strings.

Upload request uses `multipart/form-data`:

| Field        | Required           | Validation                                                                                                                                      |
| ------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `file`       | Yes                | PDF, DOCX, JPG/JPEG or PNG; UI promises up to 10 MB. Proposed exact limit: 10,000,000 bytes; validate actual content and MIME type server-side. |
| `name`       | Yes                | Nonempty trimmed document name                                                                                                                  |
| `category`   | Yes                | `Policy`, `Contract`, `Identification`, `Compliance`, `Compensation`, `Other`                                                                   |
| `scope`      | Yes                | `company` or `employee`                                                                                                                         |
| `employeeId` | For employee scope | Required for `employee`; omitted for `company`; validate same-organization employee and uploader access                                         |

The frontend maps its `assignTo = company` selector value to company scope; other selections map to employee scope plus `employeeId`. Proposed response is `{ scope: "company", document: CompanyDocument }` or `{ scope: "employee", document: EmployeeDocumentRow }`.

Store the file privately and persist metadata only after durable upload succeeds. Store raw byte size internally and return the formatted `fileSize` expected today. Company scope grants the organization's configured company-document audience; employee scope defaults to the employee and authorized HR users. `visibility` is a display label, not an authorization rule. Do not expose permanent public storage URLs.

After success, the file must appear in the appropriate document list and, for an employee upload, that employee's profile. The current UI only adds a local “Added this session” row and does not upload bytes.

Future filters: `search`, `category`, `employeeId`. Current lists and template cards have no open/download controls. When file retrieval is added, propose `GET /people/documents/{documentId}/download` returning `{ url, expiresAt }` after authorization, with a short-lived signed URL. Template generation, signing, version history and deletion are separate future workflows.

## 4. Organization

| Status   | Method and path           | Purpose / response                                                                   |
| -------- | ------------------------- | ------------------------------------------------------------------------------------ |
| Declared | `GET /people/departments` | Department cards, profile labels and onboarding defaults. Returns `Department[]`.    |
| Declared | `GET /people/teams`       | Team cards and membership. Returns `Team[]`.                                         |
| Reused   | `GET /people/employees`   | Headcount, department members, team lead/member names, reporting tree and org chart. |

- `Department`: `{ id: string, name: string, headEmployeeId: string }`.
- `Team`: `{ id: string, name: string, description: string, leadEmployeeId: string, memberIds: string[] }`.
- Every employee, manager, head, lead and member reference must belong to the same organization. Reject reporting cycles and self-management on writes. Multiple roots with `managerId: null` are valid.
- Current types require department heads and team leads. If vacant positions are needed, explicitly introduce nullable fields and update consumers.
- Reporting structure and org chart are two views of `EmployeeSummary.managerId`; neither needs its own endpoint for the current complete-collection contract.
- These screens are read-only today. Department/team administration and reporting-line edits are future writes, listed below.

## 5. Onboarding

| Status   | Method and path                                                      | Purpose / response                                                                                                           |
| -------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Declared | `GET /people/onboarding/templates`                                   | Template cards, department defaults and checklist definitions. Returns `OnboardingTemplate[]`.                               |
| Declared | `GET /people/onboarding/employees`                                   | Employee onboarding progress and selected checklist. Returns `EmployeeOnboardingRow[]`.                                      |
| Proposed | `PATCH /people/onboarding/employees/{employeeId}/checklist/{itemId}` | Persist checkbox changes. Body `{ "completed": true }` or `{ "completed": false }`; returns updated `EmployeeOnboardingRow`. |
| Reused   | `GET /people/departments`                                            | Names for template assignments and department defaults.                                                                      |

- `OnboardingTemplate`: `{ id, name, departmentIds: string[], checklist: [{ id, label, stage }] }`.
- `EmployeeOnboardingRow`: `{ employeeId, employeeName, avatarInitials, jobTitle, startDate, templateId, completedItemIds: string[] }`.
- Match current mock selection: list employees with status `onboarding` or `pending_invitation`. Progress is derived from completed checklist IDs and the assigned template; stages and item order come from the template.
- Persist assignment and item completion; do not recompute them from department or seeded hashes on every read. Validate that an item belongs to that employee's assigned checklist and authorize the actor.
- Make item writes idempotent, recording completion actor/time. Updating one item must not overwrite another item's concurrent update. Unchecking clears its current completion state while retaining audit history.
- Serve the template revision assigned to the employee, with immutable IDs for changed revisions, so template edits cannot silently change an existing checklist. `templateId` must resolve in the returned templates collection.
- Department defaults must be unambiguous: the current UI takes the first matching `departmentIds` entry. Return at most one applicable default per department until an explicit defaults model is introduced.
- Templates must have at least one item for the current percentage calculation. Do not automatically activate employment status when the last item is checked: the UI has no completion transition, and doing so would remove the employee from the tracking list.

### Company setup dependency

People → Onboarding → Company Onboarding links to `/onboarding`. It does not load company setup state itself. The separate wizard declares:

`POST /onboarding/complete`

```ts
{
  companyInfo: {
    name: string
    logoDataUrl?: string
    industry: string
    companySize: string
    taxId?: string
    currency: string
    payrollFrequency: string
  }
  employees: Array<{
    id: string
    fullName: string
    email: string
    department: string
    jobTitle: string
    employmentType: string
    salary: number
    startDate: string
    managerId?: string
    managerName?: string
    source: 'manual' | 'csv'
  }>
}
```

The adapter ignores the response body; proposed success is `204`. Normalize department names, validate the entire roster, map draft employee/manager IDs to persisted IDs, and make retries safe against duplicate employees. Resolve manager names only when unambiguous. The resulting roster must be visible through People reads. This is company/account setup, distinct from new-hire checklist tracking; do not duplicate it under `/people/onboarding/complete`.

## Frontend integration and acceptance

The read service currently switches between mocks and the real adapter using `VITE_USE_MOCK_AUTH`; that flag also affects other features. Coordinate backend readiness before disabling it, or introduce a dedicated People switch.

Add mutation methods and query hooks for the three proposed writes. Replace the local `resolvedIds` in Leave, the simulated document upload, and checklist `useState` persistence with these calls. Disable pending actions, display API errors, and roll back optimistic changes on failure.

| Successful action | Query keys to invalidate/refetch                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Leave decision    | `['people', 'leave', 'requests']`, `['people', 'leave', 'balances']`, `['people', 'employees', employeeId]`   |
| Document upload   | `['people', 'documents', 'company']` or `['people', 'documents', 'employees']`; employee detail when assigned |
| Checklist update  | `['people', 'onboarding', 'employees']` and employee detail for activity                                      |
| Company setup     | People employee/department/team and onboarding collections; authenticated organization/setup state            |

Backend/frontend acceptance checks:

1. All 13 declared reads deserialize into the linked types; empty collections and missing employees behave correctly.
2. Every listed screen and profile tab uses persisted data. Search, status counts, reporting trees and calendars remain complete.
3. Approving/rejecting leave survives reload and updates both calendar and balances. Repeated and competing decisions cannot double-charge leave.
4. Company and employee uploads persist real bytes and metadata, appear in the right lists/profile, and reject invalid files and unauthorized assignments.
5. Checklist completion/uncompletion survives reload and employee switching, updates the progress list, and preserves concurrent changes to different items.
6. Cross-organization access, unauthorized sensitive-field reads and self-approval are rejected server-side.
7. Existing screens render loading, empty and failure states; writes never show success before the backend confirms persistence.

## Future management scope — not required by current People controls

These proposed routes are planning candidates, not approved contracts or prerequisites for the current screens. Define payloads and transitions when those interfaces are designed.

| Capability                    | Candidate endpoints                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Create/update employees       | `POST /people/employees`, `PATCH /people/employees/{employeeId}`                                                                                |
| Invite/resend invite          | `POST /people/employees/{employeeId}/invitations`; apply deduplication and resend limits                                                        |
| Submit/cancel leave           | `POST /people/leave/requests`, `POST /people/leave/requests/{requestId}/cancel`; cancellation needs a new status and balance reversal rules     |
| Manage leave configuration    | `POST/PATCH /people/leave/types[/{typeId}]`, `POST/PATCH /people/leave/policies[/{policyId}]`; create uses collection path, update uses ID path |
| Audited balance adjustments   | `POST /people/leave/balances/adjustments`                                                                                                       |
| Document retrieval/management | `GET /people/documents/{documentId}/download`, `PATCH/DELETE /people/documents/{documentId}`                                                    |
| Manage document templates     | `POST /people/documents/templates`, `PATCH /people/documents/templates/{templateId}`                                                            |
| Manage departments/teams      | `POST /people/departments`, `PATCH /people/departments/{departmentId}`, `POST /people/teams`, `PATCH /people/teams/{teamId}`                    |
| Reporting-line changes        | Reuse employee update with `managerId`; enforce cycle detection                                                                                 |
| Assign onboarding template    | `POST /people/onboarding/employees` with employee and template assignment                                                                       |
| Manage onboarding templates   | `POST /people/onboarding/templates`, `PATCH /people/onboarding/templates/{templateId}` with revision handling                                   |

Offboarding execution, employee deletion, invitation acceptance, leave accrual/carryover rules, partial-day leave and signature workflows need their own product contracts. The presence of a status label or display card does not establish those workflows.
