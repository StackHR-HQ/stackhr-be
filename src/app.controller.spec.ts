import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './database/prisma.service';
import { OutboxService } from './common/outbox/outbox.service';
import { ResilientHttpClient } from './common/resilience/resilient-client';

describe('AppController', () => {
  let appController: AppController;
  let prismaMock: any;
  let outboxMock: any;
  let resilientClientMock: any;

  beforeEach(async () => {
    prismaMock = {
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };
    outboxMock = {
      getDlqCount: jest.fn().mockResolvedValue(0),
    };
    resilientClientMock = {
      getAllCircuitStats: jest
        .fn()
        .mockReturnValue([
          { name: 'PenCentral', state: 'CLOSED', isAvailable: true },
        ]),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: outboxMock },
        { provide: ResilientHttpClient, useValue: resilientClientMock },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return healthy status when database is reachable', async () => {
      const health = await appController.getHealth();
      expect(health.status).toBe('ok');
      expect(health.database.status).toBe('up');
      expect(health.database.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(health.memory).toHaveProperty('heapUsedMb');
      expect(health.memory).toHaveProperty('heapTotalMb');
      expect(health.circuitBreakers).toHaveLength(1);
      expect(health.outboxDlq.depth).toBe(0);
    });

    it('should report degraded status when database probe fails', async () => {
      prismaMock.$queryRaw.mockRejectedValueOnce(
        new Error('Connection failed'),
      );
      const health = await appController.getHealth();
      expect(health.status).toBe('degraded');
      expect(health.database.status).toBe('down');
    });
  });
});
