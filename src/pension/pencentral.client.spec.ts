/* eslint-disable @typescript-eslint/require-await */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PenCentralClient } from './pencentral.client';

describe('PenCentralClient', () => {
  let client: PenCentralClient;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PENCENTRAL_BASE_URL: 'https://test-api.pensioncentral.ng',
      PENCENTRAL_API_KEY: 'pk_sandbox_test_key_123',
    };
    client = new PenCentralClient();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('Configuration & Authentication', () => {
    it('throws ServiceUnavailableException when PENCENTRAL_API_KEY is missing', async () => {
      delete process.env.PENCENTRAL_API_KEY;
      const unconfiguredClient = new PenCentralClient();

      await expect(unconfiguredClient.whoami()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('whoami', () => {
    it('successfully calls whoami endpoint', async () => {
      const mockResponse = {
        partner_id: 'partner_abc123',
        partner_name: 'StackHR',
        partner_status: 'active',
        credential_id: 'cred_123',
        credential_scopes: ['schedules:write'],
        credential_environment: 'Sandbox',
        credential_expires_at: null,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as any);

      const result = await client.whoami();
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.pensioncentral.ng/partner-api/v1/whoami',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer pk_sandbox_test_key_123',
          }),
        }),
      );
    });
  });

  describe('validateSchedule', () => {
    it('posts schedule validation payload with idempotency key', async () => {
      const mockPayload = {
        employer_code: 'EMP001',
        rows: [
          {
            rsa_pin: 'PEN123456789012',
            pfa_code: '001',
            first_name: 'Ada',
            last_name: 'Okafor',
            staff_id: 'STAFF-001',
            payment_year: 2026,
            payment_month: 'September',
            employee_contribution: '5000.00',
            employer_contribution: '5000.00',
            employee_voluntary_contribution: '0.00',
            employer_voluntary_contribution: '0.00',
            other_contribution: '0.00',
            declared_total: '10000.00',
            contribution_type: 'MAN',
          },
        ],
      };

      const mockRes = {
        validation_id: 'val_123',
        status: 'pending',
        employer_code: 'EMP001',
        total_rows: 1,
        valid_rows: 1,
        invalid_rows: 0,
        pending_rows: 0,
        declared_total: '10000.00',
        computed_total: '10000.00',
        created_at: '2026-09-01T10:00:00Z',
        completed_at: null,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: async () => mockRes,
      } as any);

      const result = await client.validateSchedule(
        mockPayload,
        'custom-idem-key',
      );
      expect(result).toEqual(mockRes);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.pensioncentral.ng/partner-api/v1/schedule-validations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Idempotency-Key': 'custom-idem-key',
          }),
          body: JSON.stringify(mockPayload),
        }),
      );
    });
  });

  describe('Error handling', () => {
    it.each([
      [400, BadRequestException],
      [401, UnauthorizedException],
      [403, ForbiddenException],
      [404, NotFoundException],
      [409, ConflictException],
      [422, UnprocessableEntityException],
      [500, ServiceUnavailableException],
    ])('maps HTTP %i to %p', async (statusCode, expectedError) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: statusCode,
        json: async () => ({ error: { message: 'Something went wrong' } }),
      } as any);

      await expect(client.whoami()).rejects.toThrow(expectedError);
    });

    it('throws ServiceUnavailableException on network failure', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Connection timeout'));

      await expect(client.whoami()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('Other endpoints', () => {
    it('getValidationStatus calls correct URL', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ validation_id: 'val_1', status: 'success' }),
      } as any);

      const res = await client.getValidationStatus('val_1');
      expect(res.status).toBe('success');
    });

    it('getValidationErrors calls correct URL with limit', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          validation_id: 'val_1',
          total_errors: 1,
          errors: [],
        }),
      } as any);

      const res = await client.getValidationErrors('val_1', 20);
      expect(res.total_errors).toBe(1);
    });

    it('submitSchedule posts validation_id', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ schedule_id: 'sch_1', status: 'submitted' }),
      } as any);

      const res = await client.submitSchedule('val_1');
      expect(res.schedule_id).toBe('sch_1');
    });

    it('initiatePayment posts to payments endpoint', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: async () => ({
          payment_id: 'pay_1',
          account_number: '9990001234',
        }),
      } as any);

      const res = await client.initiatePayment('sch_1');
      expect(res.payment_id).toBe('pay_1');
    });

    it('getPaymentStatus fetches payment detail', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ payment_id: 'pay_1', status: 'succeeded' }),
      } as any);

      const res = await client.getPaymentStatus('pay_1');
      expect(res.status).toBe('succeeded');
    });

    it('getReceipt fetches receipt', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ receipt_id: 'rcp_1', status: 'issued' }),
      } as any);

      const res = await client.getReceipt('pay_1');
      expect(res.receipt_id).toBe('rcp_1');
    });

    it('getDisbursements fetches PFA disbursements', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          schedule_id: 'sch_1',
          status: 'completed',
          pfas: [],
        }),
      } as any);

      const res = await client.getDisbursements('sch_1');
      expect(res.status).toBe('completed');
    });

    it('getDashboard fetches dashboard', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ employer_code: 'EMP001', schedule_count: 5 }),
      } as any);

      const res = await client.getDashboard('EMP001');
      expect(res.schedule_count).toBe(5);
    });

    it('getComplianceReport fetches compliance report', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ employer_code: 'EMP001', submitted_count: 5 }),
      } as any);

      const res = await client.getComplianceReport('EMP001');
      expect(res.submitted_count).toBe(5);
    });
  });

  describe('Employer Onboarding (Partner API)', () => {
    it('validateEmployer sends employer_code and returns validation response', async () => {
      const mockValidation = {
        validation_id: 'ev_123',
        employer_code: 'PR0000126311',
        employer_name: 'UNDERDOG PRODUCTIONS LIMITED',
        valid: true,
        expires_at: '2026-10-16T04:03:02.485Z',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockValidation,
      } as any);

      const res = await client.validateEmployer('PR0000126311');
      expect(res).toEqual(mockValidation);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.pensioncentral.ng/partner-api/v1/employers/validations',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ employer_code: 'PR0000126311' }),
        }),
      );
    });

    it('validateEmployer handles 422 unprocessable entity when employer code is invalid', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: {
            code: 'employer_code_invalid',
            message:
              "PENCOM did not validate employer code 'PR9999999999'. Employer not found.",
          },
        }),
      } as any);

      await expect(client.validateEmployer('PR9999999999')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('attachEmployer sends validation_id and returns attached employer grant', async () => {
      const mockGrant = {
        id: 'grant_123',
        employer_code: 'PR0000126311',
        employer_name: 'UNDERDOG PRODUCTIONS LIMITED',
        status: 'active',
        attached_at: '2026-10-16T03:33:03.535Z',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockGrant,
      } as any);

      const res = await client.attachEmployer('ev_123');
      expect(res).toEqual(mockGrant);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.pensioncentral.ng/partner-api/v1/employers',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ validation_id: 'ev_123' }),
        }),
      );
    });

    it('attachEmployer handles 404 when validation_id has expired or is invalid', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            code: 'not_found',
            message:
              "Employer validation 'ev_expired' was not found for this partner.",
          },
        }),
      } as any);

      await expect(client.attachEmployer('ev_expired')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('listAttachedEmployers returns array of employer grants', async () => {
      const mockGrants = [
        {
          id: 'grant_123',
          employer_code: 'PR0000126311',
          employer_name: 'UNDERDOG PRODUCTIONS LIMITED',
          status: 'active',
          attached_at: '2026-10-16T03:33:03.535Z',
        },
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockGrants,
      } as any);

      const res = await client.listAttachedEmployers();
      expect(res).toEqual(mockGrants);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.pensioncentral.ng/partner-api/v1/employers',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('revokeEmployer sends DELETE request and handles 204 No Content', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => null,
      } as any);

      await expect(
        client.revokeEmployer('PR0000126311'),
      ).resolves.toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.pensioncentral.ng/partner-api/v1/employers/PR0000126311',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });
  });
});
