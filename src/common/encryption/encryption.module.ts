import { Module } from '@nestjs/common';
import { EnvKeyProvider } from './env-key-provider';
import {
  FieldEncryptionService,
  KEY_PROVIDER,
} from './field-encryption.service';

@Module({
  providers: [
    {
      provide: KEY_PROVIDER,
      useClass: EnvKeyProvider,
    },
    FieldEncryptionService,
  ],
  exports: [KEY_PROVIDER, FieldEncryptionService],
})
export class EncryptionModule {}
