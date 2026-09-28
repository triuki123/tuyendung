/**
 * WalletWallet API utilities for creating digital wallet passes
 */

export interface WalletPassData {
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  company?: string;
  department?: string;
  vcard: string;
  qrCodeUrl?: string;
}

/**
 * Create Apple Wallet / Google Wallet pass using WalletWallet API
 */
export async function createWalletPass(data: WalletPassData): Promise<string> {
  try {
    const apiKey = process.env.WALLET_WALLET_API_KEY;
    if (!apiKey) {
      throw new Error('WALLET_WALLET_API_KEY not configured');
    }

    const passData = {
      // Barcode with vCard data
      barcodeValue: data.vcard,
      barcodeFormat: 'QR',

      // Pass styling
      logoText: 'FADO GROUP',
      colorPreset: 'blue',

      // Primary field - Name
      primaryFields: [
        {
          label: data.name,
          value: data.position || 'Employee',
          textAlignment: 'PKTextAlignmentCenter',
        },
      ],

      // Header fields - Company and Department (only if non-empty)
      headerFields: [
        ...(data.company ? [{
          label: 'Company',
          value: data.company,
        }] : []),
        ...(data.department ? [{
          label: 'Department',
          value: data.department,
        }] : []),
      ],

      // Secondary fields - Contact info (only if non-empty)
      secondaryFields: [
        ...(data.email ? [{
          label: 'Email',
          value: data.email,
        }] : []),
        ...(data.phone ? [{
          label: 'Phone',
          value: data.phone,
        }] : []),
      ],

      // Back of pass (only include if contact info exists)
      backFields: (data.email || data.phone) ? [
        {
          label: 'Contact Information',
          value: [
            data.email && `Email: ${data.email}`,
            data.phone && `Phone: ${data.phone}`,
          ].filter(Boolean).join('\n'),
        },
      ] : [],

      // Pass validity
      expirationDays: 365,
    };

    // Call WalletWallet API
    const requestBody = JSON.stringify(passData);
    console.log('WalletWallet Request:', {
      url: 'https://api.walletwallet.dev/api/pkpass',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      bodySize: requestBody.length,
      passDataKeys: Object.keys(passData),
    });

    const response = await fetch('https://api.walletwallet.dev/api/pkpass', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('WalletWallet API error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`WalletWallet API error: ${response.statusText} - ${errorText}`);
    }

    // Get the pass file and convert to base64
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return base64;
  } catch (error) {
    console.error('Error creating wallet pass:', error);
    throw error;
  }
}

/**
 * Get pass download link from response header
 */
export function getPassLink(response: Response): string | null {
  const contentDisposition = response.headers.get('content-disposition');
  if (!contentDisposition) return null;

  const match = contentDisposition.match(/filename="(.+?)"/);
  return match ? match[1] : null;
}
