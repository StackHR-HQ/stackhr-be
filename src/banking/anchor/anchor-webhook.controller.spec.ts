import { Test, TestingModule } from '@nestjs/testing';
import { AnchorWebhookController } from './anchor-webhook.controller';
import { BankingService } from '../banking.service';
import { AnchorWebhookGuard } from './anchor-webhook.guard';

describe('AnchorWebhookController', () => {
  let controller: AnchorWebhookController;
  let serviceMock: {
    handleWebhookEvent: jest.Mock;
  };

  beforeEach(async () => {
    serviceMock = {
      handleWebhookEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnchorWebhookController],
      providers: [
        {
          provide: BankingService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideGuard(AnchorWebhookGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AnchorWebhookController>(AnchorWebhookController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should forward webhook payload to BankingService.handleWebhookEvent', async () => {
    const payload = {
      event: 'deposit.successful',
      data: {
        id: 'txn_123',
        type: 'Transaction',
        attributes: {
          amount: 1000000,
          currency: 'NGN',
          reference: 'dep_ref_123',
          status: 'SUCCESSFUL',
          accountId: 'acc_123',
        },
      },
    };
    serviceMock.handleWebhookEvent.mockResolvedValue({
      received: true,
      event: 'deposit.successful',
      organizationId: 'org-1',
      newBalanceKobo: 1000000,
    });

    const result = await controller.handleWebhook(payload);

    expect(serviceMock.handleWebhookEvent).toHaveBeenCalledWith(payload);
    expect(result).toEqual({
      received: true,
      event: 'deposit.successful',
      organizationId: 'org-1',
      newBalanceKobo: 1000000,
    });
  });
});
