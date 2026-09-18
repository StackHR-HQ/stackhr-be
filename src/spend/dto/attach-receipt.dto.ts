import { IsNotEmpty, IsUrl } from 'class-validator';

export class AttachReceiptDto {
  @IsUrl({}, { message: 'receiptUrl must be a valid URL string' })
  @IsNotEmpty({ message: 'receiptUrl is required' })
  receiptUrl!: string;
}
