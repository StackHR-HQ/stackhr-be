import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private readonly prisma: PrismaService) {}

  async joinWaitlist(dto: JoinWaitlistDto) {
    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { businessEmail: dto.businessEmail },
    });

    if (existing) {
      this.logger.log(
        `Duplicate waitlist entry submission for: ${dto.businessEmail}`,
      );
      // Return existing entry gracefully to provide idempotent response
      return {
        id: existing.id,
        name: existing.name,
        position: existing.position,
        businessName: existing.businessName,
        businessEmail: existing.businessEmail,
        alreadyJoined: true,
        createdAt: existing.createdAt,
      };
    }

    const entry = await this.prisma.waitlistEntry.create({
      data: {
        name: dto.name,
        position: dto.position,
        businessName: dto.businessName,
        businessEmail: dto.businessEmail,
      },
    });

    this.logger.log(
      `New waitlist entry created: ${entry.id} (${dto.businessEmail})`,
    );

    return {
      id: entry.id,
      name: entry.name,
      position: entry.position,
      businessName: entry.businessName,
      businessEmail: entry.businessEmail,
      alreadyJoined: false,
      createdAt: entry.createdAt,
    };
  }

  async getWaitlistEntries() {
    return this.prisma.waitlistEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
