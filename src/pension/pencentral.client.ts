import {
  Injectable,
  Logger,
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  PenCentralComplianceReportResponse,
  PenCentralDashboardResponse,
  PenCentralDisbursementsResponse,
  PenCentralEmployerAttachRequest,
  PenCentralEmployerAttachResponse,
  PenCentralEmployerGrant,
  PenCentralEmployerValidationRequest,
  PenCentralEmployerValidationResponse,
  PenCentralInitiatePaymentResponse,
  PenCentralReceiptResponse,
  PenCentralSubmitScheduleResponse,
  PenCentralValidationErrorsResponse,
  PenCentralValidationRequest,
  PenCentralValidationResponse,
  PenCentralWhoAmIResponse,
} from './pencentral.types';
import { CircuitBreaker } from '../common/resilience/circuit-breaker';
import { executeWithRetry } from '../common/resilience/retry-policy';

@Injectable()
export class PenCentralClient {
  private readonly logger = new Logger(PenCentralClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly circuitBreaker: CircuitBreaker;

  constructor() {
    this.baseUrl =
      process.env.PENCENTRAL_BASE_URL?.replace(/\/+$/, '') ??
      'https://newhrpartnersapi.pensioncentral.ng';
    this.apiKey = process.env.PENCENTRAL_API_KEY;
    this.circuitBreaker = new CircuitBreaker({
      name: 'PenCentral',
      failureThreshold: 5,
      recoveryTimeoutMs: 30000,
    });
  }

  getCircuitStats() {
    return this.circuitBreaker.getStats();
  }

  private getAuthHeader(): string {
    const key = this.apiKey ?? process.env.PENCENTRAL_API_KEY;
    if (!key) {
      throw new ServiceUnavailableException(
        'PenCentral Partner API key is not configured. Set PENCENTRAL_API_KEY.',
      );
    }
    return `Bearer ${key}`;
  }

  private isSandboxMockEnabled(): boolean {
    if (process.env.PENCENTRAL_MOCK_MODE !== 'true') {
      return false;
    }
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.PENCENTRAL_ENVIRONMENT !== 'sandbox'
    ) {
      throw new Error(
        'PenCentral mock mode is not allowed outside sandbox environment',
      );
    }
    return true;
  }

