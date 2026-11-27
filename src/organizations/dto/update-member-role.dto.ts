import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ASSIGNABLE_ORG_ROLES } from '../../auth/auth.constants';

export class UpdateMemberRoleDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(ASSIGNABLE_ORG_ROLES, {
    message: `role must be one of: ${ASSIGNABLE_ORG_ROLES.join(', ')}`,
  })
  role!: (typeof ASSIGNABLE_ORG_ROLES)[number];
}
