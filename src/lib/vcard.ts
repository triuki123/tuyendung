/**
 * vCard utilities for generating vCard format contact data
 * vCard 3.0 format - compatible with all devices (iOS, Android, etc.)
 */

export interface VCardData {
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  company?: string;
  department?: string;
}

/**
 * Generate vCard format string from contact data
 * Follows vCard 3.0 RFC 2426 specification
 * Minimal, clean format optimized for QR code scanning
 */
export function generateVCard(data: VCardData): string {
  const lines: string[] = [];

  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');

  // Full Name (required)
  lines.push(`FN:${data.name}`);

  // Structured Name: LastName;FirstName;MiddleName;Prefix;Suffix
  // For Vietnamese names, we split intelligently
  const nameParts = data.name.trim().split(/\s+/);
  const lastName = nameParts.length > 0 ? nameParts[nameParts.length - 1] : data.name;
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';
  lines.push(`N:${lastName};${firstName};;;`);

  // Email (simplified, no TYPE parameter for better compatibility)
  if (data.email?.trim()) {
    lines.push(`EMAIL:${data.email.trim()}`);
  }

  // Phone (simplified)
  if (data.phone?.trim()) {
    lines.push(`TEL:${data.phone.trim()}`);
  }

  // Organization
  if (data.company?.trim()) {
    lines.push(`ORG:${data.company.trim()}`);
  }

  // Title (Position)
  if (data.position?.trim()) {
    lines.push(`TITLE:${data.position.trim()}`);
  }

  // NOTE: Department stored as NOTE field for better compatibility
  // Some systems don't support custom ROLE field properly
  if (data.department?.trim()) {
    lines.push(`NOTE:Dept: ${data.department.trim()}`);
  }

  lines.push('END:VCARD');

  return lines.join('\r\n');
}

/**
 * Generate QR code image URL from vCard data
 * Using QR Server API - free, reliable, no authentication needed
 */
export function generateQRCodeDataUrl(vcard: string): string {
  if (!vcard || vcard.length === 0) {
    console.warn('⚠️ vCard is empty, cannot generate QR code');
    return '';
  }

  try {
    // Encode vCard for URL
    const encoded = encodeURIComponent(vcard);

    // Use QR Server API with optimal settings for contact scanning
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=2&format=png&ecc=M&qzone=1&data=${encoded}`;

    console.log('✅ QR Code URL generated:', {
      vcardLength: vcard.length,
      urlLength: qrUrl.length,
      preview: vcard.substring(0, 80),
    });

    return qrUrl;
  } catch (error) {
    console.error('❌ Error generating QR code URL:', error);
    return '';
  }
}
