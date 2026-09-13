import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { validateDocumentFile } from './document-file-validation';

describe('validateDocumentFile', () => {
  it('rejects a file whose bytes do not match its declared image type', () => {
    expect(() =>
      validateDocumentFile({
        originalname: 'passport.png',
        mimetype: 'image/png',
        size: 11,
        buffer: Buffer.from('hello world'),
      }),
    ).toThrow(UnsupportedMediaTypeException);
  });

  it('rejects a valid PDF larger than 10,000,000 bytes', () => {
    const buffer = Buffer.alloc(10_000_001);
    buffer.write('%PDF-1.7');

    expect(() =>
      validateDocumentFile({
        originalname: 'handbook.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      }),
    ).toThrow(PayloadTooLargeException);
  });
});
