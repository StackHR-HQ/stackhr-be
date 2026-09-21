import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { PeopleModule } from './people/people.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TenantInterceptor } from './database/tenant.interceptor';
import { AuditInterceptor } from './audit/audit.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    CacheModule.register({
      ttl: 60000,
      max: 100,
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
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
    PeopleModule,
    WaitlistModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
