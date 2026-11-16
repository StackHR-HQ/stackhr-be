import { Test, TestingModule } from '@nestjs/testing';
import { BillingNotifier } from './billing-notifier.service';
import { EmailService } from '../notifications/email.service';
import { PrismaService } from '../database/prisma.service';
import { createPrismaMock } from './testing/billing-fixtures';

const invoice = {
  id: 'inv-r1',
  organizationId: 'org-1',
  number: 'INV-20261124-RRRRRR',
  kind: 'RENEWAL',
  totalKobo: 1_150_000n,
  dueAt: new Date('2026-12-01T00:00:00Z'),
};

describe('BillingNotifier', () => {
  const originalAppUrl = process.env.STACKHR_APP_URL;
  let notifier: BillingNotifier;
  let prisma: ReturnType<typeof createPrismaMock>;
  let email: { send: jest.Mock };

  beforeEach(async () => {
    process.env.STACKHR_APP_URL = 'https://app.stackhr.app';
    prisma = createPrismaMock();
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Ltd',
      owner: { email: 'ada@acme.ng', name: 'Ada Owner' },
    });
    prisma.member = {
      findMany: jest.fn().mockResolvedValue([
        { user: { email: 'bola@acme.ng', name: 'Bola Admin' } },
        { user: { email: 'ADA@acme.ng', name: 'Ada again' } }, // owner is also an admin
      ]),
    };
    email = { send: jest.fn().mockResolvedValue({ id: 'em_1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingNotifier,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: email },
      ],
    }).compile();
    notifier = module.get(BillingNotifier);
  });

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.STACKHR_APP_URL;
    else process.env.STACKHR_APP_URL = originalAppUrl;
  });

  it('emails a new invoice to the owner and business admins once each, linking to the in-app pay page', async () => {
    await notifier.invoiceIssued(invoice);

    expect(prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', role: 'BUSINESS_ADMIN' },
      }),
    );
    const recipients = email.send.mock.calls.map(([m]) => m.to).sort();
    expect(recipients).toEqual(['ada@acme.ng', 'bola@acme.ng']);

    const [message] = email.send.mock.calls[0];
    expect(message.subject).toContain('INV-20261124-RRRRRR');
    expect(message.text).toContain('₦11,500.00');
    expect(message.text).toContain('1 December 2026');
    expect(message.text).toContain(
      'https://app.stackhr.app/settings/billing?invoice=inv-r1',
    );
    expect(message.html).toContain('₦11,500.00');
  });

  it('never throws when sending fails, and still tries every recipient', async () => {
    email.send
      .mockRejectedValueOnce(new Error('SendByte down'))
      .mockResolvedValueOnce({ id: 'em_2' });

    await expect(notifier.paymentReceived(invoice)).resolves.toBeUndefined();
    expect(email.send).toHaveBeenCalledTimes(2);
  });

  it('tells the business its paid features are locked when restricted', async () => {
    await notifier.restricted('org-1');

    const [message] = email.send.mock.calls[0];
    expect(message.subject).toMatch(/restricted|locked/i);
    expect(message.text).toContain('https://app.stackhr.app/settings/billing');
    expect(message.text).toMatch(/your data is safe/i);
  });
});
