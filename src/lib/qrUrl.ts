/**
 * Lightweight QR URL utilities without heavy external dependencies.
 * Zero-dependency for minimal bundle size on customer and admin pages.
 * Chữ ký bảo mật do backend cấp và xác thực tập trung, không lưu secret ở client.
 */

export async function computeCourtSig(_courtCode: string): Promise<string> {
  return '';
}

export function getSignedCourtUrl(courtCode: string, sig?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const signature = sig ? sig.trim() : '';
  return `${origin}/?court=${encodeURIComponent(courtCode)}${signature ? `&sig=${encodeURIComponent(signature)}` : ''}`;
}

export function parseCourtUrlParams(search: string): { court: string; sig: string } {
  const params = new URLSearchParams(search);
  return {
    court: params.get('court')?.trim() || '',
    sig: params.get('sig')?.trim() || ''
  };
}
