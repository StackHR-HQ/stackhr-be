import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { DocumentStorage } from './document-storage';

/**
 * Private S3-compatible storage (AWS S3, Cloudflare R2, MinIO). Objects are
 * never made public; downloads must go through short-lived signed URLs.
 */
@Injectable()
export class S3DocumentStorage implements DocumentStorage {
  private client?: S3Client;

  async put(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.getClient().send(
      new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }),
    );
  }

  private bucket(): string {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new ServiceUnavailableException(
        'Document storage is not configured',
      );
    }
    return bucket;
  }

  private getClient(): S3Client {
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException(
        'Document storage is not configured',
      );
    }

    this.client ??= new S3Client({
      region: process.env.S3_REGION ?? 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }
}
