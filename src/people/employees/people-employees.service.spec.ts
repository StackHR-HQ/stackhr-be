import { NotFoundException } from '@nestjs/common';
import type { EmailService } from '../../notifications/email.service';
import { createInMemoryTenant } from '../testing/in-memory-tenant';
import { adminUser, employeeRow, ORG_B } from '../testing/fixtures';
import { PeopleEmployeesService } from './people-employees.service';

describe('PeopleEmployeesService', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  let fake: ReturnType<typeof createInMemoryTenant>;
  let email: { send: jest.Mock };
  let service: PeopleEmployeesService;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.stackhr.test';
    fake = createInMemoryTenant();
    email = { send: jest.fn().mockResolvedValue({ id: 'email_1' }) };
    service = new PeopleEmployeesService(
      fake.tenant,
      email as unknown as EmailService,
    );
  });

  afterEach(() => {
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  });

  describe('createEmployee', () => {
    it('emails an invitation link to the new hire when requested', async () => {
      fake.seed('department', [
        { id: 'dep_people', organizationId: 'org_a', name: 'People' },
      ]);

      const created = await service.createEmployee(adminUser(), {
        ...newHire(),
        sendInvitation: true,
      });

      expect(created).toMatchObject({ invitation: { status: 'SENT' } });
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ada@example.com',
          text: expect.stringContaining(
            'https://app.stackhr.test/accept-invitation?token=',
          ) as unknown,
        }),
      );
    });

    const newHire = (employment: Record<string, unknown> = {}) => ({
      personal: {
        firstName: 'Ada',
        lastName: 'Okafor',
        workEmail: 'Ada@Example.com',
        phone: '+2348012345678',
      },
      employment: {
        jobTitle: 'People Operations Manager',
        departmentId: 'dep_people',
        employmentType: 'FULL_TIME',
        startDate: '2026-10-01',
        workLocation: 'Lagos, Nigeria',
        ...employment,
      },
      compensation: {
        annualSalaryMinor: 1_200_000_000,
        currency: 'NGN',
        payFrequency: 'MONTHLY',
      },
      sendInvitation: false,
    });

    it('rejects a department from another organization and creates nothing', async () => {
      fake.seed('department', [
        { id: 'dep_other', organizationId: ORG_B, name: 'Finance' },
      ]);

      await expect(
        service.createEmployee(
          adminUser(),
          newHire({ departmentId: 'dep_other' }),
        ),
      ).rejects.toMatchObject({
        status: 422,
        response: { fields: { departmentId: expect.any(String) as unknown } },
      });
      await expect(service.listEmployees(adminUser())).resolves.toEqual([]);
    });

    it('rejects a manager from another organization and creates nothing', async () => {
      fake.seed('employee', [
        employeeRow({
          id: 'emp_other',
          organizationId: ORG_B,
          email: 'lead@beta.test',
        }),
      ]);

      await expect(
        service.createEmployee(
          adminUser(),
          newHire({ departmentId: undefined, managerId: 'emp_other' }),
        ),
      ).rejects.toMatchObject({
        status: 422,
        response: { fields: { managerId: expect.any(String) as unknown } },
      });
      await expect(service.listEmployees(adminUser())).resolves.toEqual([]);
    });

    it('records the creation in the new employee activity history', async () => {
      fake.seed('department', [
        { id: 'dep_people', organizationId: 'org_a', name: 'People' },
      ]);

      const created = await service.createEmployee(adminUser(), newHire());
      const detail = await service.getEmployee(adminUser(), created.id);

      expect(detail.activity).toEqual([
        {
          id: expect.any(String) as unknown,
          description: 'Ada Okafor was added as People Operations Manager',
          timestamp: expect.any(String) as unknown,
        },
      ]);
    });

    it('starts the employee compensation history at their start date', async () => {
      fake.seed('department', [
        { id: 'dep_people', organizationId: 'org_a', name: 'People' },
      ]);

      const created = await service.createEmployee(adminUser(), newHire());

      await expect(
        service.listCompensationHistory(adminUser(), created.id),
      ).resolves.toEqual([
        {
          id: expect.any(String) as unknown,
          effectiveDate: '2026-10-01',
          annualSalaryMinor: 1_200_000_000,
          currency: 'NGN',
          payFrequency: 'MONTHLY',
        },
      ]);
    });

    it('creates an employee that then appears in the organization directory', async () => {
      fake.seed('department', [
        { id: 'dep_people', organizationId: 'org_a', name: 'People' },
      ]);

      const created = await service.createEmployee(adminUser(), newHire());

      expect(created).toEqual({
        id: expect.any(String) as unknown,
        fullName: 'Ada Okafor',
        email: 'ada@example.com',
        avatarInitials: 'AO',
        jobTitle: 'People Operations Manager',
        departmentId: 'dep_people',
        managerId: null,
        employmentType: 'Full-time',
        employmentStatus: 'pending_invitation',
        startDate: '2026-10-01',
      });
      await expect(service.listEmployees(adminUser())).resolves.toEqual([
        created,
      ]);
    });
  });

  describe('updateEmployee', () => {
    it('records a salary change in compensation history from its effective date', async () => {
      fake.seed('employee', [employeeRow()]);

      await service.updateEmployee(adminUser(), 'emp_ada', {
        compensation: {
          annualSalaryMinor: 600_000_000,
          currency: 'NGN',
          payFrequency: 'MONTHLY',
          effectiveDate: '2026-11-01',
        },
      });

      await expect(
        service.listCompensationHistory(adminUser(), 'emp_ada'),
      ).resolves.toEqual([
        {
          id: expect.any(String) as unknown,
          effectiveDate: '2026-11-01',
          annualSalaryMinor: 600_000_000,
          currency: 'NGN',
          payFrequency: 'MONTHLY',
        },
      ]);
    });

    it('rejects a manager change that would create a reporting cycle', async () => {
      fake.seed('employee', [
        employeeRow({
          id: 'emp_lead',
          fullName: 'Lola Lead',
          email: 'lead@acme.test',
        }),
        employeeRow({ managerId: 'emp_lead' }),
      ]);

      await expect(
        service.updateEmployee(adminUser(), 'emp_lead', {
          employment: { managerId: 'emp_ada' },
        }),
      ).rejects.toMatchObject({
        status: 422,
        response: {
          fields: { 'employment.managerId': expect.any(String) as unknown },
        },
      });
      await expect(
        service.getEmployee(adminUser(), 'emp_lead'),
      ).resolves.toMatchObject({ managerId: null });
    });

    it('changes employment details that are then reflected in the directory', async () => {
      fake.seed('employee', [employeeRow()]);

      const updated = await service.updateEmployee(adminUser(), 'emp_ada', {
        employment: { jobTitle: 'Staff Engineer', workLocation: 'Abuja' },
      });

      expect(updated).toMatchObject({
        id: 'emp_ada',
        jobTitle: 'Staff Engineer',
      });
      await expect(service.listEmployees(adminUser())).resolves.toEqual([
        expect.objectContaining({
          id: 'emp_ada',
          jobTitle: 'Staff Engineer',
        }) as unknown,
      ]);
    });
  });

  describe('listEmployees', () => {
    it('returns directory summaries for the caller organization only', async () => {
      fake.seed('employee', [
        employeeRow({ managerId: 'emp_lead' }),
        employeeRow({
          id: 'emp_other',
          organizationId: ORG_B,
          email: 'other@beta.test',
        }),
      ]);

      await expect(service.listEmployees(adminUser())).resolves.toEqual([
        {
          id: 'emp_ada',
          fullName: 'Ada Okafor',
          email: 'ada@acme.test',
          avatarInitials: 'AO',
          jobTitle: 'Software Engineer',
          departmentId: 'dep_eng',
          managerId: 'emp_lead',
          employmentType: 'Full-time',
          employmentStatus: 'active',
          startDate: '2026-01-05',
        },
      ]);
    });

    it('returns a stable, filtered page when a directory query is supplied', async () => {
      fake.seed('employee', [
        employeeRow({
          id: 'emp_zoe',
          fullName: 'Zoe Admin',
          email: 'zoe@acme.test',
        }),
        employeeRow({
          id: 'emp_ada',
          fullName: 'Ada Okafor',
          email: 'ada@acme.test',
          jobTitle: 'Software Engineer',
        }),
        employeeRow({
          id: 'emp_bert',
          fullName: 'Bert Tester',
          email: 'bert@acme.test',
          status: 'ONBOARDING',
        }),
        employeeRow({
          id: 'emp_other',
          organizationId: ORG_B,
          fullName: 'Ada Elsewhere',
        }),
      ]);

      await expect(
        service.listEmployees(adminUser(), {
          page: '1',
          pageSize: '1',
          search: 'ada',
        }),
      ).resolves.toEqual({
        items: [
          expect.objectContaining({ id: 'emp_ada', fullName: 'Ada Okafor' }),
        ],
        page: 1,
        pageSize: 1,
        total: 1,
      });
      await expect(
        service.listEmployees(adminUser(), { employmentStatus: 'onboarding' }),
      ).resolves.toEqual({
        items: [expect.objectContaining({ id: 'emp_bert' })],
        page: 1,
        pageSize: 25,
        total: 1,
      });
    });

    it('rejects malformed or unsupported pagination and filter values', () => {
      expect(() => service.listEmployees(adminUser(), { page: '0' })).toThrow(
        'page must be between 1 and 1',
      );
      expect(() =>
        service.listEmployees(adminUser(), { pageSize: '101' }),
      ).toThrow('pageSize must be between 1 and 100');
      expect(() =>
        service.listEmployees(adminUser(), { employmentStatus: 'terminated' }),
      ).toThrow('employmentStatus must be one of');
    });
  });

  describe('getEmployee', () => {
    it('treats an employee from another organization as not found', async () => {
      fake.seed('employee', [
        employeeRow({ id: 'emp_other', organizationId: ORG_B }),
      ]);

      await expect(
        service.getEmployee(adminUser(), 'emp_other'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns every profile section from persisted records', async () => {
      jest.useFakeTimers({ now: new Date('2026-09-13T09:00:00.000Z') });
      fake.seed('organization', [
        { id: 'org_a', currency: 'NGN', payrollFrequency: 'MONTHLY' },
      ]);
      fake.seed('employee', [
        employeeRow({
          dateOfBirth: new Date('1994-03-02T00:00:00.000Z'),
          gender: 'Female',
          phone: '+2348000000000',
          emergencyContactName: 'Chidi Okafor',
          bankName: 'GTBank',
          bankAccountLast4: '1234',
        }),
      ]);
      fake.seed('leaveType', [
        {
          id: 'lt_annual',
          organizationId: 'org_a',
          name: 'Annual Leave',
          position: 0,
        },
      ]);
      fake.seed('leaveBalance', [
        {
          id: 'lb_2026',
          organizationId: 'org_a',
          employeeId: 'emp_ada',
          leaveTypeId: 'lt_annual',
          year: 2026,
          totalDays: 20,
          usedDays: 3,
        },
        {
          id: 'lb_2025',
          organizationId: 'org_a',
          employeeId: 'emp_ada',
          leaveTypeId: 'lt_annual',
          year: 2025,
          totalDays: 20,
          usedDays: 20,
        },
      ]);
      fake.seed('leaveRequest', [
        {
          id: 'leave_1',
          organizationId: 'org_a',
          employeeId: 'emp_ada',
          leaveTypeId: 'lt_annual',
          startDate: new Date('2026-09-21T00:00:00.000Z'),
          endDate: new Date('2026-09-23T00:00:00.000Z'),
          days: 3,
          status: 'APPROVED',
        },
      ]);
      fake.seed('document', [
        {
          id: 'doc_1',
          organizationId: 'org_a',
          scope: 'EMPLOYEE',
          employeeId: 'emp_ada',
          name: 'Employment contract',
          category: 'Contract',
          sizeBytes: 248000,
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
        },
      ]);
      fake.seed('auditEvent', [
        {
          id: 'audit_1',
          organizationId: 'org_a',
          employeeId: 'emp_ada',
          description: 'Annual Leave request approved',
          createdAt: new Date('2026-09-10T08:30:00.000Z'),
        },
      ]);

      const detail = await service.getEmployee(adminUser(), 'emp_ada');
      jest.useRealTimers();

      expect(detail).toEqual({
        id: 'emp_ada',
        fullName: 'Ada Okafor',
        email: 'ada@acme.test',
        avatarInitials: 'AO',
        jobTitle: 'Software Engineer',
        departmentId: 'dep_eng',
        managerId: null,
        employmentType: 'Full-time',
        employmentStatus: 'active',
        startDate: '2026-01-05',
        workLocation: 'Lagos',
        personalInfo: {
          dateOfBirth: '1994-03-02',
          gender: 'Female',
          maritalStatus: '',
          nationality: '',
          phone: '+2348000000000',
          address: '',
          emergencyContactName: 'Chidi Okafor',
          emergencyContactPhone: '',
          emergencyContactRelationship: '',
        },
        compensation: {
          salary: 450000,
          annualSalaryMinor: 540000000,
          currency: 'NGN',
          payFrequency: 'Monthly',
          bankName: 'GTBank',
          bankAccountLast4: '1234',
        },
        leaveBalance: [{ type: 'Annual Leave', totalDays: 20, usedDays: 3 }],
        leaveRequests: [
          {
            id: 'leave_1',
            type: 'Annual Leave',
            startDate: '2026-09-21',
            endDate: '2026-09-23',
            days: 3,
            status: 'approved',
          },
        ],
        documents: [
          {
            id: 'doc_1',
            name: 'Employment contract',
            category: 'Contract',
            uploadedAt: '2026-09-01',
            fileSize: '242.2 KB',
          },
        ],
        payslips: [],
        expenses: [],
        salaryAdvances: [],
        activity: [
          {
            id: 'audit_1',
            description: 'Annual Leave request approved',
            timestamp: '2026-09-10T08:30:00.000Z',
          },
        ],
      });
    });
  });
});
