import { createInMemoryTenant } from '../testing/in-memory-tenant';
import { adminUser, ORG_A, ORG_B } from '../testing/fixtures';
import { PeopleOrganizationService } from './people-organization.service';

describe('PeopleOrganizationService', () => {
  let fake: ReturnType<typeof createInMemoryTenant>;
  let service: PeopleOrganizationService;

  beforeEach(() => {
    fake = createInMemoryTenant();
    service = new PeopleOrganizationService(fake.tenant);
  });

  describe('listDepartments', () => {
    it('returns the caller organization departments by name, with vacant heads as empty strings', async () => {
      fake.seed('department', [
        {
          id: 'dep_sales',
          organizationId: ORG_A,
          name: 'Sales',
          headEmployeeId: null,
        },
        {
          id: 'dep_eng',
          organizationId: ORG_A,
          name: 'Engineering',
          headEmployeeId: 'emp_ada',
        },
        {
          id: 'dep_other',
          organizationId: ORG_B,
          name: 'Finance',
          headEmployeeId: null,
        },
      ]);

      await expect(service.listDepartments(adminUser())).resolves.toEqual([
        { id: 'dep_eng', name: 'Engineering', headEmployeeId: 'emp_ada' },
        { id: 'dep_sales', name: 'Sales', headEmployeeId: '' },
      ]);
    });
  });

  describe('listTeams', () => {
    it('returns the caller organization teams with lead and member ids', async () => {
      fake.seed('team', [
        {
          id: 'team_platform',
          organizationId: ORG_A,
          name: 'Platform',
          description: 'Core services',
          leadEmployeeId: 'emp_ada',
        },
        {
          id: 'team_other',
          organizationId: ORG_B,
          name: 'Hidden',
          description: '',
          leadEmployeeId: null,
        },
      ]);
      fake.seed('teamMember', [
        {
          organizationId: ORG_A,
          teamId: 'team_platform',
          employeeId: 'emp_bola',
        },
        {
          organizationId: ORG_A,
          teamId: 'team_platform',
          employeeId: 'emp_ada',
        },
        {
          organizationId: ORG_B,
          teamId: 'team_other',
          employeeId: 'emp_other',
        },
      ]);

      await expect(service.listTeams(adminUser())).resolves.toEqual([
        {
          id: 'team_platform',
          name: 'Platform',
          description: 'Core services',
          leadEmployeeId: 'emp_ada',
          memberIds: ['emp_ada', 'emp_bola'],
        },
      ]);
    });
  });
});
