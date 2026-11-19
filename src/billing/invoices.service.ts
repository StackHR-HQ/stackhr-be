import { randomBytes } from 'crypto';
import PDFDocument from 'pdfkit';
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
    // Resolve the Bachs customer first so a provider/config failure leaves no invoice behind.
    await this.ensureCustomer(params.subscription);

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

    let checkout: Awaited<ReturnType<InvoicesService['attachCheckout']>>;
    try {
      checkout = await this.attachCheckout(invoice, params.subscription);
    } catch (error: any) {
      // Nothing payable exists for this invoice; void it so it never surfaces as owed.
      await this.prisma.billingInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'VOID',
          lastFailureReason:
            `Checkout creation failed: ${String(error?.message ?? error)}`.slice(
              0,
              500,
            ),
        },
      });
      throw error;
    }
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
    // Same convention as email links: the app URL, or the first CORS origin.
    const appUrl = (
      process.env.STACKHR_APP_URL ||
      process.env.FRONTEND_URL?.split(',')[0]?.trim() ||
      'https://app.stackhr.app'
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
      // Saving a card makes Bachs offer cards only, hiding NGN bank transfer.
      // Auto-charge is off until Bachs confirms ₦ off-session charges, so don't save.
      savePaymentMethod: false,
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

  async generatePdf(
    organizationId: string,
    invoiceId: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        organization: { select: { name: true, taxId: true } },
        subscription: { select: { planCode: true, billingCycle: true } },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const formatNaira = (kobo: bigint | string | number): string => {
      const amount = Number(BigInt(kobo)) / 100;
      return `NGN ${amount.toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    };

    const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

    const lines = Array.isArray(invoice.lines)
      ? (invoice.lines as Array<{
          description?: string;
          quantity?: number;
          unitAmountKobo?: string | number | bigint;
          amountKobo?: string | number | bigint;
        }>)
      : [];

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('StackHR', 50, 50);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#555555')
        .text('Subscription Billing Invoice', 50, 74);

      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text(`Invoice ${invoice.number}`, 350, 50, { align: 'right' });
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`Status: ${invoice.status}`, 350, 68, { align: 'right' })
        .text(`Type: ${invoice.kind}`, 350, 82, { align: 'right' });

      doc.moveTo(50, 105).lineTo(545, 105).strokeColor('#dddddd').stroke();

      // Billed To & Period
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text('Billed To', 50, 120);
      doc.font('Helvetica').text(invoice.organization.name, 50, 136);
      if (invoice.organization.taxId) {
        doc.text(`TIN: ${invoice.organization.taxId}`, 50, 150);
      }

      doc.font('Helvetica-Bold').text('Invoice Details', 320, 120);
      doc
        .font('Helvetica')
        .text(
          `Period: ${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)}`,
          320,
          136,
        )
        .text(`Due Date: ${formatDate(invoice.dueAt)}`, 320, 150);
      if (invoice.paidAt) {
        doc.text(`Paid Date: ${formatDate(invoice.paidAt)}`, 320, 164);
      }

      // Line Items Table
      let y = 205;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Description', 50, y);
      doc.text('Qty', 310, y, { width: 45, align: 'right' });
      doc.text('Unit Price', 365, y, { width: 85, align: 'right' });
      doc.text('Amount', 460, y, { width: 85, align: 'right' });
      y += 16;
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#cccccc').stroke();
      y += 10;

      doc.font('Helvetica').fontSize(9.5);
      for (const line of lines) {
        const desc = line.description ?? 'Subscription charge';
        const qty = String(line.quantity ?? 1);
        const unit = formatNaira(line.unitAmountKobo ?? 0);
        const amt = formatNaira(line.amountKobo ?? 0);

        doc.text(desc, 50, y, { width: 250 });
        doc.text(qty, 310, y, { width: 45, align: 'right' });
        doc.text(unit, 365, y, { width: 85, align: 'right' });
        doc.text(amt, 460, y, { width: 85, align: 'right' });
        y += 22;
      }

      y += 8;
      doc.moveTo(320, y).lineTo(545, y).strokeColor('#cccccc').stroke();
      y += 12;

      doc.font('Helvetica').fontSize(10);
      doc.text('Subtotal', 340, y);
      doc.text(formatNaira(invoice.subtotalKobo), 440, y, {
        width: 105,
        align: 'right',
      });
      y += 18;

      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('Total', 340, y);
      doc.text(formatNaira(invoice.totalKobo), 440, y, {
        width: 105,
        align: 'right',
      });

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#777777')
        .text('Thank you for using StackHR.', 50, 750, {
          align: 'center',
          width: 495,
        });

      doc.end();
    });

    return {
      filename: `${invoice.number}.pdf`,
      buffer,
    };
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
