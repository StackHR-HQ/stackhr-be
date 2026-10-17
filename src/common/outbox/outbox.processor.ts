import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxProcessor.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isShuttingDown = false;

  constructor(private readonly outboxService: OutboxService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') {
      return; // In tests, process manually to keep test assertions deterministic
    }
    this.logger.log(
      'Starting Transactional Outbox Background Processor (Interval: 3s)',
    );
    this.timer = setInterval(() => {
      void this.poll();
    }, 3000);
  }

  async poll() {
    if (this.isProcessing || this.isShuttingDown) {
      return;
    }
    this.isProcessing = true;
    try {
      await this.outboxService.processPending();
    } catch (err: any) {
      this.logger.error(
        `Error in outbox background polling: ${err.message}`,
        err.stack,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  onApplicationShutdown() {
    this.logger.log('Stopping Transactional Outbox Background Processor');
    this.isShuttingDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
