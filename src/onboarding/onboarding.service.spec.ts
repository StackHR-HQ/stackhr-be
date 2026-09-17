import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

const user: AuthenticatedUser = {
  id: 'owner',
  name: 'Owner',
  email: 'owner@acme.com',
  userType: 'BUSINESS',
  role: 'BUSINESS_OWNER',
  organizationId: 'org',
};
const companyInfo = {
  name: 'Acme',
  industry: 'Technology',
  companySize: '11-50',
  currency: 'GHS',
  payrollFrequency: 'Bi-weekly',
  logoDataUrl: 'data:image/png;base64,aGVsbG8=',
};
const employee = {
  id: 'draft-ada',
  fullName: 'Ada Obi',
  email: 'ada@acme.com',
  department: 'Engineering',
  jobTitle: 'Developer',
  employmentType: 'Full-time',
  salary: 450000,
  startDate: '2026-08-22',
  source: 'manual',
};
const manager = {
  ...employee,
  id: 'draft-manager',
  fullName: 'Manager',
  email: 'manager@acme.com',
};

type StoredEmployee = {
  id: string;
  email: string;
  fullName: string;
  managerId: string | null;
  organizationId: string;
};
function setup(existing: StoredEmployee[] = []) {
  const db = {
    organization: {
      update: jest.fn().mockResolvedValue({ id: 'org', name: 'Acme' }),
      findUnique: jest
        .fn()
        .mockResolvedValue({ industry: 'Technology', companySize: '11-50' }),
    },
    employee: {
      findMany: jest
        .fn<Promise<StoredEmployee[]>, [Prisma.EmployeeFindManyArgs]>()
        .mockResolvedValue(existing),
      // Mirrors Postgres assigning IDs on insert.
      createManyAndReturn: jest
        .fn<
          Promise<Array<{ id: string; email: string }>>,
          [Prisma.EmployeeCreateManyAndReturnArgs]
        >()
        .mockImplementation((args) =>
          Promise.resolve(
            (args.data as Array<{ email: string }>).map((row, index) => ({
              id: `db-${index}`,
              email: row.email,
            })),
          ),
        ),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(2),
    },
  };
  const transaction = jest.fn(
    async (fn: (tx: Prisma.TransactionClient) => unknown) =>
      await fn(db as unknown as Prisma.TransactionClient),
  );
  // Only the transaction client exposes writes: accidental writes outside it fail.
  const service = new OnboardingService({
    $transaction: transaction,
  } as unknown as PrismaService);
  return {
    db,
    transaction,
    service,
    controller: new OnboardingController(service),
  };
}

