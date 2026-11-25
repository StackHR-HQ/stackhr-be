import { Test, TestingModule } from '@nestjs/testing';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../notifications/email.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('WaitlistController', () => {
  let controller: WaitlistController;

  const mockPrismaService = {
    waitlistEntry: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockEmailService = {
    send: jest.fn().mockResolvedValue({ id: 'msg_123' }),
    subscribeToList: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WaitlistController],
      providers: [
        WaitlistService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WaitlistController>(WaitlistController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a waitlist entry successfully', async () => {
    mockPrismaService.waitlistEntry.findUnique.mockResolvedValue(null);
    mockPrismaService.waitlistEntry.create.mockResolvedValue({
      id: 'w_123',
      name: 'John Doe',
      position: 'HR Manager',
      businessName: 'Acme Corp',
      businessEmail: 'john@acme.com',
      createdAt: new Date(),
    });

    const result = await controller.joinWaitlist({
      name: 'John Doe',
      position: 'HR Manager',
      businessName: 'Acme Corp',
      businessEmail: 'john@acme.com',
    });

    expect(result).toBeDefined();
    expect(result.businessEmail).toBe('john@acme.com');
    expect(result.alreadyJoined).toBe(false);
  });

  it('should return existing entry if duplicate email is submitted', async () => {
    const mockExisting = {
      id: 'w_123',
      name: 'John Doe',
      position: 'HR Manager',
      businessName: 'Acme Corp',
      businessEmail: 'john@acme.com',
      createdAt: new Date(),
    };
    mockPrismaService.waitlistEntry.findUnique.mockResolvedValue(mockExisting);

    const result = await controller.joinWaitlist({
      name: 'John Doe',
      position: 'HR Manager',
      businessName: 'Acme Corp',
      businessEmail: 'john@acme.com',
    });

    expect(result).toBeDefined();
    expect(result.alreadyJoined).toBe(true);
    expect(mockPrismaService.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it('should filter out already signed-up businesses in getPendingWaitlistEntries', async () => {
    mockPrismaService.waitlistEntry.findMany.mockResolvedValue([
      {
        id: 'w-1',
        name: 'Ada',
        businessName: 'Signed Up Co',
        businessEmail: 'Ada@SignedUp.com',
      },
      {
        id: 'w-2',
        name: 'Bola',
        businessName: 'Pending Co',
        businessEmail: 'bola@pending.com',
      },
    ]);
    mockPrismaService.user.findMany.mockResolvedValue([
      { email: 'ada@signedup.com' },
    ]);

    const pending = await controller.getPendingWaitlistEntries();

    expect(pending).toHaveLength(1);
    expect(pending[0].businessEmail).toBe('bola@pending.com');
  });

  it('should support dryRun and live send in sendLaunchEmails', async () => {
    mockPrismaService.waitlistEntry.findMany.mockResolvedValue([
      {
        id: 'w-2',
        name: 'Bola Ade',
        businessName: 'Pending Co',
        businessEmail: 'bola@pending.com',
      },
    ]);
    mockPrismaService.user.findMany.mockResolvedValue([]);

    const preview = await controller.sendLaunchEmails({ dryRun: true });
    expect(preview.dryRun).toBe(true);
    expect(preview.totalPending).toBe(1);
    expect(preview.sentCount).toBe(0);
    expect(mockEmailService.send).not.toHaveBeenCalled();

    const sent = await controller.sendLaunchEmails({});
    expect(sent.dryRun).toBe(false);
    expect(sent.sentCount).toBe(1);
    expect(sent.failedCount).toBe(0);
    expect(mockEmailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bola@pending.com',
        idempotencyKey: 'waitlist-launch-w-2',
      }),
    );
  });
});
