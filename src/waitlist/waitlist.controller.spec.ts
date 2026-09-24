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
  };

  const mockEmailService = {
    send: jest.fn().mockResolvedValue({ id: 'msg_123' }),
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
});