describe('frontend onboarding contract', () => {
  it('saves the exact frontend payload atomically and resolves forward draft manager IDs', async () => {
    const { controller, db, transaction } = setup();
    const result = await controller.complete(user, {
      companyInfo,
      employees: [{ ...employee, managerId: manager.id }, manager],
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(db.organization.update).toHaveBeenCalledWith({
      where: { id: 'org' },
      data: expect.objectContaining({
        name: 'Acme',
        currency: 'GHS',
        payrollFrequency: 'BIWEEKLY',
        logo: companyInfo.logoDataUrl,
      }) as unknown,
    });
    const rows = db.employee.createManyAndReturn.mock.calls[0][0]
      .data as StoredEmployee[];
    expect(rows[0]).toMatchObject({
      organizationId: 'org',
      employmentType: 'FULL_TIME',
      firstName: 'Ada',
      lastName: 'Obi',
    });
    // Postgres assigns IDs; draft IDs only link rows within the submission.
    expect(rows[0]).not.toHaveProperty('id');
    expect(db.employee.update).toHaveBeenCalledWith({
      where: { id: 'db-0' },
      data: { managerId: 'db-1' },
    });
    expect(result.onboarding.complete).toBe(true);
  });

  it.each(['manager', 'manager name', 'managerEmail'])(
    'resolves the CSV %s header within the workspace',
    async (header) => {
      const { service, db } = setup([
        {
          id: 'existing',
          email: 'manager@acme.com',
          fullName: 'Manager',
          managerId: null,
          organizationId: 'org',
        },
      ]);
      await service.importEmployees(
        user,
        `fullName,email,department,jobTitle,employmentType,salary,startDate,${header}\nAda Obi,ada@acme.com,Engineering,Developer,Part-time,450000,2026-08-22,${header === 'managerEmail' ? 'manager@acme.com' : 'Manager'}`,
      );
      expect(db.employee.findMany.mock.calls[0][0]).toMatchObject({
        where: { organizationId: 'org' },
      });
      expect(db.employee.update).toHaveBeenCalledWith({
        where: { id: expect.any(String) as unknown },
        data: { managerId: 'existing' },
      });
    },
  );

  it.each(['NGN', 'USD', 'GHS', 'KES', 'ZAR', 'GBP', 'EUR'])(
    'accepts currency %s',
    async (currency) => {
      const { controller } = setup();
      await expect(
        controller.complete(user, {
          companyInfo: { ...companyInfo, currency },
          employees: [employee],
        }),
      ).resolves.toBeDefined();
    },
  );

  it.each(['Monthly', 'Weekly', 'MONTHLY', 'BIWEEKLY', 'WEEKLY'])(
    'accepts payroll frequency %s',
    async (payrollFrequency) => {
      const { controller } = setup();
      await expect(
        controller.complete(user, {
          companyInfo: { ...companyInfo, payrollFrequency },
          employees: [employee],
        }),
      ).resolves.toBeDefined();
    },
  );

  it.each(['Full-time', 'Part-time', 'Contract', 'Intern', 'FULL_TIME'])(
    'accepts employment type %s',
    async (employmentType) => {
      const { controller } = setup();
      await expect(
        controller.complete(user, {
          companyInfo,
          employees: [{ ...employee, employmentType }],
        }),
      ).resolves.toBeDefined();
    },
  );

  it.each([
    [{ ...employee, managerId: employee.id }],
    [{ ...employee, managerId: 'another-tenant-employee' }],
    [{ ...employee, managerName: 'Missing Manager' }],
    [
      { ...employee, managerId: manager.id },
      { ...manager, managerId: employee.id },
    ],
    [employee, employee],
  ])(
    'rejects invalid relationships or duplicates before inserting employees',
    async (...employees) => {
      const { controller, db } = setup();
      await expect(
        controller.complete(user, { companyInfo, employees }),
      ).rejects.toThrow();
      expect(db.employee.createManyAndReturn).not.toHaveBeenCalled();
    },
  );

  it('rejects ambiguous names', async () => {
    const { controller } = setup([
      {
        id: 'a',
        fullName: 'Manager',
        email: 'a@acme.com',
        managerId: null,
        organizationId: 'org',
      },
      {
        id: 'b',
        fullName: 'Manager',
        email: 'b@acme.com',
        managerId: null,
        organizationId: 'org',
      },
    ]);
    await expect(
      controller.complete(user, {
        companyInfo,
        employees: [{ ...employee, managerName: 'Manager' }],
      }),
    ).rejects.toThrow('exactly one');
  });

  it('returns a conflict when another request inserts the email concurrently', async () => {
    const { controller, db } = setup();
    db.employee.createManyAndReturn.mockRejectedValue({ code: 'P2002' });
    await expect(
      controller.complete(user, { companyInfo, employees: [employee] }),
    ).rejects.toThrow('already exists');
  });

  it('propagates write failure out of the transaction so Prisma rolls back the whole save', async () => {
    const { controller, db, transaction } = setup();
    db.employee.createManyAndReturn.mockRejectedValue(
      new Error('database failure'),
    );
    await expect(
      controller.complete(user, { companyInfo, employees: [employee] }),
    ).rejects.toThrow('database failure');
    await expect(transaction.mock.results[0].value).rejects.toThrow(
      'database failure',
    );
    expect(db.organization.update).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed company/employee payloads and non-admin access', async () => {
    const { controller, transaction } = setup();
    expect(() =>
      controller.complete(user, { companyInfo: null, employees: [] }),
    ).toThrow('companyInfo');
    expect(() =>
      controller.complete(user, { companyInfo, employees: [null] }),
    ).toThrow('employee');
    await expect(
      controller.complete(
        { ...user, role: 'EMPLOYEE' },
        { companyInfo, employees: [employee] },
      ),
    ).rejects.toThrow('administrator');
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    'data:text/html;base64,aGVsbG8=',
    'data:image/png;base64,...',
    `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`,
  ])('rejects invalid or oversized image data', async (logoDataUrl) => {
    const { controller, db } = setup();
    await expect(
      controller.complete(user, {
        companyInfo: { ...companyInfo, logoDataUrl },
        employees: [employee],
      }),
    ).rejects.toThrow();
    expect(db.organization.update).not.toHaveBeenCalled();
  });
});
