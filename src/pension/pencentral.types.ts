export interface PenCentralWhoAmIResponse {
  partner_id: string;
  partner_name: string;
  partner_status: string;
  credential_id: string;
  credential_scopes: string[];
  credential_environment: string;
  credential_expires_at: string | null;
}

export interface PenCentralScheduleRow {
  rsa_pin: string;
  pfa_code: string;
  first_name: string;
  last_name: string;
  staff_id: string;
  payment_year: number;
  payment_month: string;
  employee_contribution: string;
  employer_contribution: string;
  employee_voluntary_contribution: string;
  employer_voluntary_contribution: string;
  other_contribution: string;
  declared_total: string;
  contribution_type: string;
}

export interface PenCentralValidationRequest {
  employer_code: string;
  rows: PenCentralScheduleRow[];
}

export interface PenCentralValidationResponse {
  validation_id: string;
  status: 'pending' | 'success' | 'failed';
  employer_code: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  pending_rows: number;
  declared_total: string;
  computed_total: string;
  created_at: string;
  completed_at: string | null;
}

export interface PenCentralValidationErrorItem {
  row_number: number;
  field: string;
  message: string;
}

export interface PenCentralValidationErrorsResponse {
  validation_id: string;
  total_errors: number;
  next_cursor?: string;
  errors: PenCentralValidationErrorItem[];
}

export interface PenCentralSubmitScheduleResponse {
  schedule_id: string;
  status: string;
  payment_status: string;
  employer_code: string;
  validation_id: string;
  no_of_rows: number;
  no_of_pfas: number;
  total_employee_contribution: string;
  total_employer_contribution: string;
  total_employee_voluntary: string;
  total_employer_voluntary: string;
  total_other_contribution: string;
  total_contribution: string;
  created_at: string;
}

export interface PenCentralInitiatePaymentResponse {
  payment_id: string;
  schedule_id: string;
  status: 'pending' | 'succeeded' | 'failed' | 'expired';
  provider: string;
  contribution_amount: string;
  fee_amount: string;
  total_amount: string;
  currency: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  expires_at: string;
  created_at: string;
}

export interface PenCentralReceiptResponse {
  receipt_id: string;
  payment_id: string;
  schedule_id: string;
  partner_id: string;
  status: string;
  issued_at: string;
  created_at: string;
}

export interface PenCentralDisbursementItem {
  pfa_code: string;
  pfa_name: string;
  amount: string;
  credited_amount: string;
  status: string;
  completed_at: string | null;
}

export interface PenCentralDisbursementsResponse {
  schedule_id: string;
  status: string;
  pfas: PenCentralDisbursementItem[];
}

export interface PenCentralDashboardResponse {
  employer_code: string;
  schedule_count: number;
  unsubmitted_count: number;
  submitted_count: number;
  cancelled_count: number;
  total_remittance: string;
}

export interface PenCentralComplianceReportResponse {
  employer_code: string;
  submitted_count: number;
  submitted_amount: string;
  paid_count: number;
  paid_amount: string;
  disbursed_count: number;
  disbursed_amount: string;
}

export interface PenCentralEmployerValidationRequest {
  employer_code: string;
}

export interface PenCentralEmployerValidationResponse {
  validation_id: string;
  employer_code: string;
  employer_name: string;
  valid: boolean;
  expires_at: string;
}

export interface PenCentralEmployerAttachRequest {
  validation_id: string;
}

export interface PenCentralEmployerAttachResponse {
  id: string;
  employer_code: string;
  employer_name: string;
  status: string;
  attached_at: string;
}

export interface PenCentralEmployerGrant {
  id: string;
  employer_code: string;
  employer_name: string;
  status: string;
  attached_at: string;
}
