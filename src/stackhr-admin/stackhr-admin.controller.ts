import {
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OutboxService } from '../common/outbox/outbox.service';
import { StackhrAdminService } from './stackhr-admin.service';
import {
  CreateAdminUserDto,
  CreateAnnouncementDto,
  CreateSupportTicketDto,
  DecideKybDto,
  KybActionDto,
  ReactivateBusinessDto,
  SuspendBusinessDto,
  UpdateAdminUserDto,
  UpdateBusinessStatusDto,
  UpdateSubscriptionDto,
  UpdateSupportTicketDto,
} from './dto/stackhr-admin.dto';

@Controller('stackhr-admin')
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles(USER_ROLES.STACKHR_ADMIN, USER_ROLES.STACKHR_SUPPORT)
export class StackhrAdminController {
  constructor(
    private readonly outboxService: OutboxService,
    @Optional() private readonly adminService?: StackhrAdminService,
  ) {}

  @Get('me')
  getCurrentAdmin(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Get('dashboard')
  getDashboard() {
    return this.adminService!.getDashboard();
  }

  @Get('businesses')
  listBusinesses(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService!.listBusinesses({
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('businesses/export')
  exportBusinesses(@Query('status') status?: string) {
    return this.adminService!.exportBusinesses(status);
  }

  @Get('businesses/:id')
  getBusinessById(@Param('id') id: string) {
    return this.adminService!.getBusinessById(id);
  }

  @Post('businesses/:id/suspend')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  suspendBusiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SuspendBusinessDto,
  ) {
    return this.adminService!.suspendBusiness(user, id, dto);
  }

  @Post('businesses/:id/reactivate')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  reactivateBusiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReactivateBusinessDto,
  ) {
    return this.adminService!.reactivateBusiness(user, id, dto);
  }

  @Patch('businesses/:id/status')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  updateBusinessStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessStatusDto,
  ) {
    return this.adminService!.updateBusinessStatus(user, id, dto);
  }

  @Get('employees')
  listEmployees(
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('employmentType') employmentType?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService!.listEmployees({
      organizationId,
      status,
      department,
      employmentType,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('employees/:id')
  getEmployeeById(@Param('id') id: string) {
    return this.adminService!.getEmployeeById(id);
  }

  @Get('payroll/runs')
  listPayrollRuns(
    @Query('status') status?: string,
    @Query('organizationId') organizationId?: string,
    @Query('periodYear') periodYear?: string,
    @Query('periodMonth') periodMonth?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService!.listPayrollRuns({
      status,
      organizationId,
      periodYear: periodYear ? Number(periodYear) : undefined,
      periodMonth: periodMonth ? Number(periodMonth) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('payroll/exceptions')
  listPayrollExceptions() {
    return this.adminService!.listPayrollExceptions();
  }

  @Get('payroll/runs/:id')
  getPayrollRunById(@Param('id') id: string) {
    return this.adminService!.getPayrollRunById(id);
  }

  @Get([
    'finance',
    'finance/transactions',
    'finance/transfers',
    'finance/batches',
    'finance/payment-batches',
    'finance/failed',
    'finance/failed-transactions',
    'finance/reconciliation',
  ])
  getFinanceOverview() {
    return this.adminService!.getFinanceOverview();
  }

  @Get([
    'subscriptions',
    'subscriptions/invoices',
    'subscriptions/payment-failures',
  ])
  listSubscriptions(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService!.listSubscriptions({ status, search });
  }

  @Get('subscriptions/plans')
  getSubscriptionPlans() {
    return this.adminService!.getSubscriptionPlans();
  }

  @Patch('subscriptions/:organizationId')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  updateSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.adminService!.updateSubscription(user, organizationId, dto);
  }

  @Get(['compliance/kyb', 'compliance/verifications'])
  listKybVerifications(@Query('status') status?: string) {
    return this.adminService!.listKybVerifications(status);
  }

  @Get([
    'compliance/kyb/:organizationId',
    'compliance/verifications/:organizationId',
    'compliance/documents',
  ])
  getKybVerificationByOrgId(@Param('organizationId') organizationId?: string) {
    if (!organizationId) {
      return this.adminService!.listDocuments({
        category: 'Compliance',
        limit: 100,
      });
    }
    return this.adminService!.getKybVerificationByOrgId(organizationId);
  }

  @Post('compliance/kyb/:organizationId/decide')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  decideKybVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: DecideKybDto,
  ) {
    return this.adminService!.decideKybVerification(user, organizationId, dto);
  }

  @Post('compliance/kyb/:organizationId/approve')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  approveKybVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: KybActionDto,
  ) {
    return this.adminService!.decideKybVerification(user, organizationId, {
      decision: 'APPROVED',
      notes: dto?.notes,
    });
  }

  @Post('compliance/kyb/:organizationId/reject')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  rejectKybVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: KybActionDto,
  ) {
    return this.adminService!.decideKybVerification(user, organizationId, {
      decision: 'REJECTED',
      notes: dto?.notes,
    });
  }

  @Patch('compliance/verifications/:organizationId')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  decideVerificationAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: DecideKybDto,
  ) {
    return this.adminService!.decideKybVerification(user, organizationId, dto);
  }

  @Get('users')
  listUsers(
    @Query('userType') userType?: string,
    @Query('role') role?: string,
    @Query('banned') banned?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService!.listUsers({ userType, role, banned, search });
  }

  @Post('users')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  createAdminUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAdminUserDto,
  ) {
    return this.adminService!.createAdminUser(user, dto);
  }

  @Patch('users/:id')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  updateUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.adminService!.updateUser(user, id, dto);
  }

