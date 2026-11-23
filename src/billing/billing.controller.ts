import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Idempotent } from '../common/idempotency/idempotency.decorator';
import { BillingService } from './billing.service';
import { SubscriptionsService } from './subscriptions.service';
import { InvoicesService } from './invoices.service';
import { ChangePlanDto, SubscribeDto } from './dto/billing.dto';

/** Only the people who pay can see prices and change the plan. */
const BILLING_ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
];

@Controller('billing')
@UseGuards(AuthGuard, RolesGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptions: SubscriptionsService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getStatus(user);
  }

  @Get('plans')
  @RequireRoles(...BILLING_ADMIN_ROLES)
  listPlans(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.listPlans(user);
  }

  @Post('subscribe')
  @RequireRoles(...BILLING_ADMIN_ROLES)
  @Idempotent({ required: false })
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubscribeDto) {
    return this.subscriptions.subscribe(this.orgId(user), dto);
  }

  @Post('change-plan')
  @RequireRoles(...BILLING_ADMIN_ROLES)
  @Idempotent({ required: false })
  changePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePlanDto,
  ) {
    return this.subscriptions.changePlan(this.orgId(user), dto);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @RequireRoles(...BILLING_ADMIN_ROLES)
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.cancel(this.orgId(user));
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @RequireRoles(...BILLING_ADMIN_ROLES)
  resume(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.resume(this.orgId(user));
  }

  @Get('invoices')
  @RequireRoles(...BILLING_ADMIN_ROLES)
  listInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.invoices.listForOrg(this.orgId(user));
  }

  @Get('invoices/:id/pdf')
  @RequireRoles(...BILLING_ADMIN_ROLES)
  async downloadInvoicePdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { filename, buffer } = await this.invoices.generatePdf(
      this.orgId(user),
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Post('invoices/:id/pay')
  @HttpCode(HttpStatus.OK)
  @RequireRoles(...BILLING_ADMIN_ROLES)
  @Idempotent({ required: false })
  payInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.getPayLink(this.orgId(user), id);
  }

  private orgId(user: AuthenticatedUser): string {
    // Reuse the service's org-context check so all routes fail the same way.
    return this.billingService.requireOrgId(user);
  }
}
