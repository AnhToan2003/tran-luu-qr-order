/**
 * Helper che giấu thông tin xác thực nhạy cảm (Username / Password) trong URI kết nối
 * Áp dụng cho MongoDB URI, Redis URL, HTTP URLs... chống rò rỉ log trên VPS và CI/CD.
 */
export function maskUriCredentials(uri?: string | null): string {
  if (!uri || typeof uri !== 'string') return '';
  return uri
    // Mask mongodb://user:password@host hoặc mongodb+srv://user:password@host
    .replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1***$3')
    // Mask redis://:password@host hoặc redis://user:password@host
    .replace(/(redis(?:\+s)?:\/\/(?:[^:]*:)?)([^@]+)(@)/gi, '$1***$3')
    // Mask generic http(s)://user:password@host
    .replace(/(https?:\/\/[^:]+:)([^@]+)(@)/gi, '$1***$3');
}
