import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AnchorClient } from './anchor.client';
import { MOCK_NIGERIAN_BANKS } from './anchor.fixtures';

describe('AnchorClient', () => {
  let client: AnchorClient;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Mock Mode (when ANCHOR_API_KEY is not set or in test mode without live flag)', () => {
    beforeEach(() => {
      delete process.env.ANCHOR_API_KEY;
      client = new AnchorClient();
    });

    it('should return mock Nigerian banks when getBanks is called', async () => {
      const banks = await client.getBanks();
      expect(banks).toHaveLength(MOCK_NIGERIAN_BANKS.length);
      expect(banks[0].name).toBe('ACCESS BANK');
      expect(banks[0].nipCode).toBe('000014');
    });

    it('should return simulated verified account details when verifyAccount is called', async () => {
      const result = await client.verifyAccount('000014', '0123456789');
      expect(result).toEqual({
        accountNumber: '0123456789',
        accountName: 'CHUKWUEMEKA TEST ACCOUNT',
        bankCode: '000014',
        bankName: 'ACCESS BANK',
      });
    });
  });

  describe('Live Mode (with ANCHOR_API_KEY configured)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.ANCHOR_API_KEY = 'test-anchor-api-key';
      process.env.ANCHOR_BASE_URL = 'https://api.sandbox.getanchor.co';
      client = new AnchorClient();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should call Anchor GET /api/v1/banks and return formatted bank items', async () => {
      const mockResponse = {
        data: [
          {
            id: 'anc_bk_1',
            type: 'Bank',
            attributes: {
              nipCode: '000014',
              name: 'ACCESS BANK',
              cbnCode: '044',
            },
          },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const banks = await client.getBanks();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sandbox.getanchor.co/api/v1/banks',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-anchor-key': 'test-anchor-api-key',
          }),
        }),
      );
      expect(banks).toEqual([
        {
          id: 'anc_bk_1',
          name: 'ACCESS BANK',
          nipCode: '000014',
          cbnCode: '044',
        },
      ]);
    });

    it('should throw ServiceUnavailableException on Anchor 500 error for getBanks', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway'),
      });

      await expect(client.getBanks()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should call verify-account endpoint and return verified account details', async () => {
      const mockResponse = {
        data: {
          id: '0',
          type: 'AccountDetail',
          attributes: {
            bank: {
              id: 'anc_bk_14',
              name: 'ACCESS BANK',
              nipCode: '000014',
            },
            accountName: 'JOHN DOE ENTERPRISES',
            accountNumber: '0123456789',
          },
        },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.verifyAccount('000014', '0123456789');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sandbox.getanchor.co/api/v1/payments/verify-account/000014/0123456789',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-anchor-key': 'test-anchor-api-key',
          }),
        }),
      );
      expect(result).toEqual({
        accountNumber: '0123456789',
        accountName: 'JOHN DOE ENTERPRISES',
        bankCode: '000014',
        bankName: 'ACCESS BANK',
      });
    });

    it('should throw NotFoundException when account does not exist (404)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Account not found'),
      });

      await expect(
        client.verifyAccount('000014', '0000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when invalid account is provided (400)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid NUBAN'),
      });

      await expect(client.verifyAccount('000014', '123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create deposit account on Anchor via POST /api/v1/accounts', async () => {
      const mockResponse = {
        data: {
          id: 'acc_anchor_999',
          type: 'DepositAccount',
          attributes: {
            accountName: 'StackHR - Udubonchi Tech',
            accountNumber: '9912345678',
            bank: {
              id: 'anc_bk_providus',
              name: 'PROVIDUS BANK',
              nipCode: '000023',
            },
            currency: 'NGN',
            status: 'ACTIVE',
            balance: {
              availableBalance: 25000000,
              ledgerBalance: 25000000,
              currency: 'NGN',
            },
          },
        },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.createDepositAccount('Udubonchi Tech');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sandbox.getanchor.co/api/v1/accounts',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-anchor-key': 'test-anchor-api-key',
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(result).toEqual({
        anchorAccountId: 'acc_anchor_999',
        accountNumber: '9912345678',
        accountName: 'StackHR - Udubonchi Tech',
        bankName: 'PROVIDUS BANK',
        nipCode: '000023',
        currency: 'NGN',
        balanceKobo: 25000000,
      });
    });

    it('should query live account balance via GET /api/v1/accounts/:id/balance', async () => {
      const mockResponse = {
        data: {
          id: 'acc_anchor_999',
          type: 'AccountBalance',
          attributes: {
            availableBalance: 500000000,
            ledgerBalance: 500000000,
            currency: 'NGN',
          },
        },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const balance = await client.getAccountBalance('acc_anchor_999');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sandbox.getanchor.co/api/v1/accounts/acc_anchor_999/balance',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-anchor-key': 'test-anchor-api-key',
          }),
        }),
      );
      expect(balance).toEqual({
        availableBalanceKobo: 500000000,
        ledgerBalanceKobo: 500000000,
        currency: 'NGN',
      });
    });

    it('should submit bulk transfer via POST /api/v1/transfers/bulk', async () => {
      const mockResponse = {
        data: {
          id: 'blk_anc_123',
          type: 'BulkTransfer',
          attributes: {
            status: 'PROCESSING',
            reference: 'blk_ref_123',
          },
        },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const params = {
        sourceAccountId: 'acc_anchor_999',
        transfers: [
          {
            amountKobo: 25000000,
            reference: 'pyr_run1_emp1_1',
            destination: {
              accountNumber: '0123456789',
              bankCode: '000014',
              accountName: 'John Doe',
            },
          },
        ],
      };

      const result = await client.initiateBulkTransfer(params);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sandbox.getanchor.co/api/v1/transfers/bulk',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-anchor-key': 'test-anchor-api-key',
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(result).toEqual({
        id: 'blk_anc_123',
        reference: 'blk_ref_123',
        status: 'PROCESSING',
        transfersCount: 1,
        totalAmountKobo: 25000000,
      });
    });

    it('should call transfers endpoint and return transfer details in live mode', async () => {
      const mockResponse = {
        data: {
          id: 'trf_anc_456',
          type: 'Transfer',
          attributes: {
            status: 'PROCESSING',
            reference: 'adv_advance1_1',
            amount: 5000000,
            currency: 'NGN',
            fee: 1075,
          },
        },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const params = {
        sourceAccountId: 'acc_anchor_999',
        amountKobo: 5000000,
        reference: 'adv_advance1_1',
        destination: {
          accountNumber: '0123456789',
          bankCode: '000014',
          accountName: 'Jane Doe',
        },
        reason: 'Salary Advance Payout',
      };

      const result = await client.initiateSingleTransfer(params);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sandbox.getanchor.co/api/v1/transfers',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-anchor-key': 'test-anchor-api-key',
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(result).toEqual({
        id: 'trf_anc_456',
        reference: 'adv_advance1_1',
        status: 'PROCESSING',
        amountKobo: 5000000,
        currency: 'NGN',
        feeKobo: 1075,
      });
    });
  });

  describe('Single Transfer in Mock Mode', () => {
    it('should return simulated single transfer response without calling upstream', async () => {
      delete process.env.ANCHOR_API_KEY;
      const mockClient = new AnchorClient();
      global.fetch = jest.fn();

      const result = await mockClient.initiateSingleTransfer({
        sourceAccountId: 'mock-source-acc',
        amountKobo: 1500000,
        reference: 'rem_claim123_1',
        destination: {
          accountNumber: '0123456789',
          bankCode: '000014',
          accountName: 'Mock Employee',
        },
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.status).toBe('SUCCESSFUL');
      expect(result.amountKobo).toBe(1500000);
      expect(result.reference).toBe('rem_claim123_1');
      expect(result.id).toMatch(/^trf_mock_/);
    });
  });

  describe('Corporate Cards', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.ANCHOR_API_KEY = 'test-anchor-api-key';
      process.env.ANCHOR_BASE_URL = 'https://api.sandbox.getanchor.co';
      client = new AnchorClient();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should issue virtual card via POST /api/v1/cards in live mode', async () => {
      const mockResponse = {
        data: {
          id: 'crd_live_123',
          type: 'Card',
          attributes: {
            cardName: 'Jane Doe',
            maskedPan: '5399 **** **** 4321',
            expiryMonth: '10',
            expiryYear: '28',
            brand: 'MASTERCARD',
            currency: 'NGN',
            status: 'ACTIVE',
            spendingLimit: { amount: 50000000, interval: 'MONTHLY' },
            balance: { availableBalance: 50000000 },
          },
        },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.issueCard({
        cardholderName: 'Jane Doe',
        spendingLimitKobo: 50000000,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sandbox.getanchor.co/api/v1/cards',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.id).toBe('crd_live_123');
      expect(result.maskedPan).toBe('5399 **** **** 4321');
    });

    it('should issue virtual card in mock mode without calling upstream', async () => {
      delete process.env.ANCHOR_API_KEY;
      const mockClient = new AnchorClient();
      global.fetch = jest.fn();

      const result = await mockClient.issueCard({
        cardholderName: 'Jane Doe',
        spendingLimitKobo: 50000000,
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.cardName).toBe('Jane Doe');
      expect(result.status).toBe('ACTIVE');
      expect(result.id).toMatch(/^crd_mock_/);
    });

    it('should freeze and unfreeze virtual card via Anchor API', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const freezeResult = await client.freezeCard('crd_123');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sandbox.getanchor.co/api/v1/cards/crd_123/freeze',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(freezeResult.status).toBe('FROZEN');

      const unfreezeResult = await client.unfreezeCard('crd_123');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sandbox.getanchor.co/api/v1/cards/crd_123/unfreeze',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(unfreezeResult.status).toBe('ACTIVE');
    });

    it('should update card spending limit via Anchor API', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const result = await client.updateCardLimit({
        cardId: 'crd_123',
        spendingLimitKobo: 75000000,
        spendingInterval: 'MONTHLY',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sandbox.getanchor.co/api/v1/cards/crd_123/spending-limit',
        expect.objectContaining({ method: 'PATCH' }),
      );
      expect(result.spendingLimitKobo).toBe(75000000);
    });
  });
});
