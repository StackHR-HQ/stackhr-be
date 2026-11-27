import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { EmployeeOffboardingSchedulerService } from './employee-offboarding-scheduler.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeOffboardingSchedulerService],
})
export class EmployeesModule {}
