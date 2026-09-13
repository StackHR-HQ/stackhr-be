import type { AuthenticatedUser } from '../../auth/auth.types';

export const ORG_A = 'org_a';
export const ORG_B = 'org_b';

export function adminUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: 'user_admin',
    name: 'Grace Admin',
    email: 'grace@acme.test',
    userType: 'BUSINESS',
    role: 'HR_ADMIN',
    organizationId: ORG_A,
    ...overrides,
  };
}

export function employeeRow(overrides: Record<string, any> = {}) {
  return {
    id: 'emp_ada',
    organizationId: ORG_A,
    fullName: 'Ada Okafor',
    email: 'ada@acme.test',
    department: 'Engineering',
    departmentId: 'dep_eng',
    jobTitle: 'Software Engineer',
    employmentType: 'FULL_TIME',
    salaryAmount: 450000,
    startDate: new Date('2026-01-05T00:00:00.000Z'),
    managerId: null,
    status: 'ACTIVE',
    workLocation: 'Lagos',
    dateOfBirth: null,
    gender: null,
    maritalStatus: null,
    nationality: null,
    phone: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    bankName: null,
    bankAccountLast4: null,
    ...overrides,
  };
}
