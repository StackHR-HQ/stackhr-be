import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DOCUMENT_STORAGE } from './documents/document-storage';
import { PeopleDocumentsController } from './documents/people-documents.controller';
import { PeopleDocumentsService } from './documents/people-documents.service';
import { S3DocumentStorage } from './documents/s3-document-storage';
import { PeopleEmployeesController } from './employees/people-employees.controller';
import { PeopleEmployeesService } from './employees/people-employees.service';
import { PeopleLeaveController } from './leave/people-leave.controller';
import { PeopleLeaveService } from './leave/people-leave.service';
import { PeopleOnboardingController } from './onboarding/people-onboarding.controller';
import { PeopleOnboardingService } from './onboarding/people-onboarding.service';
import { PeopleOrganizationController } from './organization/people-organization.controller';
import { PeopleOrganizationService } from './organization/people-organization.service';
import { TenantPrismaService } from './tenant/tenant-prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [
    PeopleEmployeesController,
    PeopleLeaveController,
    PeopleDocumentsController,
    PeopleOrganizationController,
    PeopleOnboardingController,
  ],
  providers: [
    TenantPrismaService,
    PeopleEmployeesService,
    PeopleLeaveService,
    PeopleDocumentsService,
    PeopleOrganizationService,
    PeopleOnboardingService,
    { provide: DOCUMENT_STORAGE, useClass: S3DocumentStorage },
  ],
})
export class PeopleModule {}
