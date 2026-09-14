import { createPeopleValidationPipe } from '../../common/people-validation.pipe';
import { DepartmentDto } from './department.dto';

const ADA = '01a09c5e-7288-78f7-868d-18f6f25e5c92';
const BOLA = '01a09c5e-728a-7611-9e81-6a67e0a06781';

describe('DepartmentDto validation', () => {
  const pipe = createPeopleValidationPipe();
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: DepartmentDto });

  const expectFieldError = (body: unknown, path: string) =>
    expect(validate(body)).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'VALIDATION_ERROR',
        fields: { [path]: expect.any(String) as unknown },
      },
    });

  it('collapses surrounding and repeated whitespace in the name', async () => {
    await expect(
      validate({
        name: '  Customer   Success ',
        headEmployeeId: ADA,
        memberIds: [ADA, BOLA],
      }),
    ).resolves.toMatchObject({ name: 'Customer Success' });
  });

  it('rejects the same employee listed twice', async () => {
    await expectFieldError(
      { name: 'Sales', memberIds: [ADA, ADA] },
      'memberIds',
    );
  });

  it('rejects a member reference that is not a UUID', async () => {
    await expectFieldError(
      { name: 'Sales', memberIds: [ADA, 'emp_bola'] },
      'memberIds',
    );
  });

  it('requires the full member list, even when it is empty', async () => {
    await expectFieldError({ name: 'Sales' }, 'memberIds');
  });
});
