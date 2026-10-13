export interface PfaDefinition {
  code: string;
  name: string;
}

/**
 * Official registered Pension Fund Administrators (PFAs) in Nigeria with 3-digit PenCom codes.
 */
export const NIGERIAN_PFAS: readonly PfaDefinition[] = [
  { code: '001', name: 'Leadway Pensure PFA' },
  { code: '021', name: 'ARM Pension Managers' },
  { code: '022', name: 'Stanbic IBTC Pension Managers' },
  { code: '023', name: 'Premium Pension Limited' },
  { code: '024', name: 'FCMB Pensions Limited' },
  { code: '025', name: 'Trustfund Pensions Limited' },
  { code: '026', name: 'Access Pensions Limited' },
  { code: '027', name: 'CrusaderSterling Pensions Limited' },
  { code: '028', name: 'Tangerine APT Pensions Limited' },
  { code: '029', name: 'Pensions Alliance Limited (PAL Pensions)' },
  { code: '030', name: 'Veritas Glanvills Pensions Limited' },
  { code: '031', name: 'Oak Pensions Limited' },
  { code: '032', name: 'Guaranty Trust Pension Managers (GTCO)' },
  { code: '033', name: 'Fidelity Pension Managers' },
  { code: '034', name: 'Norrenberger Pensions Limited' },
  { code: '035', name: 'Radix Pension Managers' },
  { code: '036', name: 'NPF Pensions Limited' },
  { code: '037', name: 'First Guarantee Pension Limited' },
] as const;

export const PENSION_SCHEDULE_STATUS = {
  DRAFT: 'DRAFT',
  VALIDATING: 'VALIDATING',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATED: 'VALIDATED',
  SUBMITTED: 'SUBMITTED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',
  DISBURSED: 'DISBURSED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
} as const;

export type PensionScheduleStatus =
  (typeof PENSION_SCHEDULE_STATUS)[keyof typeof PENSION_SCHEDULE_STATUS];

export const CONTRIBUTION_TYPES = [
  'MAN',
  'ADD',
  'PEN',
  'ARR',
  'ACR',
  'BON',
  'UPF',
  'OFF',
  '13T',
  '14T',
  'OTH',
  'INC',
  'HOU',
  'PRE',
  'SHO',
] as const;

export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export const RSA_PIN_REGEX = /^(PEN|TPEN)[0-9A-Za-z]{11,12}$/;
