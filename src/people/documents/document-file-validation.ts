import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const SIGNATURES: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'application/msword': [0xd0, 0xcf, 0x11, 0xe0],
  // DOCX is a ZIP container.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    0x50, 0x4b, 0x03, 0x04,
  ],
};

export const MAX_DOCUMENT_BYTES = 10_000_000;

export function validateDocumentFile(file: UploadedDocumentFile): void {
  if (file.buffer.length > MAX_DOCUMENT_BYTES) {
    throw new PayloadTooLargeException('File must be 10 MB or smaller');
  }

  const signature = SIGNATURES[file.mimetype];
  const matches =
    signature !== undefined &&
    signature.every((byte, index) => file.buffer[index] === byte);
  if (!matches) {
    throw new UnsupportedMediaTypeException(
      'File must be a PDF, DOCX, JPG or PNG',
    );
  }
}
