# Employee Management P0 API

Status: proposed backend handoff. This document defines the APIs required to
complete the **Employee Management** P0 priority, including the employee
self-service portal. It supplements the screen-oriented People contract in
[people-backend-endpoints.md](./people-backend-endpoints.md); where the two
documents overlap, this document defines the required write workflows and
authorization rules for P0 completion.

The Settings → Team & Access backend contract is documented separately in
[team-access-backend-endpoints.md](./team-access-backend-endpoints.md).

Base URL:

```text
http://localhost:3001/v1/api
```

All JSON endpoints require the authenticated user from the `stackhr_session`
cookie or `Authorization: Bearer <token>`. The server derives both the active
organization and the current employee from that session. The client must never
be able to choose an organization or impersonate an employee by sending IDs in
the request body.

## P0 coverage

| P0 capability | Required API area | Completion condition |
| --- | --- | --- |
| Employee profiles, status, employment, department/role, salary, bank and emergency contacts | Employee records and departments | HR can create and update employee records, departments, department heads, and membership; sensitive fields are permission-scoped. |
| Document storage | Documents | Files are privately stored, listed, and retrievable by authorized users. |
| Onboarding/offboarding | Lifecycle | A new hire can be assigned and progressed through a checklist; an employee can be offboarded through an auditable state transition. |
| Leave management | Leave | Employees can submit/cancel requests; authorized reviewers can decide them; balances are updated atomically. |
| Employee self-service | `/me` | An employee can view their own live profile and update only permitted personal/payment details. |
| Directory, organizational chart, search/filter | Directory and organization | Authorized users can retrieve a scoped, paginated directory and reporting structure. |
| Records history | Audit history | Authorized users can retrieve immutable employee events without exposing sensitive values. |

## Shared rules

- Use stable opaque UUIDs or equivalent non-guessable IDs.
- Dates use `YYYY-MM-DD`; timestamps use ISO 8601 with an offset.
- Monetary values use integer minor units (`amountMinor`) plus ISO 4217
  `currency`. Do not use binary floating-point values for stored or API
  amounts.
- All successful writes create an audit event with organization, actor, target,
  action, timestamp, and a safe summary of changed fields. Never record bank
  account numbers, uploaded file bytes, passwords, or government identifiers
  in audit payloads.
