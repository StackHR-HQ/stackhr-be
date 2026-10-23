import { Test, TestingModule } from '@nestjs/testing';
import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('BankingController', () => {
  let controller: BankingController;
  let serviceMock: {
    getBanks: jest.Mock;
    verifyAccount: jest.Mock;
    getDepositAccount: jest.Mock;
    syncDepositAccountBalance: jest.Mock;
    issueCorporateCard: jest.Mock;
    getCorporateCards: jest.Mock;
    getCorporateCardDetails: jest.Mock;
    toggleCardFreeze: jest.Mock;
    updateCardSpendingLimit: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'admin@stackhr.app',
    name: 'Admin User',
    role: 'BUSINESS_OWNER',
    userType: 'BUSINESS',
    organizationId: 'org-1',
  };

  beforeEach(async () => {
    serviceMock = {
      getBanks: jest.fn(),
      verifyAccount: jest.fn(),
      getDepositAccount: jest.fn(),
      syncDepositAccountBalance: jest.fn(),
      issueCorporateCard: jest.fn(),
      getCorporateCards: jest.fn(),
      getCorporateCardDetails: jest.fn(),
      toggleCardFreeze: jest.fn(),
      updateCardSpendingLimit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BankingController],
      providers: [
        {
          provide: BankingService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BankingController>(BankingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate getBanks to BankingService', async () => {
    const mockBanks = [{ id: '1', name: 'ACCESS BANK', nipCode: '000014' }];
    serviceMock.getBanks.mockResolvedValue(mockBanks);

    const result = await controller.getBanks();
    expect(serviceMock.getBanks).toHaveBeenCalled();
    expect(result).toEqual({ banks: mockBanks });
  });

  it('should delegate verifyAccount to BankingService', async () => {
    const dto = { bankCode: '000014', accountNumber: '0123456789' };
    const mockAccount = {
      accountNumber: '0123456789',
      accountName: 'CHUKWUEMEKA TEST',
      bankCode: '000014',
      bankName: 'ACCESS BANK',
    };
    serviceMock.verifyAccount.mockResolvedValue(mockAccount);

    const result = await controller.verifyAccount(dto);
    expect(serviceMock.verifyAccount).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ account: mockAccount });
  });

  it('should delegate getDepositAccount to BankingService', async () => {
    const mockDepositAccount = {
      id: 'acc-1',
      organizationId: 'org-1',
      accountNumber: '9912345678',
      bankName: 'PROVIDUS BANK',
      balanceKobo: 50000000,
    };
    serviceMock.getDepositAccount.mockResolvedValue(mockDepositAccount);

    const result = await controller.getDepositAccount(mockUser);
    expect(serviceMock.getDepositAccount).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ depositAccount: mockDepositAccount });
  });

  it('should delegate syncDepositAccount to BankingService', async () => {
    const mockUpdatedAccount = {
      id: 'acc-1',
      organizationId: 'org-1',
      accountNumber: '9912345678',
      balanceKobo: 75000000,
    };
    serviceMock.syncDepositAccountBalance.mockResolvedValue(mockUpdatedAccount);

    const result = await controller.syncDepositAccount(mockUser);
    expect(serviceMock.syncDepositAccountBalance).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ depositAccount: mockUpdatedAccount });
  });

  it('should delegate issueCard to BankingService', async () => {
    const dto = { employeeId: 'emp-1', spendingLimitKobo: 10000000 };
    serviceMock.issueCorporateCard.mockResolvedValue({
      message: 'Corporate card issued successfully',
      card: { id: 'card-1' },
    });

    const result = await controller.issueCard(mockUser, dto);
    expect(serviceMock.issueCorporateCard).toHaveBeenCalledWith('org-1', dto);
    expect(result.card.id).toBe('card-1');
  });

  it('should delegate getCards to BankingService', async () => {
    serviceMock.getCorporateCards.mockResolvedValue({
      cards: [{ id: 'card-1' }],
    });

    const result = await controller.getCards(mockUser);
    expect(serviceMock.getCorporateCards).toHaveBeenCalledWith(
      'org-1',
      undefined,
    );
    expect(result.cards).toHaveLength(1);
  });

  it('should delegate getCardDetails to BankingService', async () => {
    serviceMock.getCorporateCardDetails.mockResolvedValue({
      card: { id: 'card-1' },
    });

    const result = await controller.getCardDetails(mockUser, 'card-1');
    expect(serviceMock.getCorporateCardDetails).toHaveBeenCalledWith(
      'org-1',
      'card-1',
    );
    expect(result.card.id).toBe('card-1');
  });

  it('should delegate toggleCardFreeze to BankingService', async () => {
    const dto = { action: 'FREEZE' as const };
    serviceMock.toggleCardFreeze.mockResolvedValue({
      card: { id: 'card-1', status: 'FROZEN' },
    });

    const result = await controller.toggleCardFreeze(mockUser, 'card-1', dto);
    expect(serviceMock.toggleCardFreeze).toHaveBeenCalledWith(
      'org-1',
      'card-1',
      dto,
    );
    expect(result.card.status).toBe('FROZEN');
  });

  it('should delegate updateCardLimit to BankingService', async () => {
    const dto = { spendingLimitKobo: 5000000 };
    serviceMock.updateCardSpendingLimit.mockResolvedValue({
      card: { id: 'card-1', spendingLimitKobo: 5000000 },
    });

    const result = await controller.updateCardLimit(mockUser, 'card-1', dto);
    expect(serviceMock.updateCardSpendingLimit).toHaveBeenCalledWith(
      'org-1',
      'card-1',
      dto,
    );
    expect(result.card.spendingLimitKobo).toBe(5000000);
  });
});
