import { NextRequest, NextResponse } from 'next/server';
import { createWalletPass } from '@/lib/wallet';

/**
 * GET endpoint for downloading wallet pass
 * Safari iOS works better with direct GET downloads
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Get data from query parameters
    const dataStr = searchParams.get('data');
    if (!dataStr) {
      return NextResponse.json(
        { error: 'Missing data parameter' },
        { status: 400 }
      );
    }

    // Decode and parse JSON
    const data = JSON.parse(decodeURIComponent(dataStr));
    const { name, email, phone, position, company, department, vcard } = data;

    if (!name || !vcard) {
      return NextResponse.json(
        { error: 'Missing required fields: name, vcard' },
        { status: 400 }
      );
    }

    // Create wallet pass
    const passBase64 = await createWalletPass({
      name,
      email,
      phone,
      position,
      company,
      department,
      vcard,
    });

    // Convert base64 to buffer
    const buffer = Buffer.from(passBase64, 'base64');
    const filename = `${name.replace(/[^a-z0-9]/gi, '_')}_wallet.pkpass`;

    // Return with headers optimized for Safari iOS
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  } catch (error: any) {
    console.error('Download wallet pass error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to download wallet pass',
      },
      { status: 500 }
    );
  }
}
