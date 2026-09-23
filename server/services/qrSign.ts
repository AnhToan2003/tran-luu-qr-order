import { createHmac, timingSafeEqual } from 'node:crypto';

const getSecret = () => {
  const secret = process.env.QR_SIGN_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('[Security] QR_SIGN_SECRET must be configured with at least 32 characters before QR signing is used.');
  }
  return secret;
};
const getLegacySecret = () => process.env.QR_SIGN_SECRET_LEGACY;

/**
 * Tạo chữ ký HMAC-SHA256 (128-bit truncated tag) bảo vệ mã sân trên link QR.
 * Verification keeps accepting the historical 48-bit tag during QR rotation,
 * but all newly generated QR codes use the stronger 32-hex-character tag.
 */
export function signCourtCode(courtCode: string): string {
  return createHmac('sha256', getSecret())
    .update(`court:${courtCode.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Xác thực chữ ký mã sân chống can thiệp URL.
 * Hỗ trợ xoay khóa bảo mật (Key Rotation) qua QR_SIGN_SECRET_LEGACY.
 */
export function verifyCourtSignature(courtCode: string, sig?: string | null): boolean {
  if (!sig || typeof sig !== 'string') return false;
  const cleanSig = sig.trim().toLowerCase();

  // 1. So khớp chữ ký với SECRET hiện hành (an toàn chống timing attacks)
  const currentFull = signCourtCode(courtCode).toLowerCase();
  const currentCandidates = [currentFull, currentFull.slice(0, 12)];
  if (currentCandidates.some(expected => cleanSig.length === expected.length && timingSafeEqual(Buffer.from(cleanSig), Buffer.from(expected)))) return true;

  // 2. Hỗ trợ đối chiếu khóa cũ (Legacy Key) cho các bảng QR đã in ép nhựa tại sân
  const legacy = getLegacySecret();
  if (legacy) {
    const legacyFull = createHmac('sha256', legacy)
      .update(`court:${courtCode.trim().toLowerCase()}`)
      .digest('hex')
      .toLowerCase();
    const legacyCandidates = [legacyFull.slice(0, 32), legacyFull.slice(0, 12)];
    if (legacyCandidates.some(expected => cleanSig.length === expected.length && timingSafeEqual(Buffer.from(cleanSig), Buffer.from(expected)))) return true;
  }

  return false;
}
