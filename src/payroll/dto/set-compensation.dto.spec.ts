import { validate } from 'class-validator';
import { SetCompensationDto } from './set-compensation.dto';

describe('SetCompensationDto', () => {
  it('accepts UUID v7 employeeId as well as UUID v4', async () => {
    const dtoV7 = new SetCompensationDto();
    dtoV7.employeeId = '01933c9e-7b2a-7d4e-8f12-3456789abcde';
    dtoV7.basicSalary = 30_000_000;

    const dtoV4 = new SetCompensationDto();
    dtoV4.employeeId = 'eb27f48e-1189-4779-9e01-123456789abc';
    dtoV4.basicSalary = 30_000_000;

    expect(await validate(dtoV7)).toHaveLength(0);
    expect(await validate(dtoV4)).toHaveLength(0);
  });

  it('rejects non-UUID employeeId', async () => {
    const dto = new SetCompensationDto();
    dto.employeeId = 'not-a-uuid';
    dto.basicSalary = 30_000_000;

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('employeeId');
  });
});