  private handleMockRequest<T>(
    endpoint: string,
    method: string,
    body?: any,
  ): T {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    if (endpoint === '/partner-api/v1/whoami') {
      return {
        partner_id: 'partner_mock_stackhr',
        partner_name: 'StackHR Sandbox Partner',
        partner_status: 'active',
        credential_id: 'cred_mock_sandbox',
        credential_scopes: [
          'employers:read',
          'employers:write',
          'schedules:write',
          'payments:write',
        ],
        credential_environment: 'Sandbox',
        credential_expires_at: null,
      } as unknown as T;
    }

    if (
      endpoint === '/partner-api/v1/employers/validations' &&
      method === 'POST'
    ) {
      const code = String(body?.employer_code ?? 'PR0000126311').toUpperCase();
      return {
        validation_id: `ev_mock_${code}`,
        employer_code: code,
        employer_name:
          code === 'PR0000126311'
            ? 'UNDERDOG PRODUCTIONS LIMITED'
            : `STACKHR SANDBOX EMPLOYER (${code})`,
        valid: true,
        expires_at: expiresAt,
      } as unknown as T;
    }

    if (endpoint === '/partner-api/v1/employers' && method === 'POST') {
      const valId = String(body?.validation_id ?? '');
      const code = valId.startsWith('ev_mock_')
        ? valId.replace('ev_mock_', '')
        : 'PR0000126311';
      return {
        id: `grant_mock_${code}`,
        employer_code: code,
        employer_name:
          code === 'PR0000126311'
            ? 'UNDERDOG PRODUCTIONS LIMITED'
            : `STACKHR SANDBOX EMPLOYER (${code})`,
        status: 'active',
        attached_at: now,
      } as unknown as T;
    }

    if (endpoint === '/partner-api/v1/employers' && method === 'GET') {
      return [
        {
          id: 'grant_mock_PR0000126311',
          employer_code: 'PR0000126311',
          employer_name: 'UNDERDOG PRODUCTIONS LIMITED',
          status: 'active',
          attached_at: now,
        },
      ] as unknown as T;
    }

    if (
      endpoint.startsWith('/partner-api/v1/employers/') &&
      method === 'DELETE'
    ) {
      return undefined as unknown as T;
    }

    if (
      endpoint === '/partner-api/v1/schedule-validations' &&
      method === 'POST'
    ) {
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      const total = rows
        .reduce((sum: number, r: any) => sum + Number(r.declared_total ?? 0), 0)
        .toFixed(2);
      return {
        validation_id: `val_mock_${randomUUID().slice(0, 8)}`,
        status: 'success',
        employer_code: body?.employer_code ?? 'PR0000126311',
        total_rows: rows.length,
        valid_rows: rows.length,
        invalid_rows: 0,
        pending_rows: 0,
        declared_total: total,
        computed_total: total,
        created_at: now,
        completed_at: now,
      } as unknown as T;
    }

    if (
      endpoint.includes('/schedule-validations/') &&
      endpoint.includes('/errors')
    ) {
      return {
        validation_id: 'val_mock',
        total_errors: 0,
        errors: [],
      } as unknown as T;
    }

    if (endpoint.startsWith('/partner-api/v1/schedule-validations/')) {
      const valId = endpoint.split('/').pop() ?? 'val_mock';
      return {
        validation_id: valId,
        status: 'success',
        employer_code: 'PR0000126311',
        total_rows: 1,
        valid_rows: 1,
        invalid_rows: 0,
        pending_rows: 0,
        declared_total: '10000.00',
        computed_total: '10000.00',
        created_at: now,
        completed_at: now,
      } as unknown as T;
    }

    if (endpoint === '/partner-api/v1/schedules' && method === 'POST') {
      return {
        schedule_id: `sch_mock_${randomUUID().slice(0, 8)}`,
        status: 'submitted',
        payment_status: 'unpaid',
        employer_code: 'PR0000126311',
        validation_id: body?.validation_id ?? 'val_mock',
        no_of_rows: 1,
        no_of_pfas: 1,
        total_employee_contribution: '5000.00',
        total_employer_contribution: '5000.00',
        total_employee_voluntary: '0.00',
        total_employer_voluntary: '0.00',
        total_other_contribution: '0.00',
        total_contribution: '10000.00',
        created_at: now,
      } as unknown as T;
    }

    if (endpoint.endsWith('/payments') && method === 'POST') {
      const scheduleId = endpoint.split('/')[4] ?? 'sch_mock';
      return {
        payment_id: `pay_mock_${randomUUID().slice(0, 8)}`,
        schedule_id: scheduleId,
        status: 'pending',
        provider: 'MONNIFY_SANDBOX',
        contribution_amount: '10000.00',
        fee_amount: '100.00',
        total_amount: '10100.00',
        currency: 'NGN',
        account_number: '9988776655',
        account_name: 'PENCENTRAL / UNDERDOG PRODUCTIONS',
        bank_name: 'MONIEPOINT MFB',
        expires_at: expiresAt,
        created_at: now,
      } as unknown as T;
    }

    if (endpoint.includes('/payments/') && endpoint.endsWith('/receipt')) {
      const paymentId = endpoint.split('/')[4] ?? 'pay_mock';
      return {
        receipt_id: `rcp_mock_${paymentId}`,
        payment_id: paymentId,
        schedule_id: 'sch_mock',
        partner_id: 'partner_mock_stackhr',
        status: 'issued',
        issued_at: now,
        created_at: now,
      } as unknown as T;
    }

    if (endpoint.startsWith('/partner-api/v1/payments/')) {
      const paymentId = endpoint.split('/')[4] ?? 'pay_mock';
      return {
        payment_id: paymentId,
        schedule_id: 'sch_mock',
        status: 'succeeded',
        provider: 'MONNIFY_SANDBOX',
        contribution_amount: '10000.00',
        fee_amount: '100.00',
        total_amount: '10100.00',
        currency: 'NGN',
        account_number: '9988776655',
        account_name: 'PENCENTRAL / UNDERDOG PRODUCTIONS',
        bank_name: 'MONIEPOINT MFB',
        expires_at: expiresAt,
        created_at: now,
      } as unknown as T;
    }

    if (endpoint.endsWith('/disbursements')) {
      const scheduleId = endpoint.split('/')[4] ?? 'sch_mock';
      return {
        schedule_id: scheduleId,
        status: 'completed',
        pfas: [
          {
            pfa_code: '0023',
            pfa_name: 'Stanbic IBTC Pension Managers Limited',
            amount: '10000.00',
            credited_amount: '10000.00',
            status: 'completed',
            completed_at: now,
          },
        ],
      } as unknown as T;
    }

    if (endpoint.startsWith('/partner-api/v1/dashboard')) {
      return {
        employer_code: 'PR0000126311',
        schedule_count: 1,
        unsubmitted_count: 0,
        submitted_count: 1,
        cancelled_count: 0,
        total_remittance: '10000.00',
      } as unknown as T;
    }

    if (endpoint.startsWith('/partner-api/v1/reports/compliance')) {
      return {
        employer_code: 'PR0000126311',
        submitted_count: 1,
        submitted_amount: '10000.00',
        paid_count: 1,
        paid_amount: '10000.00',
        disbursed_count: 1,
        disbursed_amount: '10000.00',
      } as unknown as T;
    }

    return {} as unknown as T;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    const method = options.method ?? 'GET';
    if (this.isSandboxMockEnabled()) {
      this.logger.debug(
        `PenCentral running in sandbox mock mode for ${method} ${endpoint}`,
      );
      return this.handleMockRequest<T>(endpoint, method, options.body);
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: this.getAuthHeader(),
      'Content-Type': 'application/json',
    };

    if (method === 'POST') {
      headers['Idempotency-Key'] = options.idempotencyKey ?? randomUUID();
    }

    let response: Response;
    try {
      response = await this.circuitBreaker.execute(async () => {
        return executeWithRetry(
          async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
              const res = await fetch(url, {
                method,
                headers,
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
              });

              if (
                !res.ok &&
                [408, 429, 500, 502, 503, 504].includes(res.status)
              ) {
                throw new ServiceUnavailableException(
                  `PenCentral API returned transient status ${res.status}`,
                );
              }
              return res;
            } catch (fetchErr: any) {
              if (fetchErr.name === 'AbortError') {
                throw new ServiceUnavailableException(
                  `PenCentral API request timed out after 15000ms`,
                );
              }
              throw fetchErr;
            } finally {
              clearTimeout(timer);
            }
          },
          { name: 'PenCentral', maxRetries: 3, initialDelayMs: 200 },
        );
      });
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      this.logger.error(
        `Network error connecting to PenCentral: ${err.message}`,
      );
      throw new ServiceUnavailableException(
        `Unable to connect to PenCentral API: ${err.message}`,
      );
    }

    if (!response.ok) {
      let errorBody: any = null;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = { message: await response.text() };
      }

      const msg =
        errorBody?.error?.message ||
        errorBody?.message ||
        `PenCentral API request failed with status ${response.status}`;

      this.logger.warn(`PenCentral error (${response.status}): ${msg}`);

      switch (response.status) {
        case 400:
          throw new BadRequestException(msg);
        case 401:
        case 403:
          this.logger.error(
            `PenCentral upstream partner authentication failed (${response.status}): ${msg}`,
          );
          throw new BadGatewayException(
            `PenCentral upstream partner authentication failed (${response.status}): ${msg}`,
          );
        case 404:
          throw new NotFoundException(msg);
        case 409:
          throw new ConflictException(msg);
        case 422:
          throw new UnprocessableEntityException(msg);
        default:
          throw new ServiceUnavailableException(
            `PenCentral service error (${response.status}): ${msg}`,
          );
      }
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as unknown as T;
    }

    return (await response.json()) as T;
  }

  /**
   * Step 1: Check Partner Access and Scopes
   */
  async whoami(): Promise<PenCentralWhoAmIResponse> {
    return this.request<PenCentralWhoAmIResponse>('/partner-api/v1/whoami');
  }

  /**
   * Step 2: Upload a Schedule for Validation (JSON)
   */
  async validateSchedule(
    payload: PenCentralValidationRequest,
    idempotencyKey?: string,
  ): Promise<PenCentralValidationResponse> {
    return this.request<PenCentralValidationResponse>(
      '/partner-api/v1/schedule-validations',
      {
        method: 'POST',
        body: payload,
        idempotencyKey,
      },
    );
  }

  /**
   * Step 3: Check Validation Status
   */
  async getValidationStatus(
    validationId: string,
  ): Promise<PenCentralValidationResponse> {
    return this.request<PenCentralValidationResponse>(
      `/partner-api/v1/schedule-validations/${encodeURIComponent(validationId)}`,
    );
  }

  /**
   * Step 4: View Validation Errors
   */
  async getValidationErrors(
    validationId: string,
    limit: number = 50,
  ): Promise<PenCentralValidationErrorsResponse> {
    return this.request<PenCentralValidationErrorsResponse>(
      `/partner-api/v1/schedule-validations/${encodeURIComponent(validationId)}/errors?limit=${limit}`,
    );
  }

  /**
   * Step 5: Submit the Validated Schedule
   */
  async submitSchedule(
    validationId: string,
    idempotencyKey?: string,
  ): Promise<PenCentralSubmitScheduleResponse> {
    return this.request<PenCentralSubmitScheduleResponse>(
      '/partner-api/v1/schedules',
      {
        method: 'POST',
        body: { validation_id: validationId },
        idempotencyKey,
      },
    );
  }

  /**
   * Step 6: View Schedule Details
   */
  async getSchedule(
    scheduleId: string,
  ): Promise<PenCentralSubmitScheduleResponse> {
    return this.request<PenCentralSubmitScheduleResponse>(
      `/partner-api/v1/schedules/${encodeURIComponent(scheduleId)}`,
    );
  }

  /**
   * Step 6.1: View Schedule Rows
   */
  async getScheduleRows(scheduleId: string): Promise<any> {
    return this.request(
      `/partner-api/v1/schedules/${encodeURIComponent(scheduleId)}/rows`,
    );
  }

  /**
   * Step 6.2: Cancel/Delete Unpaid Schedule
   */
  async cancelSchedule(scheduleId: string): Promise<any> {
    return this.request(
      `/partner-api/v1/schedules/${encodeURIComponent(scheduleId)}`,
      { method: 'DELETE' },
    );
  }

  /**
   * Step 7: Initiate Synthetic Virtual Account Payment
   */
  async initiatePayment(
    scheduleId: string,
    idempotencyKey?: string,
  ): Promise<PenCentralInitiatePaymentResponse> {
    return this.request<PenCentralInitiatePaymentResponse>(
      `/partner-api/v1/schedules/${encodeURIComponent(scheduleId)}/payments`,
      {
        method: 'POST',
        idempotencyKey,
      },
    );
  }

  /**
   * Step 8: Check Payment Status
   */
  async getPaymentStatus(
    paymentId: string,
  ): Promise<PenCentralInitiatePaymentResponse> {
    return this.request<PenCentralInitiatePaymentResponse>(
      `/partner-api/v1/payments/${encodeURIComponent(paymentId)}`,
    );
  }

  /**
   * Step 9: Get Remittance Receipt
   */
  async getReceipt(paymentId: string): Promise<PenCentralReceiptResponse> {
    return this.request<PenCentralReceiptResponse>(
      `/partner-api/v1/payments/${encodeURIComponent(paymentId)}/receipt`,
    );
  }

  /**
   * Step 9.1: Download Receipt Details
   */
  async downloadReceipt(paymentId: string): Promise<any> {
    return this.request(
      `/partner-api/v1/payments/${encodeURIComponent(paymentId)}/receipt/download`,
    );
  }

  /**
   * Step 10: Check Disbursement Status to PFAs
   */
  async getDisbursements(
    scheduleId: string,
  ): Promise<PenCentralDisbursementsResponse> {
    return this.request<PenCentralDisbursementsResponse>(
      `/partner-api/v1/schedules/${encodeURIComponent(scheduleId)}/disbursements`,
    );
  }

  /**
   * Step 11: Get Employer Dashboard
   */
  async getDashboard(
    employerCode: string,
  ): Promise<PenCentralDashboardResponse> {
    return this.request<PenCentralDashboardResponse>(
      `/partner-api/v1/dashboard?employer_code=${encodeURIComponent(employerCode)}`,
    );
  }

  /**
   * Step 12: Get Compliance Report
   */
  async getComplianceReport(
    employerCode: string,
  ): Promise<PenCentralComplianceReportResponse> {
    return this.request<PenCentralComplianceReportResponse>(
      `/partner-api/v1/reports/compliance?employer_code=${encodeURIComponent(employerCode)}`,
    );
  }

  /**
   * Phase 0 — Employer Onboarding
   * Step 1: Validate Employer Code (Read-Only)
   */
  async validateEmployer(
    employerCode: string,
  ): Promise<PenCentralEmployerValidationResponse> {
    const body: PenCentralEmployerValidationRequest = {
      employer_code: employerCode,
    };
    return this.request<PenCentralEmployerValidationResponse>(
      '/partner-api/v1/employers/validations',
      {
        method: 'POST',
        body,
      },
    );
  }

  /**
   * Phase 0 — Employer Onboarding
   * Step 2: Attach the Confirmed Employer
   */
  async attachEmployer(
    validationId: string,
  ): Promise<PenCentralEmployerAttachResponse> {
    const body: PenCentralEmployerAttachRequest = {
      validation_id: validationId,
    };
    return this.request<PenCentralEmployerAttachResponse>(
      '/partner-api/v1/employers',
      {
        method: 'POST',
        body,
      },
    );
  }

  /**
   * Phase 0 — Employer Onboarding
   * Step 3: List Attached Employers
   */
  async listAttachedEmployers(): Promise<PenCentralEmployerGrant[]> {
    return this.request<PenCentralEmployerGrant[]>('/partner-api/v1/employers');
  }

  /**
   * Phase 0 — Employer Onboarding
   * Step 4: Revoke Employer Access
   */
  async revokeEmployer(employerCode: string): Promise<void> {
    await this.request<void>(
      `/partner-api/v1/employers/${encodeURIComponent(employerCode)}`,
      {
        method: 'DELETE',
      },
    );
  }
}
