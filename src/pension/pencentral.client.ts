import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
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
  PenCentralInitiatePaymentResponse,
  PenCentralReceiptResponse,
  PenCentralSubmitScheduleResponse,
  PenCentralValidationErrorsResponse,
  PenCentralValidationRequest,
  PenCentralValidationResponse,
  PenCentralWhoAmIResponse,
} from './pencentral.types';

@Injectable()
export class PenCentralClient {
  private readonly logger = new Logger(PenCentralClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor() {
    this.baseUrl =
      process.env.PENCENTRAL_BASE_URL?.replace(/\/+$/, '') ??
      'https://newhrpartnersapi.pensioncentral.ng';
    this.apiKey = process.env.PENCENTRAL_API_KEY;
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

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = {
      Authorization: this.getAuthHeader(),
      'Content-Type': 'application/json',
    };

    if (method === 'POST') {
      headers['Idempotency-Key'] = options.idempotencyKey ?? randomUUID();
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (err: any) {
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
          throw new UnauthorizedException(msg);
        case 403:
          throw new ForbiddenException(msg);
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
}
