import {
  AnchorBankResource,
  AnchorVerifyAccountResponse,
} from './anchor.types';

export const MOCK_NIGERIAN_BANKS: AnchorBankResource[] = [
  {
    id: 'anc_bk_access',
    type: 'Bank',
    attributes: {
      nipCode: '000014',
      name: 'ACCESS BANK',
      cbnCode: '044',
    },
  },
  {
    id: 'anc_bk_gtb',
    type: 'Bank',
    attributes: {
      nipCode: '000013',
      name: 'GUARANTY TRUST BANK',
      cbnCode: '058',
    },
  },
  {
    id: 'anc_bk_zenith',
    type: 'Bank',
    attributes: {
      nipCode: '000015',
      name: 'ZENITH BANK',
      cbnCode: '057',
    },
  },
  {
    id: 'anc_bk_firstbank',
    type: 'Bank',
    attributes: {
      nipCode: '000016',
      name: 'FIRST BANK OF NIGERIA',
      cbnCode: '011',
    },
  },
  {
    id: 'anc_bk_uba',
    type: 'Bank',
    attributes: {
      nipCode: '000004',
      name: 'UNITED BANK FOR AFRICA',
      cbnCode: '033',
    },
  },
  {
    id: 'anc_bk_providus',
    type: 'Bank',
    attributes: {
      nipCode: '000023',
      name: 'PROVIDUS BANK',
      cbnCode: '101',
    },
  },
  {
    id: 'anc_bk_kuda',
    type: 'Bank',
    attributes: {
      nipCode: '090267',
      name: 'KUDA MICROFINANCE BANK',
      cbnCode: '090267',
    },
  },
  {
    id: 'anc_bk_opay',
    type: 'Bank',
    attributes: {
      nipCode: '090405',
      name: 'OPAY DIGITAL SERVICES LIMITED',
      cbnCode: '090405',
    },
  },
  {
    id: 'anc_bk_palmpay',
    type: 'Bank',
    attributes: {
      nipCode: '090336',
      name: 'PALMPAY',
      cbnCode: '090336',
    },
  },
  {
    id: 'anc_bk_moniepoint',
    type: 'Bank',
    attributes: {
      nipCode: '090392',
      name: 'MONIEPOINT MICROFINANCE BANK',
      cbnCode: '090392',
    },
  },
];

export function createMockVerifyAccountResponse(
  bankCode: string,
  accountNumber: string,
): AnchorVerifyAccountResponse {
  const bank = MOCK_NIGERIAN_BANKS.find(
    (b) =>
      b.attributes.nipCode === bankCode || b.attributes.cbnCode === bankCode,
  );

  return {
    data: {
      id: '0',
      type: 'AccountDetail',
      attributes: {
        bank: {
          id: bank?.id ?? 'anc_bk_mock',
          name: bank?.attributes.name ?? 'COMMERCIAL BANK',
          nipCode: bankCode,
        },
        accountName: 'CHUKWUEMEKA TEST ACCOUNT',
        accountNumber,
      },
    },
  };
}

export function createMockDepositAccountResponse(accountName: string) {
  const pseudoRandomNum = Math.floor(10000000 + Math.random() * 90000000);
  return {
    data: {
      id: `acc_mock_${pseudoRandomNum}`,
      type: 'DepositAccount' as const,
      attributes: {
        accountName: `StackHR - ${accountName}`,
        accountNumber: `99${pseudoRandomNum}`,
        bank: {
          id: 'anc_bk_providus',
          name: 'PROVIDUS BANK',
          nipCode: '000023',
        },
        currency: 'NGN',
        status: 'ACTIVE',
        balance: {
          availableBalance: 1500000000, // 15,000,000 NGN in kobo
          ledgerBalance: 1500000000,
          currency: 'NGN',
        },
      },
    },
  };
}

export function createMockBalanceResponse(
  accountId: string,
  availableKobo = 1500000000,
) {
  return {
    data: {
      id: accountId,
      type: 'AccountBalance' as const,
      attributes: {
        availableBalance: availableKobo,
        ledgerBalance: availableKobo,
        currency: 'NGN',
      },
    },
  };
}

export function createMockBulkTransferResponse(
  transfersCount: number,
  totalAmountKobo: number,
) {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return {
    data: {
      id: `blk_mock_${randomSuffix}`,
      type: 'BulkTransfer' as const,
      attributes: {
        status: 'PROCESSING' as const,
        reference: `blk_ref_${randomSuffix}`,
        transfersCount,
        totalAmount: totalAmountKobo,
        currency: 'NGN',
      },
    },
  };
}

export function createMockSingleTransferResponse(
  amountKobo: number,
  reference: string,
) {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return {
    data: {
      id: `trf_mock_${randomSuffix}`,
      type: 'Transfer' as const,
      attributes: {
        status: 'SUCCESSFUL' as const,
        reference,
        amount: amountKobo,
        currency: 'NGN',
        fee: 1075,
      },
    },
  };
}

export function createMockCardResponse(
  cardholderName: string,
  spendingLimitKobo = 50000000,
  spendingInterval = 'MONTHLY',
) {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const cardIdSuffix = Math.floor(100000 + Math.random() * 900000);
  return {
    data: {
      id: `crd_mock_${cardIdSuffix}`,
      type: 'Card' as const,
      attributes: {
        cardName: cardholderName,
        maskedPan: `5399 **** **** ${randomSuffix}`,
        expiryMonth: '12',
        expiryYear: '28',
        brand: 'MASTERCARD',
        currency: 'NGN',
        status: 'ACTIVE' as const,
        spendingLimit: {
          amount: spendingLimitKobo,
          interval: spendingInterval,
        },
        balance: {
          availableBalance: spendingLimitKobo,
          currency: 'NGN',
        },
      },
    },
  };
}