- Standard errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "End date must be on or after the start date",
    "fields": { "endDate": "Invalid date range" }
  }
}
```

  Use `401` unauthenticated, `403` unauthorized, `404` missing or inaccessible,
  `409` invalid state transition/conflict, `413` oversized upload, `415`
  unsupported media type, and `422` semantic validation failure.
- All collection reads must enforce organization and permission scope on the
  server. Do not rely on hidden UI tabs or client-side filtering for security.

## 1. Employee records and directory

### Read APIs

| Method and path | Who can call it | Purpose |
| --- | --- | --- |
| `GET /people/employees?search=&employmentStatus=&departmentId=&managerId=&employmentType=&page=&pageSize=` | HR admins; managers receive only their authorized scope | Directory, status counts, employee search/filter, manager lookups and org chart input. |
| `GET /people/employees/{employeeId}` | HR admins; manager only when authorized | Complete HR profile, with restricted fields omitted unless authorized. |
| `GET /people/departments` | Authenticated organization members with directory access | Department labels and selectors. |
| `GET /people/teams` | Authenticated organization members with directory access | Team membership views. |
| `GET /people/organization-chart` | Authenticated organization members with directory access | A permission-scoped reporting forest; avoids reconstructing a large hierarchy from a paginated directory. |

Directory response:

```json
{
  "items": [
    {
      "id": "emp_123",
      "fullName": "Ada Okafor",
      "email": "ada@example.com",
      "avatarUrl": null,
      "jobTitle": "People Operations Manager",
      "departmentId": "dept_people",
      "managerId": "emp_100",
      "employmentType": "FULL_TIME",
      "employmentStatus": "ACTIVE",
      "startDate": "2024-04-15"
    }
  ],
  "page": 1,
  "pageSize": 25,
  "total": 83,
  "statusCounts": {
    "ACTIVE": 74,
    "PENDING_INVITATION": 2,
    "ONBOARDING": 5,
    "OFFBOARDING": 2
  }
}
```

### HR write APIs

| Method and path | Purpose |
| --- | --- |
| `POST /people/employees` | Create an employee record and, when requested, an invitation. |
| `PATCH /people/employees/{employeeId}` | Update employment, organization, compensation or HR-managed personal fields. |
| `POST /people/employees/{employeeId}/invitations` | Send or resend an invitation with server-side deduplication and rate limits. |

`POST /people/employees` body:

```json
{
  "personal": {
    "firstName": "Ada",
    "lastName": "Okafor",
    "workEmail": "ada@example.com",
    "phone": "+2348012345678"
  },
  "employment": {
    "jobTitle": "People Operations Manager",
    "departmentId": "dept_people",
    "managerId": "emp_100",
    "employmentType": "FULL_TIME",
    "startDate": "2026-10-01",
    "workLocation": "Lagos, Nigeria"
  },
  "compensation": {
    "annualSalaryMinor": 1200000000,
    "currency": "NGN",
    "payFrequency": "MONTHLY"
  },
  "sendInvitation": true
}
```

`PATCH /people/employees/{employeeId}` accepts only changed top-level sections
(`personal`, `employment`, `compensation`, `payment`). The server validates
department, manager, and organization membership; rejects reporting cycles and
self-management; and applies field-level permissions. Changing compensation
must create a compensation-history record with an effective date.

### Department administration

Departments are organization-managed entities. A department has one optional
head; department membership is derived from each employee's `departmentId` and
is never stored as a second, independent member list. The reporting chart is
still derived from `employee.managerId`: a department head is a leadership
designation, not automatically every member's direct manager.

| Method and path | Purpose |
| --- | --- |
| `POST /people/departments` | Create a department and optionally assign its initial members and head atomically. |
| `PATCH /people/departments/{departmentId}` | Rename a department and atomically replace its head and membership. |
| `DELETE /people/departments/{departmentId}` | Delete an empty department after server-side validation. |

Create/update body:

```json
{
  "name": "Customer Success",
  "headEmployeeId": "emp_123",
  "memberIds": ["emp_123", "emp_456", "emp_789"]
}
```

`name` must be unique within the organization after case/whitespace
normalization. `headEmployeeId` may be `null`, but when supplied it must appear
in `memberIds`, be an active employee, and belong to the organization. The
write moves every listed employee to the department and removes the department
assignment from former members omitted from `memberIds`; it must be one atomic
transaction. Reject cross-organization employee IDs and any assignment that
would make the existing reporting hierarchy invalid. The delete route returns
`409` while employees remain assigned; callers must first reassign or unassign
them through the patch route.

## 2. Employee self-service (`/me`)

These endpoints are the contract needed to replace hardcoded employee portal
content. They deliberately do **not** take `employeeId` path or body
parameters.

| Method and path | Purpose |
| --- | --- |
| `GET /me/profile` | The signed-in employee's permitted profile, employment summary, masked payment state, and profile-completion state. |
| `PATCH /me/profile` | Update self-service personal fields and emergency contact only. |
| `PUT /me/payment-details` | Create or replace the employee's own bank/payment details through a secure, audited flow. |
| `POST /me/avatar` | Upload or replace the employee's profile image. |
| `GET /me/compensation-history?page=&pageSize=` | Read the caller's salary/allowance history; never editable by the employee. |
| `GET /me/activity?page=&pageSize=` | Read the caller's own relevant activity feed. |

`GET /me/profile` response:

```json
{
  "employee": {
    "id": "emp_123",
    "fullName": "Ada Okafor",
    "avatarUrl": null,
    "workEmail": "ada@example.com",
    "personal": {
      "dateOfBirth": "1994-03-14",
      "gender": "PREFER_NOT_TO_SAY",
      "phone": "+2348012345678",
      "address": "12 Example Road, Lagos",
      "emergencyContact": {
        "name": "Chidi Okafor",
        "relationship": "SPOUSE",
        "phone": "+2348098765432"
      }
    },
    "employment": {
      "employeeNumber": "STK-00428",
      "jobTitle": "People Operations Manager",
      "department": { "id": "dept_people", "name": "People" },
      "manager": { "id": "emp_100", "fullName": "Maya Chen" },
      "employmentType": "FULL_TIME",
      "status": "ACTIVE",
      "startDate": "2024-04-15",
      "workLocation": "Lagos, Nigeria"
    },
    "compensation": {
      "annualSalaryMinor": 1200000000,
      "currency": "NGN",
      "payFrequency": "MONTHLY",
      "canView": true
    },
    "payment": {
      "bankName": "Access Bank",
      "accountLast4": "1234",
      "isComplete": true
    }
  }
}
```

`PATCH /me/profile` may change only `phone`, `address`, selected personal
demographics, and `emergencyContact`. It must reject work-email, manager,
department, job title, employment status, salary, and bank-account updates.

`PUT /me/payment-details` accepts a bank identifier, account number, and any
country-specific routing information. Encrypt account data at rest, return
only the bank name and last four digits, and require reauthentication or a
short-lived sensitive-action token before replacing existing details.

## 3. Documents

The following endpoints complete both HR document storage and employee access.

| Method and path | Who can call it | Purpose |
| --- | --- | --- |
| `GET /people/documents/company` | Authorized HR/directory users | Company document list. |
| `GET /people/documents/employees?employeeId=&query=&category=&page=` | Authorized HR users | Employee document list. |
| `POST /people/documents` | Authorized HR users | Upload a company or employee document. |
| `GET /people/documents/{documentId}/download` | Authorized reader | Return a short-lived signed download URL. |
| `GET /me/documents?category=&page=` | Current employee | List only documents explicitly shared with the caller. |
| `POST /me/documents` | Current employee | Upload an allowed personal document, such as identification or onboarding evidence. |

Uploads use `multipart/form-data`: `file`, `name`, `category`, and `scope` are
required; `employeeId` is required only for HR employee-scoped uploads. Limit
files to 10 MB and accept PDF, DOCX, JPG/JPEG, and PNG. Validate actual MIME
type and file content, store privately, virus-scan before availability, and do
not return public or permanent file URLs.

## 4. Onboarding and offboarding lifecycle

### Onboarding

| Method and path | Purpose |
| --- | --- |
| `GET /people/onboarding/templates` | HR template definitions and revisions. |
| `POST /people/onboarding/employees` | Assign a template revision to a new hire. |
| `GET /people/onboarding/employees` | HR progress list. |
| `PATCH /people/onboarding/employees/{employeeId}/checklist/{itemId}` | HR or delegated owner marks a checklist item complete/incomplete. |
| `GET /me/onboarding` | Current employee's assigned checklist and permitted actions. |
| `PATCH /me/onboarding/checklist/{itemId}` | Current employee completes only self-service checklist items. |

Each assignment must pin a template revision. Writes are idempotent and record
the completing actor/time. Do not automatically change employment status simply
because every checklist item is complete; an explicit HR transition is required.

### Offboarding

| Method and path | Purpose |
| --- | --- |
| `POST /people/employees/{employeeId}/offboarding` | Start offboarding and assign an offboarding checklist. |
| `GET /people/employees/{employeeId}/offboarding` | Read dates, checklist, ownership, and progress. |
| `PATCH /people/employees/{employeeId}/offboarding/checklist/{itemId}` | Update an authorized offboarding task. |
| `POST /people/employees/{employeeId}/offboarding/complete` | Complete offboarding after all mandatory tasks and validations pass. |

Start body:

```json
{
  "lastWorkingDay": "2026-11-30",
  "reason": "RESIGNATION",
  "notes": "Optional HR-only note",
  "templateId": "offboarding_default_v1"
}
```

Valid state flow is `ACTIVE → OFFBOARDING → TERMINATED`. Starting offboarding
must not immediately revoke essential access. Completion must enforce the last
working day, all required checklist tasks, payroll finalization requirements,
and access revocation. Cancellation is allowed only before completion and must
be audited.

## 5. Leave management

| Method and path | Who can call it | Purpose |
| --- | --- | --- |
| `GET /me/leave` | Current employee | Balances, own requests, leave types, policy summaries, and calendar-relevant requests. |
| `POST /me/leave/requests` | Current employee | Submit a leave request. |
| `POST /me/leave/requests/{requestId}/cancel` | Request owner | Cancel an eligible pending or approved request under policy rules. |
| `GET /people/leave/requests?...` | HR/admin/authorized manager | Team-wide request review. |
| `PATCH /people/leave/requests/{requestId}/decision` | Authorized reviewer | Approve or reject a pending request. |
| `GET /people/leave/balances?...` | HR/admin/authorized manager | Team leave balances. |

Create request body:

```json
{
  "leaveTypeId": "leave_annual",
  "startDate": "2026-10-12",
  "endDate": "2026-10-14",
  "reason": "Family event"
}
```

On approval, calculate chargeable days using the organization work schedule,
holidays, and policy—not browser calendar days. Update the request, balance
ledger, and audit event in one transaction. Disallow self-approval and only
permit `PENDING → APPROVED` or `PENDING → REJECTED` transitions. Cancellation
must reverse a charged balance atomically when policy allows it.

## 6. Employee record history

| Method and path | Who can call it | Purpose |
| --- | --- | --- |
| `GET /people/employees/{employeeId}/history?cursor=&limit=` | HR admins; restricted manager scope | Immutable employee record history. |
| `GET /me/history?cursor=&limit=` | Current employee | A safe, self-scoped subset of their history. |

Example history response:

```json
{
  "items": [
    {
      "id": "evt_456",
      "occurredAt": "2026-09-13T10:18:00.000Z",
      "action": "EMPLOYMENT_UPDATED",
      "actor": { "id": "usr_1", "name": "Maya Chen" },
      "summary": "Updated job title and manager",
      "changedFields": ["employment.jobTitle", "employment.managerId"]
    }
  ],
  "nextCursor": null
}
```

Do not expose old/new raw values for salary, bank details, address, date of
birth, government identifiers, or private HR notes. The self-service history
may omit events that would reveal confidential HR actions.

## Authorization matrix

| Action | Employee | Manager | HR admin / owner |
| --- | --- | --- | --- |
| View self profile, own documents, own leave and self history | Yes | Yes | Yes |
| Update own personal/emergency contact/payment details | Yes | Yes | Yes |
| View directory/org chart | Authorized fields only | Authorized fields only | Yes |
| View another employee's sensitive profile | No | Only direct/authorized reports; no compensation/bank by default | Yes, subject to permission |
| Create/edit employment, salary, department, manager, or status | No | No, unless explicitly delegated | Yes |
| Create/edit departments, assign department heads, or assign members | No | No, unless explicitly delegated | Yes |
| Upload HR employee documents | No | Delegated only | Yes |
| Decide leave | No | Direct/authorized reports only; never self | Yes |
| Start/complete offboarding | No | Delegated tasks only | Yes |

## Backend acceptance criteria

1. A signed-in employee can load `/me/profile`, change allowed personal and
   emergency-contact fields, update payment details through the sensitive
   action flow, and see the persisted result after reload.
2. Self-service requests cannot alter another employee, employment facts,
   compensation, or organization membership; all such attempts return `403`.
3. HR can create and update employees, including department, manager, salary,
   and bank metadata. Reporting cycles and cross-organization references fail
   validation.
4. HR can create departments, assign a head and members, and safely reassign
   members. Department membership and reporting lines remain separate, and a
   non-empty department cannot be deleted.
5. Documents are persisted privately, virus-scanned, scoped to an authorized
   audience, and downloaded only through short-lived authorized URLs.
6. Onboarding and offboarding survive reload, use version-pinned checklists,
   and record auditable lifecycle transitions.
7. Leave submission, approval/rejection, cancellation, balances, and history
   remain consistent under retries and concurrent actions.
8. Directory counts, search/filter totals, and the organization chart reflect
   the full authorized population, not just a page of results.
9. History is immutable and never leaks sensitive values to unauthorized users.

## Frontend integration notes

- Replace the hardcoded content in
  [MyProfilePage](../src/features/employee/pages/profile-page.tsx) with
  `GET /me/profile`, `PATCH /me/profile`, and the payment/history endpoints.
- Replace placeholder employee leave and documents pages with their `/me`
  counterparts.
- The existing People adapter already has reads plus client calls for leave
  decision, document upload, and onboarding checklist updates. Align their
  response fields with the contracts above before enabling the live service.
- The Organization → Departments screen now supports the create/update payload
  above. Its membership picker changes `employee.departmentId`; it does not
  change reporting lines (`employee.managerId`).
