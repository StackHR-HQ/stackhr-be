import { NotFoundException } from '@nestjs/common';
import { createInMemoryTenant } from '../testing/in-memory-tenant';
import { adminUser, employeeRow, ORG_B } from '../testing/fixtures';
import { PeopleEmployeesService } from './people-employees.service';

describe('PeopleEmployeesService', () => {
  let fake: ReturnType<typeof createInMemoryTenant>;
  let service: PeopleEmployeesService;

  beforeEach(() => {
    fake = createInMemoryTenant();
    service = new PeopleEmployeesService(fake.tenant);
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
