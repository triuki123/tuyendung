/**
 * Vẽ mã vạch EAN-13 thuần SVG — KHÔNG dependency (build server từng đứt mạng npm,
 * và jsbarcode/bwip là quá tay cho một định dạng duy nhất).
 *
 * Bảng mã theo chuẩn GS1: mỗi chữ số = 7 module; nửa trái dùng bộ L/G theo parity
 * của chữ số đầu tiên, nửa phải dùng bộ R. Guard 101 (đầu/cuối) + 01010 (giữa).
 */
import React from 'react';

const L: Record<string, string> = {
  '0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
  '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011',
};
const G: Record<string, string> = {
  '0': '0100111', '1': '0110011', '2': '0011011', '3': '0100001', '4': '0011101',
  '5': '0111001', '6': '0000101', '7': '0010001', '8': '0001001', '9': '0010111',
};
const R: Record<string, string> = {
  '0': '1110010', '1': '1100110', '2': '1101100', '3': '1000010', '4': '1011100',
  '5': '1001110', '6': '1010000', '7': '1000100', '8': '1001000', '9': '1110100',
};
// Parity nửa trái theo chữ số đầu: L=bộ L, G=bộ G
const PARITY: Record<string, string> = {
  '0': 'LLLLLL', '1': 'LLGLGG', '2': 'LLGGLG', '3': 'LLGGGL', '4': 'LGLLGG',
  '5': 'LGGLLG', '6': 'LGGGLL', '7': 'LGLGLG', '8': 'LGLGGL', '9': 'LGGLGL',
};

export function ean13CheckDigit(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** Chuỗi hợp lệ để vẽ EAN-13? (12 số → tự thêm check digit; 13 số → check digit phải đúng) */
export function normalizeEan13(value: string): string | null {
  const v = value.trim();
  if (/^\d{12}$/.test(v)) return v + String(ean13CheckDigit(v));
  if (/^\d{13}$/.test(v)) return ean13CheckDigit(v.slice(0, 12)) === Number(v[12]) ? v : null;
  return null;
}

/** Chuỗi bit 95 module của EAN-13 (đã gồm guard). */
function encode(digits13: string): string {
  const first = digits13[0];
  const parity = PARITY[first];
  let bits = '101';
  for (let i = 1; i <= 6; i++) {
    const set = parity[i - 1] === 'L' ? L : G;
    bits += set[digits13[i]];
  }
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[digits13[i]];
  bits += '101';
  return bits;
}

/**
 * SVG mã vạch EAN-13 kèm số bên dưới. `value` phải là 12–13 chữ số hợp lệ
 * (dùng normalizeEan13 trước — không hợp lệ thì đừng render component này).
 */
export function Ean13Svg({ value, height = 56, moduleWidth = 2 }: {
  value: string; height?: number; moduleWidth?: number;
}) {
  const digits = normalizeEan13(value);
  if (!digits) return null;
  const bits = encode(digits);
  const quiet = 8 * moduleWidth; // vùng lặng 2 bên — máy quét cần
  const width = bits.length * moduleWidth + quiet * 2;
  const textH = 12;

  const bars: React.ReactNode[] = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    // Guard bars (3 cụm) kéo dài hơn — đúng dáng tem in chuyên nghiệp
    const isGuard = i < 3 || (i >= 45 && i < 50) || i >= 92;
    bars.push(
      <rect key={i} x={quiet + i * moduleWidth} y={0}
        width={moduleWidth} height={isGuard ? height + 5 : height} fill="#000" />
    );
  }

  return (
    <svg width={width} height={height + 5 + textH} viewBox={`0 0 ${width} ${height + 5 + textH}`}
      xmlns="http://www.w3.org/2000/svg" style={{ background: '#fff' }}>
      {bars}
      <text x={width / 2} y={height + 5 + textH - 2} textAnchor="middle"
        fontFamily="monospace" fontSize={textH} fill="#000">
        {digits}
      </text>
    </svg>
  );
}
