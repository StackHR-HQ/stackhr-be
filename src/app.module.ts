import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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
import { PensionModule } from './pension/pension.module';
import { BankingModule } from './banking/banking.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TenantInterceptor } from './database/tenant.interceptor';
import { AuditInterceptor } from './audit/audit.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestContextService } from './common/context/request-context.service';
import { RequestContextMiddleware } from './common/context/request-context.middleware';
import { AppLoggerService } from './common/logger/app-logger.service';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { ResilienceModule } from './common/resilience/resilience.module';
import { OutboxModule } from './common/outbox/outbox.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { MetricsInterceptor } from './common/metrics/metrics.interceptor';

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
    ResilienceModule,
    OutboxModule,
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
    PensionModule,
    BankingModule,
    IdempotencyModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RequestContextService,
    AppLoggerService,
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
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
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
  exports: [RequestContextService, AppLoggerService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
