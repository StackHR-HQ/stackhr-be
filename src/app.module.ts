import { Module } from '@nestjs/common';
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

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
