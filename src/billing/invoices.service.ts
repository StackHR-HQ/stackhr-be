import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BachsClient } from './bachs/bachs.client';
import { serializeTerms } from './billing-catalog';
import type {
  BillingCycle,
  CommercialTerms,
  InvoiceLine,
} from './domain/pricing';
import { koboToBachsAmount } from './domain/pricing';

export type InvoiceKind =
  'INITIAL' | 'RENEWAL' | 'UPGRADE_PRORATION' | 'OVERAGE_TRUEUP';

export interface IssueInvoiceParams {
  subscription: {
    id: string;
    organizationId: string;
    bachsCustomerId: string | null;
  };
  kind: InvoiceKind;
  periodStart: Date;
  periodEnd: Date;
  dueAt: Date;
  lines: InvoiceLine[];
  totalKobo: bigint;
  targetPlanCode?: string;
  targetBillingCycle?: BillingCycle;
  targetTerms?: CommercialTerms;
  billedEmployeeCount?: number;
}

/** Bachs `reference` must be unique per account, so re-issued checkouts get a suffix. */
export function checkoutReference(invoiceId: string): string {
  return `${invoiceId}.${Date.now().toString(36)}`;
}

export function invoiceIdFromReference(reference: string | null | undefined) {
  return reference ? reference.split('.')[0] : null;
}

function invoiceNumber(now: Date): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${day}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function serializeLines(lines: InvoiceLine[]) {
  return lines.map((l) => ({
    ...l,
    unitAmountKobo: l.unitAmountKobo.toString(),
    amountKobo: l.amountKobo.toString(),
  }));
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bachs: BachsClient,
  ) {}

  findOpenInvoice(organizationId: string) {
    return this.prisma.billingInvoice.findFirst({
      where: { organizationId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
  }

  listForOrg(organizationId: string) {
    return this.prisma.billingInvoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Void unpaid checkout-style invoices superseded by a newer request. */
  voidAbandoned(organizationId: string, kinds: InvoiceKind[]) {
    return this.prisma.billingInvoice.updateMany({
      where: { organizationId, status: 'OPEN', kind: { in: kinds } },
      data: { status: 'VOID' },
    });
  }

  async issueWithCheckout(params: IssueInvoiceParams) {
    const now = new Date();
    const invoice = await this.prisma.billingInvoice.create({
      data: {
        organizationId: params.subscription.organizationId,
        subscriptionId: params.subscription.id,
        number: invoiceNumber(now),
        kind: params.kind,
        status: 'OPEN',
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        dueAt: params.dueAt,
        lines: serializeLines(params.lines),
        subtotalKobo: params.totalKobo,
        totalKobo: params.totalKobo,
        targetPlanCode: params.targetPlanCode ?? null,
        targetBillingCycle: params.targetBillingCycle ?? null,
        targetTerms: params.targetTerms
          ? serializeTerms(params.targetTerms)
          : undefined,
        billedEmployeeCount: params.billedEmployeeCount ?? null,
      },
    });

    const checkout = await this.attachCheckout(invoice, params.subscription);
    return {
      invoice: { ...invoice, ...checkout.fields },
      checkoutUrl: checkout.url,
    };
  }

  /** Returns a live checkout URL for an OPEN invoice, creating one if needed. */
  async getPayLink(organizationId: string, invoiceId: string) {
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: { subscription: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'OPEN') {
      throw new BadRequestException(`Invoice is ${invoice.status}`);
    }

    const stillValid =
      invoice.bachsCheckoutUrl &&
      invoice.bachsCheckoutExpiresAt &&
      invoice.bachsCheckoutExpiresAt.getTime() > Date.now() + 60_000;
    if (stillValid) {
      return { invoiceId: invoice.id, checkoutUrl: invoice.bachsCheckoutUrl! };
    }

    const checkout = await this.attachCheckout(invoice, invoice.subscription);
    return { invoiceId: invoice.id, checkoutUrl: checkout.url };
  }

  private async attachCheckout(
    invoice: {
      id: string;
      number: string;
      totalKobo: bigint;
      organizationId: string;
    },
    subscription: IssueInvoiceParams['subscription'],
  ) {
    const customerId = await this.ensureCustomer(subscription);
    const appUrl = (
      process.env.FRONTEND_URL ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');

    const checkout = await this.bachs.createCheckoutSession({
      customerId,
      amount: koboToBachsAmount(invoice.totalKobo),
      reference: checkoutReference(invoice.id),
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        organizationId: invoice.organizationId,
      },
      successUrl: `${appUrl}/settings/billing?checkout=success`,
      cancelUrl: `${appUrl}/settings/billing?checkout=cancelled`,
      savePaymentMethod: true,
    });

    const fields = {
      bachsCheckoutId: checkout.checkoutId,
      bachsCheckoutUrl: checkout.checkoutUrl,
      bachsCheckoutExpiresAt: checkout.expiresAt,
    };
    await this.prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: fields,
    });
    return { url: checkout.checkoutUrl, fields };
  }

  private async ensureCustomer(
    subscription: IssueInvoiceParams['subscription'],
  ): Promise<string> {
    if (subscription.bachsCustomerId) return subscription.bachsCustomerId;

    const org = await this.prisma.organization.findUnique({
      where: { id: subscription.organizationId },
      include: { owner: { select: { email: true, name: true } } },
    });
    if (!org?.owner?.email) {
      throw new BadRequestException(
        'The organization needs an owner with an email address before it can be billed',
      );
    }

    const { customerId } = await this.bachs.createCustomer(
      {
        email: org.owner.email,
        name: org.name,
        metadata: { organizationId: org.id },
      },
      `stackhr-customer-${org.id}`,
    );
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { bachsCustomerId: customerId },
    });
    subscription.bachsCustomerId = customerId;
    return customerId;
  }
}
