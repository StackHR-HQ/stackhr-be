import { Global, Module } from '@nestjs/common';
import { ResilientHttpClient } from './resilient-client';

@Global()
@Module({
  providers: [ResilientHttpClient],
  exports: [ResilientHttpClient],
})
export class ResilienceModule {}
