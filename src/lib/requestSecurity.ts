import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

function safeEqual(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

/**
 * Bắt buộc secret phải được cấu hình và Authorization bearer phải khớp.
 * Thiếu cấu hình trả 503 thay vì vô tình mở endpoint.
 */
export function requireBearerSecret(
  request: NextRequest,
  secret: string | undefined
): NextResponse | null {
  if (!secret) {
    return NextResponse.json(
      { error: 'Endpoint chưa được cấu hình bảo mật' },
      { status: 503 }
    );
  }
  if (!safeEqual(request.headers.get('authorization'), `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/** Bắt buộc một shared-secret header phải được cấu hình và khớp. */
export function requireHeaderSecret(
  request: NextRequest,
  headerName: string,
  secret: string | undefined
): NextResponse | null {
  if (!secret) {
    return NextResponse.json(
      { error: 'Webhook chưa được cấu hình bảo mật' },
      { status: 503 }
    );
  }
  if (!safeEqual(request.headers.get(headerName), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return null;
}
