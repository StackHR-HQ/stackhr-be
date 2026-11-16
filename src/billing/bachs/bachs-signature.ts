import * as crypto from 'crypto';

/** Deliveries further than this from "now" are rejected as replays. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface BachsSignatureInput {
  /** Value of the `X-Bachs-Signature-V2` header: `t=<unix>,v1=<hex>[,v1=<hex>…]`. */
  header: string | undefined;
  rawBody: string | Buffer;
  secret: string;
  now: Date;
}

/**
 * Verifies a Bachs webhook delivery: HMAC-SHA256 hex of `{t}.{rawBody}`.
 * Several `v1` values may be present during secret rotation; any match passes.
 */
export function verifyBachsSignature(input: BachsSignatureInput): boolean {
  if (!input.header) return false;

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of input.header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't') timestamp = value;
    if (key === 'v1' && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const sentAt = Number(timestamp);
  if (
    !Number.isFinite(sentAt) ||
    Math.abs(input.now.getTime() / 1000 - sentAt) > SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const body = Buffer.isBuffer(input.rawBody)
    ? input.rawBody.toString('utf8')
    : input.rawBody;
  const expected = crypto
    .createHmac('sha256', input.secret)
    .update(`${timestamp}.${body}`)
    .digest();

  return signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex');
    return (
      given.length === expected.length &&
      crypto.timingSafeEqual(given, expected)
    );
  });
}
