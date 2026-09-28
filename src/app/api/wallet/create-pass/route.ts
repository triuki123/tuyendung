import { NextRequest, NextResponse } from 'next/server';
import { createWalletPass } from '@/lib/wallet';

export async function POST(request: NextRequest) {
  try {
    // Handle both JSON and form-encoded data (for HTML form submission)
    const contentType = request.headers.get('content-type') || '';
    let body: any;

    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      // Parse form data from HTML form submission
      const formData = await request.formData();
      const dataString = formData.get('data');
      body = dataString ? JSON.parse(dataString as string) : {};
    } else {
      // Try JSON first, fallback to text
      try {
        body = await request.json();
      } catch {
        const text = await request.text();
        body = text ? JSON.parse(text) : {};
      }
    }

    const { name, email, phone, position, company, department, vcard } = body;

    if (!name || !vcard) {
      return NextResponse.json(
        { error: 'Missing required fields: name, vcard' },
        { status: 400 }
      );
    }

    // Call WalletWallet API and get base64
    const passBase64 = await createWalletPass({
      name,
      email,
      phone,
      position,
      company,
      department,
      vcard,
    });

    // Convert base64 directly to buffer
    const buffer = Buffer.from(passBase64, 'base64');

    // Return .pkpass file with proper headers
    // Safari iOS needs specific handling for wallet passes
    const filename = `${name.replace(/[^a-z0-9]/gi, '_')}_wallet.pkpass`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('Create wallet pass error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to create wallet pass',
        message: 'Make sure WALLET_WALLET_API_KEY is configured in environment variables',
      },
      { status: 500 }
    );
  }
}
