import { Module } from '@nestjs/common';
import { PensionController } from './pension.controller';
import { PensionService } from './pension.service';
import { PenCentralClient } from './pencentral.client';

@Module({
  controllers: [PensionController],
  providers: [PensionService, PenCentralClient],
  exports: [PensionService, PenCentralClient],
})
export class PensionModule {}
