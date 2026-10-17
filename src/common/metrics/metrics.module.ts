import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { OutboxModule } from '../outbox/outbox.module';
import { ResilienceModule } from '../resilience/resilience.module';

@Global()
@Module({
  imports: [OutboxModule, ResilienceModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsInterceptor],
  exports: [MetricsService, MetricsInterceptor],
})
export class MetricsModule {}
