import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BankingService } from '../banking.service';
import { AnchorWebhookGuard } from './anchor-webhook.guard';
import { AnchorWebhookDto } from '../dto/anchor-webhook.dto';

@Controller(['', 'banking/webhook', 'v1/api/banking/webhook'])
export class AnchorWebhookController {
  constructor(private readonly bankingService: BankingService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AnchorWebhookGuard)
  async handleWebhook(@Body() payload: AnchorWebhookDto) {
    return this.bankingService.handleWebhookEvent(payload);
  }
}
