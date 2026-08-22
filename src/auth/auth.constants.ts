export const SESSION_COOKIE_NAME = 'stackhr_session';
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

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
