import { createPeopleValidationPipe } from '../../common/people-validation.pipe';
import { UpdateEmployeeDto } from './update-employee.dto';

// Shape of the IDs Postgres generates with uuidv7().
const DATABASE_ID = '01a09c5e-7288-78f7-868d-18f6f25e5c92';

describe('UpdateEmployeeDto validation', () => {
  const pipe = createPeopleValidationPipe();
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: UpdateEmployeeDto });

  const expectFieldError = (body: unknown, path: string) =>
    expect(validate(body)).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'VALIDATION_ERROR',
        fields: { [path]: expect.any(String) as unknown },
      },
    });

  it('accepts a database-generated UUIDv7 as the new manager', async () => {
    await expect(
      validate({ employment: { managerId: DATABASE_ID } }),
    ).resolves.toMatchObject({ employment: { managerId: DATABASE_ID } });
  });

  it('accepts null to remove the manager', async () => {
    await expect(
      validate({ employment: { managerId: null } }),
    ).resolves.toMatchObject({ employment: { managerId: null } });
  });

  it.each(['123', '12345', 'abcd'])(
    'rejects %p as the last four digits of a bank account',
    async (accountLast4) => {
      await expectFieldError(
        { payment: { bankName: 'Access Bank', accountLast4 } },
        'payment.accountLast4',
      );
    },
  );

  it('requires an effective date on every compensation change', async () => {
    await expectFieldError(
      {
        compensation: {
          annualSalaryMinor: 600_000_000,
          currency: 'NGN',
          payFrequency: 'MONTHLY',
        },
      },
      'compensation.effectiveDate',
    );
  });

  it('reports an invalid emergency contact phone at its nested path', async () => {
    await expectFieldError(
      {
        personal: {
          emergencyContact: {
            name: 'Chidi Okafor',
            relationship: 'SPOUSE',
            phone: '08098765432',
          },
        },
      },
      'personal.emergencyContact.phone',
    );
  });

  it('rejects sections HR cannot change through this route, such as status', async () => {
    await expectFieldError({ status: 'TERMINATED' }, 'status');
  });
});
