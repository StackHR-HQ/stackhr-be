import { ForbiddenException } from '@nestjs/common';
import { USER_ROLES, USER_TYPES } from '../../auth/auth.constants';
import type { AuthenticatedUser } from '../../auth/auth.types';

// Manager and employee access need a user-to-employee link, which does not
// exist yet. Until then every People route is limited to business admins.
export const PEOPLE_ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

export function requirePeopleOrganization(user: AuthenticatedUser): string {
  if (
    user.userType !== USER_TYPES.BUSINESS ||
    !user.organizationId ||
    !(PEOPLE_ADMIN_ROLES as string[]).includes(user.role)
  ) {
    throw new ForbiddenException(
      'A business administrator session is required',
    );
  }
  return user.organizationId;
}
