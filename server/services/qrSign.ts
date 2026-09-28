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
const signingPayload = (courtCode: string, version: number) =>
  `court:${courtCode.trim().toLowerCase()}${version > 0 ? `:v:${version}` : ''}`;

export function signCourtCode(courtCode: string, version = 0): string {
  const safeVersion = Number.isSafeInteger(version) && version >= 0 ? version : 0;
  const tag = createHmac('sha256', getSecret())
    .update(signingPayload(courtCode, safeVersion))
    .digest('hex')
    .slice(0, 32);
  return safeVersion > 0 ? `v${safeVersion}.${tag}` : tag;
}

/**
 * Xác thực chữ ký mã sân chống can thiệp URL.
 * Hỗ trợ xoay khóa bảo mật (Key Rotation) qua QR_SIGN_SECRET_LEGACY.
 */
export function verifyCourtSignature(courtCode: string, sig?: string | null, expectedVersion = 0): boolean {
  if (!sig || typeof sig !== 'string') return false;
  const cleanSig = sig.trim().toLowerCase();
  const safeVersion = Number.isSafeInteger(expectedVersion) && expectedVersion >= 0 ? expectedVersion : 0;
  const versioned = /^v(\d+)\.([a-f0-9]{32})$/.exec(cleanSig);
  if ((safeVersion > 0 && (!versioned || Number(versioned[1]) !== safeVersion)) || (safeVersion === 0 && versioned)) return false;
  const suppliedTag = versioned?.[2] ?? cleanSig;

  // 1. So khớp chữ ký với SECRET hiện hành (an toàn chống timing attacks)
  const currentSigned = signCourtCode(courtCode, safeVersion).toLowerCase();
  const currentFull = currentSigned.includes('.') ? currentSigned.split('.')[1] : currentSigned;
  const allowLegacyTags = process.env.QR_ALLOW_LEGACY_TAGS === 'true';
  const currentCandidates = allowLegacyTags && safeVersion === 0 ? [currentFull, currentFull.slice(0, 12)] : [currentFull];
  if (currentCandidates.some(expected => suppliedTag.length === expected.length && timingSafeEqual(Buffer.from(suppliedTag), Buffer.from(expected)))) return true;

  // 2. Hỗ trợ đối chiếu khóa cũ (Legacy Key) cho các bảng QR đã in ép nhựa tại sân
  const legacy = getLegacySecret();
  if (legacy) {
    const legacyFull = createHmac('sha256', legacy)
      .update(signingPayload(courtCode, safeVersion))
      .digest('hex')
      .toLowerCase();
    const legacyCandidates = allowLegacyTags && safeVersion === 0
      ? [legacyFull.slice(0, 32), legacyFull.slice(0, 12)]
      : [legacyFull.slice(0, 32)];
    if (legacyCandidates.some(expected => suppliedTag.length === expected.length && timingSafeEqual(Buffer.from(suppliedTag), Buffer.from(expected)))) return true;
  }

  return false;
}
