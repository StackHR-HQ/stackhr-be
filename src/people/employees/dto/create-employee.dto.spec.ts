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
