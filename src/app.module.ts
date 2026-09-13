import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { EmployeesModule } from './employees/employees.module';
import { PayrollModule } from './payroll/payroll.module';
import { SpendModule } from './spend/spend.module';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StackhrAdminModule } from './stackhr-admin/stackhr-admin.module';
import { AuditModule } from './audit/audit.module';
import { PrismaModule } from './database/prisma.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { InvitationsModule } from './invitations/invitations.module';
import { LeaveModule } from './leave/leave.module';
import { MeModule } from './me/me.module';
import { ComplianceModule } from './compliance/compliance.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TenantInterceptor } from './database/tenant.interceptor';
import { AuditInterceptor } from './audit/audit.interceptor';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    EmployeesModule,
    PayrollModule,
    SpendModule,
    BillingModule,
    NotificationsModule,
    StackhrAdminModule,
    AuditModule,
    OnboardingModule,
    ApprovalsModule,
    InvitationsModule,
    LeaveModule,
    MeModule,
    ComplianceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
