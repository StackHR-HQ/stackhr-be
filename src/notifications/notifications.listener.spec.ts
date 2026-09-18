import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsListener } from './notifications.listener';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from './email.service';
import { ApprovalDecidedEvent } from '../approvals/events/approval-decided.event';

describe('NotificationsListener', () => {
  let listener: NotificationsListener;
  let prismaMock: { user: { findUnique: jest.Mock } };
  let emailServiceMock: { send: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'requester@example.com',
          name: 'Jane Requester',
        }),
      },
    };

    emailServiceMock = {
      send: jest.fn().mockResolvedValue({ id: 'msg-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsListener,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: emailServiceMock },
      ],
    }).compile();

    listener = module.get<NotificationsListener>(NotificationsListener);
  });

  it('should send email notification when approval event is received', async () => {
    const event = new ApprovalDecidedEvent(
      'appr-123',
      'org-123',
      'LEAVE',
      'user-requester-1',
      'user-approver-1',
      'APPROVED',
    );

    await listener.handleApprovalDecided(event);

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-requester-1' },
      select: { email: true, name: true },
    });

    expect(emailServiceMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'requester@example.com',
        subject: expect.stringContaining('LEAVE request has been Approved'),
      }),
    );
  });

  it('should include rejection reason when approval request is rejected', async () => {
    const event = new ApprovalDecidedEvent(
      'appr-124',
      'org-123',
      'EXPENSE',
      'user-requester-1',
      'user-approver-1',
      'REJECTED',
      'Insufficient documentation',
    );

    await listener.handleApprovalDecided(event);

    expect(emailServiceMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'requester@example.com',
        subject: expect.stringContaining('EXPENSE request has been Rejected'),
        text: expect.stringContaining('Insufficient documentation'),
      }),
    );
  });
});
