# Business Signup API

Base URL:

```text
http://localhost:3001/v1/api
```

The flow represented by the current business UI is:

```text
Create workspace → Verify email → Company info → Add first employee → Dashboard
```

All request and response bodies below use JSON unless stated otherwise. The
backend sets an HTTP-only `stackhr_session` cookie after successful email
verification. The frontend must send cookies on cross-origin requests with
`credentials: 'include'`.

## 1. Create workspace

Creates the business owner account and an initial organization. It does not
create an authenticated session yet. The user must verify the email first.

```http
POST /v1/api/auth/business/signup
Content-Type: application/json
```

### Request body

```json
{
  "companyName": "Acme Inc.",
  "email": "testing@gmail.com",
  "password": "correct horse battery staple",
  "confirmPassword": "correct horse battery staple"
}
```

Optional field:

```json
{
  "organizationSlug": "acme-inc"
}
```

If `organizationSlug` is omitted, it is generated from `companyName`.
Passwords must be between 12 and 128 characters.

### Response `201 Created`

When email delivery is configured:

```json
{
  "email": "testing@gmail.com",
  "expiresAt": "2026-08-22T12:10:00.000Z"
}
```

When running locally without `SENDBYTE_API_KEY` or `SENDBYTE_KEY`, the
response also includes `devCode` so the flow can be tested without email:

```json
{
  "email": "testing@gmail.com",
  "expiresAt": "2026-08-22T12:10:00.000Z",
  "devCode": "123456"
}
```

## 2. Verify email

Verifies the six-digit code and creates the authenticated business session.
The response sets the `stackhr_session` HTTP-only cookie.

```http
POST /v1/api/auth/business/verify-email
Content-Type: application/json
```

### Request body

```json
{
  "email": "testing@gmail.com",
  "code": "123456"
}
```

### Response `201 Created`

```json
{
  "user": {
    "id": "user-uuid",
    "name": "Acme Inc.",
    "email": "testing@gmail.com",
    "userType": "BUSINESS",
    "role": "BUSINESS_OWNER",
    "organizationId": "organization-uuid"
  },
  "onboarding": {
    "organizationId": "organization-uuid",
    "nextStep": "COMPANY_INFO"
  }
}
```

Verification codes expire after 10 minutes and can only be used once.

## 3. Resend verification code

Requests a new verification code. For privacy, an unknown, already verified,
or non-business email returns the same accepted response shape.

```http
POST /v1/api/auth/business/resend-verification
Content-Type: application/json
```

### Request body

```json
{
  "email": "testing@gmail.com"
}
```

### Response `201 Created`

```json
{
  "accepted": true,
  "email": "testing@gmail.com",
  "expiresAt": "2026-08-22T12:10:00.000Z"
}
```

In local development without email configuration, `devCode` is also returned.

## 4. Business login

Signs in a verified business user and sets the `stackhr_session` HTTP-only
cookie. The same session can also be supplied as an `Authorization: Bearer`
token.

```http
POST /v1/api/auth/business/login
Content-Type: application/json
```

### Request body

```json
{
  "email": "testing@gmail.com",
  "password": "correct horse battery staple"
}
```

### Response `201 Created`

```json
{
  "user": {
    "id": "user-uuid",
    "name": "Acme Inc.",
    "email": "testing@gmail.com",
    "userType": "BUSINESS",
    "role": "BUSINESS_OWNER",
    "organizationId": "organization-uuid"
  }
}
```

Unverified business accounts receive `401 Unauthorized` until email
verification is completed.

## 5. StackHR admin login

Signs in a configured StackHR platform administrator. Admin accounts are
bootstrapped from `STACKHR_ADMIN_EMAIL`, `STACKHR_ADMIN_PASSWORD`, and
`STACKHR_ADMIN_NAME`; there is no public admin signup endpoint.

```http
POST /v1/api/auth/admin/login
Content-Type: application/json
```

### Request body

```json
{
  "email": "admin@stackhr.app",
  "password": "correct horse battery staple"
}
```

### Response `201 Created`

```json
{
  "user": {
    "id": "admin-uuid",
    "name": "StackHR Admin",
    "email": "admin@stackhr.app",
    "userType": "STACKHR_ADMIN",
    "role": "STACKHR_ADMIN",
    "organizationId": null
  }
}
```

## 6. Current authenticated user

Returns the user represented by the session cookie or bearer token.

```http
GET /v1/api/auth/me
Cookie: stackhr_session=<session-token>
```

### Response `200 OK`

```json
{
  "user": {
    "id": "user-uuid",
    "name": "Acme Inc.",
    "email": "testing@gmail.com",
    "userType": "BUSINESS",
    "role": "BUSINESS_OWNER",
    "organizationId": "organization-uuid"
  }
}
```

## 7. Logout

Revokes the current session and clears the session cookie.

```http
POST /v1/api/auth/logout
Cookie: stackhr_session=<session-token>
```

### Response `201 Created`

```json
{
  "success": true
}
```

## 8. Compatibility registration route

`/auth/business/register` remains an alias for the signup endpoint. New
clients should use `/auth/business/signup`.

## 9. Save company information

