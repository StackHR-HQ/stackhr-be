import { verifyBachsSignature } from './bachs-signature';

// Fixtures computed independently with:
//   printf '%s' "1763290000.$BODY" | openssl dgst -sha256 -hmac "$SECRET"
const BODY =
  '{"id":"evt_123","type":"collection.succeeded","data":{"amount":"10000.00"}}';
const TIMESTAMP = 1763290000;
const SECRET = 'whsec_test_secret';
const SIG_CURRENT =
  '8763da4f9efa953aa8bf12f5286d9a09f744d05af37cd3921a74986d7e3e7156';
const SIG_OLD_SECRET =
  'fc12938262a40360a6468d8aeb1c3f7fc1fb32b5dacc68926f470e183e37ba87';
const NOW = new Date(TIMESTAMP * 1000);

describe('verifyBachsSignature', () => {
  it('accepts a correctly signed X-Bachs-Signature-V2 header', () => {
    const ok = verifyBachsSignature({
      header: `t=${TIMESTAMP},v1=${SIG_CURRENT}`,
      rawBody: BODY,
      secret: SECRET,
      now: NOW,
    });

    expect(ok).toBe(true);
  });

  it('rejects a validly signed delivery older than 300 seconds (replay)', () => {
    const ok = verifyBachsSignature({
      header: `t=${TIMESTAMP},v1=${SIG_CURRENT}`,
      rawBody: BODY,
      secret: SECRET,
      now: new Date((TIMESTAMP + 301) * 1000),
    });

    expect(ok).toBe(false);
  });

  it('accepts any matching v1 value during secret rotation', () => {
    const ok = verifyBachsSignature({
      header: `t=${TIMESTAMP},v1=${SIG_OLD_SECRET},v1=${SIG_CURRENT}`,
      rawBody: BODY,
      secret: SECRET,
      now: NOW,
    });

    expect(ok).toBe(true);
  });

  it.each([
    ['a tampered body', { rawBody: BODY.replace('10000.00', '1.00') }],
    ['the wrong secret', { secret: 'whsec_other' }],
    ['a missing header', { header: undefined }],
    ['a malformed header', { header: 'garbage' }],
  ])('rejects %s', (_label, override) => {
    const ok = verifyBachsSignature({
      header: `t=${TIMESTAMP},v1=${SIG_CURRENT}`,
      rawBody: BODY,
      secret: SECRET,
      now: NOW,
      ...override,
    });

    expect(ok).toBe(false);
  });
});
