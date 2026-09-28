import nodemailer from 'nodemailer';

/**
 * Gửi email magic-link "Xác minh & Đăng nhập" (mẫu FADO AssetFlow) cho luồng OTP dùng chung.
 * SMTP lấy từ ENV (KHÔNG hardcode): OTP_SMTP_* (fallback BMHS_SMTP_* để tương thích).
 *   *_SMTP_HOST / *_SMTP_PORT / *_SMTP_SECURE / *_SMTP_USER / *_SMTP_PASS / *_SMTP_FROM
 */
function cfg(key: string): string | undefined {
  return process.env[`OTP_SMTP_${key}`] || process.env[`BMHS_SMTP_${key}`];
}

export function isOtpSmtpConfigured(): boolean {
  return !!(cfg('HOST') && cfg('USER') && cfg('PASS'));
}

/** HTML email magic-link (email-safe, có fallback Arial + nút bulletproof). */
function magicLinkHtml(verifyUrl: string, expiry: string): string {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background-color:#081627;font-family:'Plus Jakarta Sans','Montserrat',Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">Bấm để tiếp tục đăng nhập vào FADO AssetFlow — liên kết hết hạn sau ${expiry}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#081627;"><tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;">
      <tr><td align="center" style="padding-bottom:30px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="border-left:0;padding-right:14px;">
            <div style="font-family:'Montserrat',Arial,sans-serif;font-size:11px;font-weight:400;letter-spacing:3.5px;color:#ffffff;line-height:1;">FADO</div>
            <div style="font-family:'Montserrat',Arial,sans-serif;font-size:26px;font-weight:600;letter-spacing:0.3px;line-height:1.15;margin-top:3px;"><span style="color:#ffffff;">Asset</span><span style="color:#818cf8;">Flow</span></div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#0f2137;border-radius:16px;border:1px solid rgba(129,140,248,0.18);overflow:hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td height="3" bgcolor="#6366f1" style="height:3px;line-height:3px;font-size:0;background-image:linear-gradient(100deg,#818cf8,#c4b5fd);">&nbsp;</td></tr>
          <tr><td style="padding:44px 40px 0 40px;">
            <h1 style="margin:0 0 14px 0;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:23px;line-height:1.3;font-weight:700;color:#f1f5f9;letter-spacing:-0.3px;">Đăng nhập vào FADO AssetFlow</h1>
            <p style="margin:0;font-size:15px;line-height:1.6;color:#94a3b8;">Bấm nút bên dưới để tiếp tục. Liên kết có hiệu lực trong <strong style="color:#c4b5fd;font-weight:600;">${expiry}</strong> và chỉ dùng được một lần.</p>
          </td></tr>
          <tr><td align="center" style="padding:30px 40px 4px 40px;">
            <a href="${verifyUrl}" style="background-color:#6366f1;background-image:linear-gradient(100deg,#6366f1,#818cf8);border-radius:12px;color:#ffffff;display:inline-block;width:400px;max-width:100%;line-height:52px;font-family:'Montserrat',Arial,sans-serif;font-size:16px;font-weight:600;text-align:center;text-decoration:none;">Xác minh &amp; Đăng nhập</a>
          </td></tr>
          <tr><td align="center" style="padding:12px 40px 0 40px;">
            <p style="margin:0;font-size:11px;line-height:1.5;color:#475569;">Nút không bấm được? Sao chép liên kết dự phòng:<br>
              <a href="${verifyUrl}" style="color:#64748b;text-decoration:none;word-break:break-all;">${verifyUrl}</a></p>
          </td></tr>
          <tr><td style="padding:26px 40px 44px 40px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">Nếu bạn không yêu cầu, hãy bỏ qua email này. Đừng chia sẻ liên kết với bất kỳ ai — FADO AssetFlow sẽ không bao giờ hỏi thông tin đăng nhập của bạn.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:28px 24px 0 24px;">
        <p style="margin:0 0 10px 0;font-size:12px;line-height:1.6;color:#5b6b82;">© 2026 FADO AssetFlow · Intelligent Business Operations Platform</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export async function sendOtpMagicLink(toEmail: string, verifyUrl: string, expiry = '30 phút'): Promise<void> {
  const host = cfg('HOST'); const user = cfg('USER'); const pass = cfg('PASS');
  if (!host || !user || !pass) throw new Error('Chưa cấu hình SMTP cho OTP (OTP_SMTP_* hoặc BMHS_SMTP_*)');
  const port = Number(cfg('PORT')) || 587;
  const secure = cfg('SECURE') === 'true' || port === 465;
  const from = cfg('FROM') || user;

  const transport = nodemailer.createTransport({ host, port, secure, auth: { user, pass }, tls: { rejectUnauthorized: false } });
  await transport.sendMail({
    from,
    to: toEmail,
    subject: 'Xác minh & Đăng nhập · FADO AssetFlow',
    html: magicLinkHtml(verifyUrl, expiry),
  });
}
