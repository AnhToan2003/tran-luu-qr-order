import { createHmac, timingSafeEqual } from 'node:crypto';

const getSecret = () => process.env.QR_SIGN_SECRET || 'tran-luu-court-qr-hmac-secret-v2';
const getLegacySecret = () => process.env.QR_SIGN_SECRET_LEGACY;

/**
 * Tạo chữ ký HMAC-SHA256 (12 ký tự) bảo vệ mã sân trên link QR
 */
export function signCourtCode(courtCode: string): string {
  return createHmac('sha256', getSecret())
    .update(`court:${courtCode.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Xác thực chữ ký mã sân chống can thiệp URL.
 * Hỗ trợ xoay khóa bảo mật (Key Rotation) qua QR_SIGN_SECRET_LEGACY.
 */
export function verifyCourtSignature(courtCode: string, sig?: string | null): boolean {
  if (!sig || typeof sig !== 'string') return false;
  const cleanSig = sig.trim().toLowerCase();

  // 1. So khớp chữ ký với SECRET hiện hành (an toàn chống timing attacks)
  const expected = signCourtCode(courtCode).toLowerCase();
  if (cleanSig.length === expected.length && timingSafeEqual(Buffer.from(cleanSig), Buffer.from(expected))) {
    return true;
  }

  // 2. Hỗ trợ đối chiếu khóa cũ (Legacy Key) cho các bảng QR đã in ép nhựa tại sân
  const legacy = getLegacySecret();
  if (legacy) {
    const legacyExpected = createHmac('sha256', legacy)
      .update(`court:${courtCode.trim().toLowerCase()}`)
      .digest('hex')
      .slice(0, 12)
      .toLowerCase();
    if (cleanSig.length === legacyExpected.length && timingSafeEqual(Buffer.from(cleanSig), Buffer.from(legacyExpected))) {
      return true;
    }
  }

  return false;
}
