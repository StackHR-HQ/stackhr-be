import { ForbiddenException } from '@nestjs/common';
import { createInMemoryTenant } from '../testing/in-memory-tenant';
import { adminUser, employeeRow, ORG_A, ORG_B } from '../testing/fixtures';
import { PeopleEmployeesService } from '../employees/people-employees.service';
import { PeopleLeaveService } from './people-leave.service';

describe('PeopleLeaveService', () => {
  let fake: ReturnType<typeof createInMemoryTenant>;
  let service: PeopleLeaveService;

  beforeEach(() => {
    fake = createInMemoryTenant();
    service = new PeopleLeaveService(fake.tenant);
    fake.seed('employee', [
      employeeRow(),
      employeeRow({
        id: 'emp_other',
        organizationId: ORG_B,
        fullName: 'Tunde Bello',
      }),
    ]);
    fake.seed('leaveType', [
      {
        id: 'lt_annual',
        organizationId: ORG_A,
        name: 'Annual Leave',
        defaultDays: 20,
        paid: true,
        tone: 'accent',
        description: 'Yearly paid time off',
        position: 0,
      },
      {
        id: 'lt_other',
        organizationId: ORG_B,
        name: 'Other Org Leave',
        defaultDays: 5,
        paid: false,
        tone: 'neutral',
        description: '',
        position: 0,
      },
    ]);
  });

  describe('listRequests', () => {
    it('returns requests with employee display fields for the caller organization only', async () => {
      fake.seed('leaveRequest', [
        {
          id: 'leave_1',
          organizationId: ORG_A,
          employeeId: 'emp_ada',
          leaveTypeId: 'lt_annual',
          startDate: new Date('2026-09-21T00:00:00.000Z'),
          endDate: new Date('2026-09-23T00:00:00.000Z'),
          days: 3,
          status: 'PENDING',
        },
        {
          id: 'leave_other',
          organizationId: ORG_B,
          employeeId: 'emp_other',
          leaveTypeId: 'lt_other',
          startDate: new Date('2026-09-21T00:00:00.000Z'),
          endDate: new Date('2026-09-21T00:00:00.000Z'),
          days: 1,
          status: 'PENDING',
        },
      ]);

      await expect(service.listRequests(adminUser())).resolves.toEqual([
        {
          id: 'leave_1',
          employeeId: 'emp_ada',
          employeeName: 'Ada Okafor',
          avatarInitials: 'AO',
          type: 'Annual Leave',
          startDate: '2026-09-21',
          endDate: '2026-09-23',
          days: 3,
          status: 'pending',
        },
      ]);
    });
  });

  describe('listTypes', () => {
    it('returns the caller organization catalog in configured order', async () => {
      fake.seed('leaveType', [
        {
          id: 'lt_sick',
          organizationId: ORG_A,
          name: 'Sick Leave',
          defaultDays: 10,
          paid: true,
          tone: 'warning',
          description: 'Illness or injury',
          position: 1,
        },
      ]);

      await expect(service.listTypes(adminUser())).resolves.toEqual([
        {
          id: 'lt_annual',
          name: 'Annual Leave',
          defaultDays: 20,
          paid: true,
          tone: 'accent',
          description: 'Yearly paid time off',
        },
        {
          id: 'lt_sick',
          name: 'Sick Leave',
          defaultDays: 10,
          paid: true,
          tone: 'warning',
          description: 'Illness or injury',
        },
      ]);
    });
  });

  describe('listPolicies', () => {
    it('returns the caller organization policy cards in configured order', async () => {
      fake.seed('leavePolicy', [
        {
          id: 'pol_carry',
          organizationId: ORG_A,
          title: 'Carryover',
          description: 'Up to 5 days roll over',
          position: 1,
        },
        {
          id: 'pol_notice',
          organizationId: ORG_A,
          title: 'Notice period',
          description: 'Request 2 weeks ahead',
          position: 0,
        },
        {
          id: 'pol_other',
          organizationId: ORG_B,
          title: 'Other org',
          description: 'Hidden',
          position: 0,
        },
      ]);

      await expect(service.listPolicies(adminUser())).resolves.toEqual([
        {
          id: 'pol_notice',
          title: 'Notice period',
          description: 'Request 2 weeks ahead',
        },
        {
          id: 'pol_carry',
          title: 'Carryover',
          description: 'Up to 5 days roll over',
        },
      ]);
    });
  });

  describe('listBalances', () => {
    afterEach(() => jest.useRealTimers());

    it('returns current-year balances for every employee with the same type columns in every row', async () => {
      jest.useFakeTimers({ now: new Date('2026-09-13T09:00:00.000Z') });
      fake.seed('employee', [
        employeeRow({
          id: 'emp_bola',
          fullName: 'Bola Ade',
          email: 'bola@acme.test',
        }),
      ]);
      fake.seed('leaveType', [
        {
          id: 'lt_sick',
          organizationId: ORG_A,
          name: 'Sick Leave',
          defaultDays: 10,
          paid: true,
          tone: 'warning',
          description: '',
          position: 1,
        },
      ]);
      fake.seed('leaveBalance', [
        {
          id: 'lb_sick',
          organizationId: ORG_A,
          employeeId: 'emp_ada',
          leaveTypeId: 'lt_sick',
          year: 2026,
          totalDays: 10,
          usedDays: 1,
        },
        {
          id: 'lb_annual',
          organizationId: ORG_A,
          employeeId: 'emp_ada',
          leaveTypeId: 'lt_annual',
          year: 2026,
          totalDays: 22,
          usedDays: 3,
        },
        {
          id: 'lb_last_year',
          organizationId: ORG_A,
          employeeId: 'emp_bola',
          leaveTypeId: 'lt_annual',
          year: 2025,
          totalDays: 20,
          usedDays: 20,
        },
      ]);

      await expect(service.listBalances(adminUser())).resolves.toEqual([
        {
          employeeId: 'emp_ada',
          employeeName: 'Ada Okafor',
          avatarInitials: 'AO',
          balances: [
            { type: 'Annual Leave', totalDays: 22, usedDays: 3 },
            { type: 'Sick Leave', totalDays: 10, usedDays: 1 },
          ],
        },
        {
          employeeId: 'emp_bola',
          employeeName: 'Bola Ade',
          avatarInitials: 'BA',
          balances: [
            { type: 'Annual Leave', totalDays: 20, usedDays: 0 },
            { type: 'Sick Leave', totalDays: 10, usedDays: 0 },
          ],
        },
      ]);
    });
  });

  describe('decideRequest', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-09-13T09:00:00.000Z') });
      fake.seed('leaveRequest', [
        {
          id: 'leave_1',
          organizationId: ORG_A,
          employeeId: 'emp_ada',
          leaveTypeId: 'lt_annual',
          startDate: new Date('2026-09-21T00:00:00.000Z'),
          endDate: new Date('2026-09-23T00:00:00.000Z'),
          days: 3,
          status: 'PENDING',
        },
      ]);
      fake.seed('leaveBalance', [
        {
          id: 'lb_annual',
          organizationId: ORG_A,
          employeeId: 'emp_ada',
          leaveTypeId: 'lt_annual',
          year: 2026,
          totalDays: 20,
          usedDays: 2,
        },
      ]);
    });

    afterEach(() => jest.useRealTimers());

    it('approving a pending request persists the decision and charges the balance', async () => {
      await expect(
        service.decideRequest(adminUser(), 'leave_1', { status: 'approved' }),
      ).resolves.toEqual({
        id: 'leave_1',
        employeeId: 'emp_ada',
        employeeName: 'Ada Okafor',
        avatarInitials: 'AO',
        type: 'Annual Leave',
        startDate: '2026-09-21',
        endDate: '2026-09-23',
        days: 3,
        status: 'approved',
      });

      const [adaRow] = await service.listBalances(adminUser());
      expect(adaRow.balances).toEqual([
        { type: 'Annual Leave', totalDays: 20, usedDays: 5 },
      ]);
    });

    it('retrying an identical approval returns the result without charging the balance twice', async () => {
      await service.decideRequest(adminUser(), 'leave_1', {
        status: 'approved',
      });
      const retried = await service.decideRequest(adminUser(), 'leave_1', {
        status: 'approved',
      });
      expect(retried.status).toBe('approved');

      const [adaRow] = await service.listBalances(adminUser());
      expect(adaRow.balances).toEqual([
        { type: 'Annual Leave', totalDays: 20, usedDays: 5 },
      ]);
    });

    it('records the decision in the employee profile activity', async () => {
      fake.seed('organization', [
        { id: ORG_A, currency: 'NGN', payrollFrequency: 'MONTHLY' },
      ]);

      await service.decideRequest(adminUser(), 'leave_1', {
        status: 'approved',
      });

      const profile = await new PeopleEmployeesService(fake.tenant).getEmployee(
        adminUser(),
        'emp_ada',
      );
      expect(profile.activity).toEqual([
        {
          id: expect.any(String) as unknown,
          description: 'Annual Leave request for 21 Sep – 23 Sep 2026 approved',
          timestamp: '2026-09-13T09:00:00.000Z',
        },
      ]);
    });

    it('forbids reviewers from deciding their own leave request', async () => {
      const selfReviewer = adminUser({ email: 'ADA@acme.test' });

      await expect(
        service.decideRequest(selfReviewer, 'leave_1', { status: 'approved' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const [request] = await service.listRequests(adminUser());
      expect(request.status).toBe('pending');
    });

    it('rejecting a pending request leaves the balance untouched', async () => {
      const decided = await service.decideRequest(adminUser(), 'leave_1', {
        status: 'rejected',
      });
      expect(decided.status).toBe('rejected');

      const [adaRow] = await service.listBalances(adminUser());
      expect(adaRow.balances).toEqual([
        { type: 'Annual Leave', totalDays: 20, usedDays: 2 },
      ]);
    });
  });
});
