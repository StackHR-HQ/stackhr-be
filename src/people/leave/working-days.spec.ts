import { countWorkingDays } from './working-days';

const MONDAY_TO_FRIDAY = [1, 2, 3, 4, 5];

describe('countWorkingDays', () => {
  it('skips the weekend inside a Friday-to-Tuesday range', () => {
    expect(
      countWorkingDays({
        startDate: '2026-09-25',
        endDate: '2026-09-29',
        workingWeekdays: MONDAY_TO_FRIDAY,
        holidays: [],
      }),
    ).toBe(3);
  });

  it('does not charge a holiday that falls on a working weekday', () => {
    expect(
      countWorkingDays({
        startDate: '2026-09-28',
        endDate: '2026-10-02',
        workingWeekdays: MONDAY_TO_FRIDAY,
        holidays: ['2026-09-30'],
      }),
    ).toBe(4);
  });
});
