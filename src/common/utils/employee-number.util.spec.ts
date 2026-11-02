import {
  getOrgPrefix,
  computeNextEmployeeNumber,
} from './employee-number.util';

describe('employee-number.util', () => {
  describe('getOrgPrefix', () => {
    it('derives uppercase prefix from slug', () => {
      expect(getOrgPrefix({ slug: 'udu', name: 'Udubonchi' })).toBe('UDU');
      expect(getOrgPrefix({ slug: 'stackhr', name: 'StackHR Inc' })).toBe(
        'STACK',
      );
      expect(getOrgPrefix({ slug: 'acme-corp', name: 'Acme Corp' })).toBe(
        'ACME',
      );
    });

    it('handles generic acme slugs when org name is distinct', () => {
      expect(getOrgPrefix({ slug: 'acme-2024', name: 'Vicki.Inc' })).toBe(
        'VICKI',
      );
    });

    it('normalizes African language diacritics into base letters', () => {
      expect(getOrgPrefix({ name: 'Ọ̀yọ́ Foods', slug: 'oyo-foods' })).toBe(
        'OYO',
      );
      expect(getOrgPrefix({ name: 'Ọ̀ṣun Textiles' })).toBe('OSUN');
    });

    it('falls back to ORG when candidate tag is shorter than 2 characters', () => {
      expect(getOrgPrefix({ slug: 'x' })).toBe('ORG');
      expect(getOrgPrefix({ slug: 'ab' })).toBe('AB');
    });

    it('falls back to name or ORG when slug is missing', () => {
      expect(getOrgPrefix({ slug: null, name: 'Paystack' })).toBe('PAYST');
      expect(getOrgPrefix(null)).toBe('ORG');
      expect(getOrgPrefix(undefined)).toBe('ORG');
      expect(getOrgPrefix({ slug: '', name: '' })).toBe('ORG');
    });
  });

  describe('computeNextEmployeeNumber', () => {
    it('computes 0001 when no existing employees exist', () => {
      expect(computeNextEmployeeNumber('UDU', [])).toBe('UDU-EMP-0001');
    });

    it('increments sequence based on existing <TAG>-EMP-<NUMBER> formats', () => {
      const existing = [
        { employeeNumber: 'UDU-EMP-0001' },
        { employeeNumber: 'UDU-EMP-0002' },
        { employeeNumber: 'UDU-EMP-0003' },
      ];
      expect(computeNextEmployeeNumber('UDU', existing)).toBe('UDU-EMP-0004');
    });

    it('correctly parses legacy EMP-0001 and non-continuous numbers', () => {
      const existing = [
        { employeeNumber: 'EMP-0001' },
        { employeeNumber: 'UDU-EMP-0005' },
        { employeeNumber: null },
      ];
      expect(computeNextEmployeeNumber('UDU', existing)).toBe('UDU-EMP-0006');
    });

    it('ignores imported bare numeric IDs and continues from the highest EMP sequence', () => {
      const existing = [
        { employeeNumber: 'UDU-EMP-0003' },
        { employeeNumber: '20240157' },
      ];
      expect(computeNextEmployeeNumber('UDU', existing)).toBe('UDU-EMP-0004');
    });

    it('increments from legacy EMP-0007 correctly', () => {
      const existing = [{ employeeNumber: 'EMP-0007' }];
      expect(computeNextEmployeeNumber('UDU', existing)).toBe('UDU-EMP-0008');
    });
  });
});
