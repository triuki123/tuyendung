/**
 * Sinh chuỗi payload VietQR (chuẩn EMVCo + NAPAS) để in/hiển thị QR chuyển khoản.
 * Thuần tính toán — KHÔNG gọi dịch vụ ngoài. Render bằng qrcode.react ở client.
 *
 * Tham khảo: EMV QR + dải GUID NAPAS A000000727, service QRIBFTTA (chuyển tới tài khoản).
 */

/** TLV: id(2) + length(2) + value. */
function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, '0') + value;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) → 4 hex hoa. */
function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Bỏ dấu tiếng Việt + ký tự lạ cho nội dung CK (an toàn với app ngân hàng). */
function asciiSafe(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^0-9A-Za-z .\-_]/g, ' ').trim().slice(0, 25);
}

export interface VietQrInput {
  bankBin: string;     // mã BIN ngân hàng (6 số)
  accountNo: string;   // số tài khoản nhận
  amount?: number;     // số tiền (đồng); bỏ trống = QR tĩnh
  addInfo?: string;    // nội dung chuyển khoản (vd mã đơn)
}

/** Trả chuỗi payload để bỏ vào QR. Trả null nếu thiếu cấu hình ngân hàng. */
export function buildVietQrPayload({ bankBin, accountNo, amount, addInfo }: VietQrInput): string | null {
  if (!bankBin?.trim() || !accountNo?.trim()) return null;

  const merchantAccount =
    tlv('00', 'A000000727') +
    tlv('01', tlv('00', bankBin.trim()) + tlv('01', accountNo.trim())) +
    tlv('02', 'QRIBFTTA');

  let payload =
    tlv('00', '01') +
    tlv('01', amount && amount > 0 ? '12' : '11') +
    tlv('38', merchantAccount) +
    tlv('53', '704') +                                  // VND
    (amount && amount > 0 ? tlv('54', String(Math.round(amount))) : '') +
    tlv('58', 'VN');

  if (addInfo?.trim()) payload += tlv('62', tlv('08', asciiSafe(addInfo)));

  payload += '6304' + crc16(payload + '6304');
  return payload;
}