Saves the company information shown in the **Company info** screen. Requires
an authenticated business owner, business admin, or HR admin session.

```http
PATCH /v1/api/onboarding/company
Content-Type: application/json
Cookie: stackhr_session=<session-token>
```

### Request body

```json
{
  "companyName": "New Test Inc",
  "industry": "Technology",
  "companySize": "11-50",
  "currency": "NGN",
  "payrollFrequency": "MONTHLY",
  "taxId": "TIN 12345678-0001",
  "logo": "https://storage.example.com/logos/acme.png"
}
```

`taxId` and `logo` are optional. Supported currencies are `NGN`, `USD`, `GBP`,
and `EUR`. Supported payroll frequencies are `MONTHLY`, `BIWEEKLY`, and
`WEEKLY`.

### Response `200 OK`

```json
{
  "organization": {
    "id": "organization-uuid",
    "name": "New Test Inc",
    "slug": "acme-inc",
    "logo": "https://storage.example.com/logos/acme.png",
    "industry": "Technology",
    "companySize": "11-50",
    "currency": "NGN",
    "payrollFrequency": "MONTHLY",
    "taxId": "TIN 12345678-0001"
  },
  "onboarding": {
    "organizationId": "organization-uuid",
    "companyInfoComplete": true,
    "employeeCount": 0,
    "employeesComplete": false,
    "complete": false,
    "nextStep": "FIRST_EMPLOYEE"
  }
}
```

## 10. Add an employee manually

Creates an employee record for the current organization. This is the **Add
manually** tab in the UI. Employees are created with `PENDING_INVITATION`
status until the employee account invitation flow is implemented.

```http
POST /v1/api/onboarding/employees
Content-Type: application/json
Cookie: stackhr_session=<session-token>
```

### Request body

```json
{
  "fullName": "Ada Obi",
  "email": "ada@company.com",
  "department": "Engineering",
  "jobTitle": "Software Engineer",
  "employmentType": "FULL_TIME",
  "salary": 450000,
  "startDate": "2026-08-22",
  "managerId": null
}
```

`managerId` is optional and must refer to an employee in the same
organization. `salary` is stored as a whole-number amount in the
organization's configured currency.

### Response `201 Created`

```json
{
  "employee": {
    "id": "employee-uuid",
    "organizationId": "organization-uuid",
    "fullName": "Ada Obi",
    "email": "ada@company.com",
    "department": "Engineering",
    "jobTitle": "Software Engineer",
    "employmentType": "FULL_TIME",
    "salaryAmount": 450000,
    "startDate": "2026-08-22T00:00:00.000Z",
    "managerId": null,
    "status": "PENDING_INVITATION"
  },
  "onboarding": {
    "organizationId": "organization-uuid",
    "companyInfoComplete": true,
    "employeeCount": 1,
    "employeesComplete": true,
    "complete": true,
    "nextStep": "DASHBOARD"
  }
}
```

## 11. Import employees from CSV

Creates multiple employee records from the **Upload CSV** tab. The current
API accepts the CSV contents in a JSON body. File-upload storage can be added
later without changing the employee row format.

```http
POST /v1/api/onboarding/employees/import
Content-Type: application/json
Cookie: stackhr_session=<session-token>
```

### Request body

```json
{
  "csv": "fullName,email,department,jobTitle,employmentType,salary,startDate,managerEmail\nAda Obi,ada@company.com,Engineering,Software Engineer,FULL_TIME,450000,2026-08-22,"
}
```

Required columns:

```text
fullName,email,department,jobTitle,employmentType,salary,startDate
```

Optional column:

```text
managerEmail
```

### Response `201 Created`

```json
{
  "employees": [
    {
      "id": "employee-uuid",
      "organizationId": "organization-uuid",
      "fullName": "Ada Obi",
      "email": "ada@company.com",
      "department": "Engineering",
      "jobTitle": "Software Engineer",
      "employmentType": "FULL_TIME",
      "salaryAmount": 450000,
      "startDate": "2026-08-22T00:00:00.000Z",
      "managerId": null,
      "status": "PENDING_INVITATION"
    }
  ],
  "onboarding": {
    "organizationId": "organization-uuid",
    "companyInfoComplete": true,
    "employeeCount": 1,
    "employeesComplete": true,
    "complete": true,
    "nextStep": "DASHBOARD"
  }
}
```

## 12. Resume onboarding

Returns the current onboarding state after page refresh or sign-in.

```http
GET /v1/api/onboarding/status
Cookie: stackhr_session=<session-token>
```

### Response `200 OK`

```json
{
  "organizationId": "organization-uuid",
  "companyInfoComplete": true,
  "employeeCount": 1,
  "employeesComplete": true,
  "complete": true,
  "nextStep": "DASHBOARD"
}
```

## Error responses

Validation and authorization errors use Nest's standard format:

```json
{
  "statusCode": 400,
  "message": "Passwords do not match",
  "error": "Bad Request"
}
```

Common statuses:

- `400` invalid or incomplete request body
- `401` missing, invalid, or unverified session
- `403` authenticated user lacks business-admin permissions
- `409` duplicate email, organization slug, or employee
- `503` configured email provider unavailable
