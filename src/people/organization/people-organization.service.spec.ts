import { PeopleEmployeesService } from '../employees/people-employees.service';
import { createInMemoryTenant } from '../testing/in-memory-tenant';
import { adminUser, employeeRow, ORG_A, ORG_B } from '../testing/fixtures';
import { PeopleOrganizationService } from './people-organization.service';

describe('PeopleOrganizationService', () => {
  let fake: ReturnType<typeof createInMemoryTenant>;
  let service: PeopleOrganizationService;
  // Department membership is observed through the employee directory.
  let employees: PeopleEmployeesService;

  beforeEach(() => {
    fake = createInMemoryTenant();
    service = new PeopleOrganizationService(fake.tenant);
    employees = new PeopleEmployeesService(fake.tenant, {} as never);
  });

  describe('deleteDepartment', () => {
    it('refuses to delete a department that still has employees', async () => {
      fake.seed('department', [
        { id: 'dep_cs', organizationId: ORG_A, name: 'Customer Success' },
      ]);
      fake.seed('employee', [employeeRow({ departmentId: 'dep_cs' })]);

      await expect(
        service.deleteDepartment(adminUser(), 'dep_cs'),
      ).rejects.toMatchObject({ status: 409 });
      await expect(service.listDepartments(adminUser())).resolves.toEqual([
        { id: 'dep_cs', name: 'Customer Success', headEmployeeId: '' },
      ]);
    });
  });

  describe('updateDepartment', () => {
    it('records membership moves in the activity of each employee who moved', async () => {
      fake.seed('department', [
        {
          id: 'dep_cs',
          organizationId: ORG_A,
          name: 'Customer Success',
          headEmployeeId: 'emp_ada',
        },
      ]);
      fake.seed('employee', [
        employeeRow({ departmentId: 'dep_cs' }),
        employeeRow({
          id: 'emp_bola',
          fullName: 'Bola Ade',
          email: 'bola@acme.test',
          departmentId: 'dep_cs',
        }),
        employeeRow({
          id: 'emp_cara',
          fullName: 'Cara Obi',
          email: 'cara@acme.test',
          departmentId: null,
        }),
      ]);

      await service.updateDepartment(adminUser(), 'dep_cs', {
        name: 'Client Success',
        headEmployeeId: 'emp_ada',
        memberIds: ['emp_ada', 'emp_cara'],
      });

      const activityOf = async (employeeId: string) =>
        (await employees.getEmployee(adminUser(), employeeId)).activity.map(
          (event) => event.description,
        );
      await expect(activityOf('emp_cara')).resolves.toEqual([
        'Moved to Client Success',
      ]);
      await expect(activityOf('emp_bola')).resolves.toEqual([
        'Removed from Client Success',
      ]);
      await expect(activityOf('emp_ada')).resolves.toEqual([]);
    });

    it('renames the department and replaces its head and membership', async () => {
      fake.seed('department', [
        {
          id: 'dep_cs',
          organizationId: ORG_A,
          name: 'Customer Success',
          headEmployeeId: 'emp_ada',
        },
      ]);
      fake.seed('employee', [
        employeeRow({ departmentId: 'dep_cs' }),
        employeeRow({
          id: 'emp_bola',
          fullName: 'Bola Ade',
          email: 'bola@acme.test',
          departmentId: 'dep_cs',
        }),
        employeeRow({
          id: 'emp_cara',
          fullName: 'Cara Obi',
          email: 'cara@acme.test',
          departmentId: null,
        }),
      ]);

      await service.updateDepartment(adminUser(), 'dep_cs', {
        name: 'Client Success',
        headEmployeeId: 'emp_cara',
        memberIds: ['emp_ada', 'emp_cara'],
      });

      await expect(service.listDepartments(adminUser())).resolves.toEqual([
        { id: 'dep_cs', name: 'Client Success', headEmployeeId: 'emp_cara' },
      ]);
      await expect(employees.listEmployees(adminUser())).resolves.toEqual([
        expect.objectContaining({
          id: 'emp_ada',
          departmentId: 'dep_cs',
        }) as unknown,
        expect.objectContaining({
          id: 'emp_bola',
          departmentId: '',
        }) as unknown,
        expect.objectContaining({
          id: 'emp_cara',
          departmentId: 'dep_cs',
        }) as unknown,
      ]);
    });
  });

  describe('createDepartment', () => {
    it('rejects a name already used in the organization, ignoring case and spacing', async () => {
      fake.seed('department', [
        { id: 'dep_cs', organizationId: ORG_A, name: 'Customer Success' },
      ]);

      await expect(
        service.createDepartment(adminUser(), {
          name: 'customer success',
          headEmployeeId: null,
          memberIds: [],
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(service.listDepartments(adminUser())).resolves.toEqual([
        { id: 'dep_cs', name: 'Customer Success', headEmployeeId: '' },
      ]);
    });

    it('rejects a head who is not one of the members', async () => {
      fake.seed('employee', [
        employeeRow({ departmentId: null }),
        employeeRow({
          id: 'emp_bola',
          fullName: 'Bola Ade',
          email: 'bola@acme.test',
          departmentId: null,
        }),
      ]);

      await expect(
        service.createDepartment(adminUser(), {
          name: 'Customer Success',
          headEmployeeId: 'emp_bola',
          memberIds: ['emp_ada'],
        }),
      ).rejects.toMatchObject({
        status: 422,
        response: {
          fields: { headEmployeeId: expect.any(String) as unknown },
        },
      });
      await expect(service.listDepartments(adminUser())).resolves.toEqual([]);
    });

    it('rejects members from another organization and creates nothing', async () => {
      fake.seed('employee', [
        employeeRow({ departmentId: null }),
        employeeRow({
          id: 'emp_other',
          organizationId: ORG_B,
          email: 'other@beta.test',
        }),
      ]);

      await expect(
        service.createDepartment(adminUser(), {
          name: 'Customer Success',
          headEmployeeId: null,
          memberIds: ['emp_ada', 'emp_other'],
        }),
      ).rejects.toMatchObject({
        status: 422,
        response: { fields: { memberIds: expect.any(String) as unknown } },
      });
      await expect(service.listDepartments(adminUser())).resolves.toEqual([]);
    });

    it('creates a department with its head and moves the listed members into it', async () => {
      fake.seed('employee', [
        employeeRow({ departmentId: null }),
        employeeRow({
          id: 'emp_bola',
          fullName: 'Bola Ade',
          email: 'bola@acme.test',
          departmentId: null,
        }),
      ]);

      const created = await service.createDepartment(adminUser(), {
        name: 'Customer Success',
        headEmployeeId: 'emp_ada',
        memberIds: ['emp_ada', 'emp_bola'],
      });

      await expect(service.listDepartments(adminUser())).resolves.toEqual([
        { id: created.id, name: 'Customer Success', headEmployeeId: 'emp_ada' },
      ]);
      await expect(employees.listEmployees(adminUser())).resolves.toEqual([
        expect.objectContaining({
          id: 'emp_ada',
          departmentId: created.id,
        }) as unknown,
        expect.objectContaining({
          id: 'emp_bola',
          departmentId: created.id,
        }) as unknown,
      ]);
    });
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
