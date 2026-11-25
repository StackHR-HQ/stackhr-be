export const SESSION_COOKIE_NAME = 'stackhr_session';
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const SHORT_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

export const USER_TYPES = {
  BUSINESS: 'BUSINESS',
  STACKHR_ADMIN: 'STACKHR_ADMIN',
} as const;

export const USER_ROLES = {
  BUSINESS_OWNER: 'BUSINESS_OWNER',
  BUSINESS_ADMIN: 'BUSINESS_ADMIN',
  HR_ADMIN: 'HR_ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  STACKHR_ADMIN: 'STACKHR_ADMIN',
  STACKHR_SUPPORT: 'STACKHR_SUPPORT',
} as const;

export type UserType = (typeof USER_TYPES)[keyof typeof USER_TYPES];
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ASSIGNABLE_ORG_ROLES = [
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
  USER_ROLES.MANAGER,
  USER_ROLES.EMPLOYEE,
] as const;

export interface RoleDefinition {
  role: UserRole;
  label: string;
  description: string;
  assignable: boolean;
  permissions: string[];
}

export const ORG_ROLE_CATALOG: readonly RoleDefinition[] = [
  {
    role: USER_ROLES.BUSINESS_OWNER,
    label: 'Business Owner',
    description:
      'Full organization ownership including billing, security, payroll, and team access.',
    assignable: false,
    permissions: [
      'organization:manage',
      'billing:manage',
      'team:manage',
      'security:manage',
      'employees:manage',
      'payroll:manage',
      'compliance:manage',
      'approvals:decide',
      'audit:read',
    ],
  },
  {
    role: USER_ROLES.BUSINESS_ADMIN,
    label: 'Business Admin',
    description:
      'Full administrative access across billing, payroll, employees, approvals, and team settings.',
    assignable: true,
    permissions: [
      'organization:manage',
      'billing:manage',
      'team:manage',
      'security:manage',
      'employees:manage',
      'payroll:manage',
      'compliance:manage',
      'approvals:decide',
      'audit:read',
    ],
  },
  {
    role: USER_ROLES.HR_ADMIN,
    label: 'HR Admin',
    description:
      'Manages employees, onboarding, leave, payroll runs, compliance, and audit visibility.',
    assignable: true,
    permissions: [
      'organization:manage',
      'employees:manage',
      'payroll:manage',
      'compliance:manage',
      'approvals:decide',
      'audit:read',
    ],
  },
  {
    role: USER_ROLES.MANAGER,
    label: 'Manager',
    description:
      'Reviews and approves leave, expense, and reimbursement requests for direct reports.',
    assignable: true,
    permissions: ['team:view_reports', 'approvals:decide', 'self_service:use'],
  },
  {
    role: USER_ROLES.EMPLOYEE,
    label: 'Employee',
    description:
      'Self-service access to own profile, payslips, leave requests, and expense claims.',
    assignable: true,
    permissions: ['self_service:use'],
  },
];
