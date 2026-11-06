import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { OutboxModule } from '../outbox/outbox.module';
import { ResilienceModule } from '../resilience/resilience.module';
import { AuthModule } from '../../auth/auth.module';

@Global()
@Module({
  imports: [OutboxModule, ResilienceModule, AuthModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsInterceptor],
  exports: [MetricsService, MetricsInterceptor],
})
export class MetricsModule {}
