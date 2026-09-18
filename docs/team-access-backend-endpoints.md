# Team & Access API

Status: frontend backend handoff for **Settings → Team & Access**. This covers application sign-in access, roles, and invitations; it is separate from People employee records and organizational teams.

Base URL: `http://localhost:3001/v1/api`

Every endpoint derives the active organization and acting user from the authenticated session. The client must not supply an organization ID or acting user ID. All collection results are organization-scoped.

## Screen coverage

| Team & Access tab | Required endpoint(s) | UI behavior |
| --- | --- | --- |
| Team Members | `GET /settings/team-members`, `PATCH /settings/team-members/{memberId}` | Lists application users; changes role or suspends/restores access. |
| Roles | `GET /settings/roles` | Displays the fixed roles and their summaries. |
| Permissions | `GET /settings/permissions` | Displays the fixed permission matrix. This UI does not edit permissions. |
| Invitations | `GET/POST /settings/invitations`, `POST /settings/invitations/{invitationId}/resend`, `DELETE /settings/invitations/{invitationId}` | Creates, resends, and revokes access invitations. |
| Managers | `GET /settings/managers` | Shows direct-report count and whether each manager has StackHR access. |

## Authorization and audit rules

- Only a business owner, business admin, or HR admin may read or manage Team & Access. Managers and employees must not infer another user’s access status, invitation state, or role from these endpoints.
- Prevent an organization from removing or suspending its last active business owner/admin. If the product distinguishes owner from admin, expose that role in the response before enabling it in this UI.
- Validate all references against the authenticated organization. An employee reference may be absent for an invite-only account, but it must be organization-scoped when present.
- Create an audit record for every role, access-status, and invitation write: organization, actor, target, action, timestamp, prior/new role or status, and invitation lifecycle change. Do not store invitation tokens in audit data.
- Return `401` when unauthenticated, `403` when unauthorized, `404` for a missing or inaccessible ID, `409` for protected/invalid access transitions, and `422` for validation errors.

## 1. Team Members

### `GET /settings/team-members`

Returns every application user in the active organization, including suspended users. The response drives the Team Members table and Role summary counts.

```json
[
  {
    "id": "access-user-uuid",
    "employeeId": "employee-uuid",
    "fullName": "Ada Okafor",
    "avatarInitials": "AO",
    "email": "ada@example.com",
    "jobTitle": "People Operations Manager",
    "role": "admin",
    "status": "active",
    "invitedAt": "2026-09-01T09:30:00Z",
    "lastActiveAt": "2026-09-14T11:10:00Z"
  }
]
```

`employeeId` is the People-profile ID used by the profile link. If an account has no employee record, make it nullable and update the frontend before using that response shape. `lastActiveAt` may be `null`.

### `PATCH /settings/team-members/{memberId}`

Updates one or both editable access fields atomically.

```json
{
  "role": "manager",
  "status": "suspended"
}
```

Both fields are optional; accepted roles are currently `admin`, `manager`, and `employee`, and accepted statuses are `active` and `suspended`. Return the complete updated `TeamMember` object. Reject attempts to change a protected owner/admin, self-revoke access, or leave the organization without an active privileged administrator.

The frontend should invalidate `['settings', 'team-members']` after success.

## 2. Roles and permissions

### `GET /settings/roles`

Returns the role cards displayed in Settings. Roles are informational in the current UI and are not customisable.

```json
[
  {
    "role": "admin",
    "label": "Admin",
    "description": "Manages organization settings and access.",
    "summary": ["Manage organization settings", "Invite team members and change roles"]
  }
]
```

### `GET /settings/permissions`

Returns the read-only matrix used by the Permissions tab.

```json
[
  {
    "module": "people",
    "label": "People",
    "description": "Employee directory and profiles",
    "admin": "full",
    "manager": "team",
    "employee": "own"
  }
]
```

Accepted permission levels are `full`, `team`, `own`, and `none`. Permission checks must be enforced by each protected backend resource; this endpoint is descriptive and is not an authorization mechanism.

## 3. Invitations

### `GET /settings/invitations`

Returns pending and expired invitations in the active organization.

```json
[
  {
    "id": "invitation-uuid",
    "email": "new.hire@example.com",
    "fullName": "New Hire",
    "role": "employee",
    "invitedBy": "Ada Okafor",
    "invitedAt": "2026-09-14T10:00:00Z",
    "status": "pending"
  }
]
```

### `POST /settings/invitations`

Creates and sends an access invitation.

```json
{
  "fullName": "New Hire",
  "email": "new.hire@example.com",
  "role": "employee"
}
```

Return `201 Created` with the `Invitation` response object. Normalize email addresses and reject an email that already has active organization access. For an existing pending invitation, return `409` or make the request an idempotent resend; choose one behavior and document it consistently. Send an opaque, single-use, expiring invitation token only by email—never in JSON.

### `POST /settings/invitations/{invitationId}/resend`

Resends an expired or pending invitation, rotates its token, and returns the updated `Invitation`. Apply server-side resend throttling.

### `DELETE /settings/invitations/{invitationId}`

Revokes an unused invitation and returns `204 No Content`. It must invalidate the token so it cannot later create an account.

After each successful invitation write, invalidate `['settings', 'invitations']`. When invitation acceptance creates an access user, also invalidate `['settings', 'team-members']`.

## 4. Managers

### `GET /settings/managers`

Returns a derived view of active employees who have direct reports. The service must calculate `directReportCount` from the reporting relationship, not accept it from the client, and join access role/status server-side.

```json
[
  {
    "employeeId": "employee-uuid",
    "fullName": "Chidi Eze",
    "avatarInitials": "CE",
    "jobTitle": "Engineering Manager",
    "directReportCount": 6,
    "hasAccess": true,
    "role": "manager"
  }
]
```

When `hasAccess` is `false`, return `role: null`. The frontend should invalidate `['settings', 'managers']` after a Team Member role or status update and after invitation acceptance.

## Frontend migration note

The current Team Members and Invitations components make local-only state changes. Once these writes are available, replace those local mutations with React Query mutations, surface backend validation errors, and invalidate the query keys listed above. Read endpoints already have matching adapters in `src/features/settings/api/team-access-api.ts`.
