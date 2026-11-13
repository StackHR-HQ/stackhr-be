import { IsOptional, IsUrl } from 'class-validator';

export class AttachReceiptDto {
  @IsOptional()
  @IsUrl({}, { message: 'receiptUrl must be a valid URL string' })
  receiptUrl?: string;
}
