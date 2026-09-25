import type { Request } from 'express';
import type { UserRole, UserType } from './auth.constants';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  userType: UserType;
  role: UserRole;
  organizationId: string | null;
  orgSlug?: string | null;
  orgName?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