  @Get(['roles', 'permissions'])
  getRolesAndPermissions() {
    return this.adminService!.getRolesAndPermissions();
  }

  @Get(['sessions', 'login-activity'])
  listSessions(@Query('limit') limit?: string) {
    return this.adminService!.listSessions(limit ? Number(limit) : 50);
  }

  @Delete('sessions/:id')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.adminService!.revokeSession(user, id);
  }

  @Get('audit-logs')
  listAuditLogs(
    @Query('organizationId') organizationId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService!.listAuditLogs({
      organizationId,
      action,
      targetType,
      actorUserId,
      search,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('audit-logs/:id')
  getAuditLogById(@Param('id') id: string) {
    return this.adminService!.getAuditLogById(id);
  }

  @Get('support/tickets')
  listSupportTickets(
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService!.listSupportTickets({ organizationId, status });
  }

  @Get('support/tickets/:id')
  getSupportTicketById(@Param('id') id: string) {
    return this.adminService!.getSupportTicketById(id);
  }

  @Post('support/tickets')
  createSupportTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupportTicketDto,
  ) {
    return this.adminService!.createSupportTicket(user, dto);
  }

  @Patch('support/tickets/:id')
  updateSupportTicket(
    @Param('id') id: string,
    @Body() dto: UpdateSupportTicketDto,
  ) {
    return this.adminService!.updateSupportTicket(id, dto);
  }

  @Get(['notifications', 'notifications/announcements'])
  listNotifications() {
    return this.adminService!.listNotifications();
  }

  @Post('notifications/announcements')
  @RequireRoles(USER_ROLES.STACKHR_ADMIN)
  createAnnouncement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.adminService!.createAnnouncement(user, dto);
  }

  @Get('documents')
  listDocuments(
    @Query('organizationId') organizationId?: string,
    @Query('category') category?: string,
    @Query('scope') scope?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService!.listDocuments({
      organizationId,
      category,
      scope,
      search,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get(['system-health', 'system-health/jobs', 'system-health/failures'])
  getSystemHealth() {
    return this.adminService!.getSystemHealth();
  }

  @Get('outbox/dlq')
  async getDeadLetterEvents(
    @Query('organizationId') organizationId?: string,
    @Query('limit') limit?: string,
  ) {
    const events = await this.outboxService.getDeadLetterEvents(
      organizationId,
      limit ? Math.min(Number(limit), 100) : 50,
    );
    const count = await this.outboxService.getDlqCount(organizationId);

    return {
      total: count,
      events,
    };
  }

  @Post('outbox/dlq/:id/replay')
  async replayDeadLetterEvent(@Param('id') id: string) {
    const replayed = await this.outboxService.replayDeadLetterEvent(id);
    return {
      message: 'Dead letter event successfully queued for replay',
      replayedEventId: replayed.id,
    };
  }
}
