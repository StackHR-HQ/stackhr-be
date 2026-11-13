import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class AnchorWebhookDto {
  @IsString({ message: 'event must be a string' })
  @IsNotEmpty({ message: 'event is required' })
  event!: string;

  @IsObject({ message: 'data must be an object' })
  @IsNotEmpty({ message: 'data is required' })
  data!: {
    id: string;
    type: string;
    attributes: {
      amount?: number;
      fee?: number;
      currency?: string;
      reference?: string;
      status?: string;
      accountId?: string;
      accountNumber?: string;
      sender?: {
        accountName?: string;
        accountNumber?: string;
        bankName?: string;
      };
      createdAt?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
}
