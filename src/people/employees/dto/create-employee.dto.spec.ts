import { createPeopleValidationPipe } from '../../common/people-validation.pipe';
import { CreateEmployeeDto } from './create-employee.dto';

describe('CreateEmployeeDto validation', () => {
  const pipe = createPeopleValidationPipe();
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: CreateEmployeeDto });

  const validBody = () => ({
    personal: {
      firstName: 'Ada',
      lastName: 'Okafor',
      workEmail: 'ada@example.com',
    },
    employment: {
      jobTitle: 'People Operations Manager',
      employmentType: 'FULL_TIME',
      startDate: '2026-10-01',
    },
    compensation: {
      annualSalaryMinor: 1_200_000_000,
      currency: 'NGN',
      payFrequency: 'MONTHLY',
    },
  });

  const expectFieldError = (body: unknown, path: string) =>
    expect(validate(body)).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'VALIDATION_ERROR',
        fields: { [path]: expect.any(String) as unknown },
      },
    });

  it('accepts a valid body and trims names', async () => {
    const body = validBody();
    body.personal.firstName = '  Ada  ';

    await expect(validate(body)).resolves.toMatchObject({
      personal: { firstName: 'Ada', workEmail: 'ada@example.com' },
    });
  });

  it('reports an invalid work email at its nested field path', async () => {
    const body = validBody();
    body.personal.workEmail = 'not-an-email';

    await expectFieldError(body, 'personal.workEmail');
  });

  it('rejects a start date that does not exist on the calendar', async () => {
    const body = validBody();
    body.employment.startDate = '2026-02-30';

    await expectFieldError(body, 'employment.startDate');
  });

  it.each([0, 1_200_000.5, '1200000'])(
    'rejects %p as an annual salary in minor units',
    async (annualSalaryMinor) => {
      await expectFieldError(
        {
          ...validBody(),
          compensation: { ...validBody().compensation, annualSalaryMinor },
        },
        'compensation.annualSalaryMinor',
      );
    },
  );

  it('rejects a currency that is not an upper-case ISO 4217 code', async () => {
    const body = validBody();
    body.compensation.currency = 'ngn';

    await expectFieldError(body, 'compensation.currency');
  });

  it('rejects a department reference that is not a UUID', async () => {
    await expectFieldError(
      {
        ...validBody(),
        employment: { ...validBody().employment, departmentId: 'dept_people' },
      },
      'employment.departmentId',
    );
  });

  it('rejects fields the client may not set, such as the organization', async () => {
    await expect(
      validate({ ...validBody(), organizationId: 'org_other' }),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'VALIDATION_ERROR',
        fields: { organizationId: expect.any(String) as unknown },
      },
    });
  });
});
