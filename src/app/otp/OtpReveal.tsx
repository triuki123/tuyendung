'use client';

import { useState } from 'react';
import { Copy, Check, ShieldAlert } from 'lucide-react';

/**
 * Trang lộ OTP sau khi bấm magic-link. Hiển thị mã 1 lần + nút sao chép.
 * Đếm ngược ẩn (server enforce hạn 10 phút kể từ lúc lộ mã).
 */
export default function OtpReveal({ otp, error }: { otp: string | null; error: string | null }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!otp) return;
    try { await navigator.clipboard.writeText(otp); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      background: 'radial-gradient(900px 500px at 50% -10%, rgba(99,102,241,.18), transparent 60%), #081627', color: '#f1f5f9',
      fontFamily: "'Plus Jakarta Sans','Montserrat',system-ui,sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 30 }}>
          <div style={{ borderLeft: '0', paddingLeft: 0, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 400, letterSpacing: '3.5px', color: '#fff', lineHeight: 1 }}>FADO</div>
            <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 26, fontWeight: 600, letterSpacing: '.3px', lineHeight: 1.15, marginTop: 3 }}>
              <span style={{ color: '#fff' }}>Asset</span><span style={{ color: '#818cf8' }}>Flow</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#0f2137', border: '1px solid rgba(129,140,248,.18)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 60px -20px rgba(0,0,0,.6)' }}>
          <div style={{ height: 3, background: 'linear-gradient(100deg,#818cf8,#c4b5fd)' }} />
          <div style={{ padding: '40px 36px' }}>
            {error || !otp ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <ShieldAlert size={40} color="#f87171" style={{ margin: '0 auto 14px' }} />
                <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Không lấy được mã</h1>
                <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>{error || 'Liên kết không hợp lệ.'}</p>
              </div>
            ) : (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.3px', marginBottom: 10 }}>Xác minh đăng nhập</h1>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#94a3b8', marginBottom: 26 }}>
                  Sao chép mã dưới đây và nhập lại vào ứng dụng để hoàn tất. Mã có hiệu lực trong <b style={{ color: '#c4b5fd', fontWeight: 600 }}>10 phút</b>.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#0b1b30', border: '1px solid rgba(129,140,248,.30)', borderRadius: 12, padding: '18px 18px 18px 22px' }}>
                  <div style={{ flex: 1, fontFamily: "'Montserrat',ui-monospace,monospace", fontSize: 34, fontWeight: 700, letterSpacing: 11, color: '#fff', userSelect: 'all' }}>{otp}</div>
                  <button onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', color: copied ? '#c4b5fd' : '#fff', border: 'none', borderRadius: 10, padding: '11px 16px', background: copied ? 'rgba(129,140,248,.16)' : 'linear-gradient(100deg,#6366f1,#818cf8)', boxShadow: copied ? 'inset 0 0 0 1px rgba(129,140,248,.4)' : 'none' }}>
                    {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Đã sao chép' : 'Sao chép'}
                  </button>
                </div>
                <p style={{ marginTop: 18, fontSize: 12.5, color: '#64748b', textAlign: 'center' }}>Không chia sẻ mã với bất kỳ ai</p>
                <p style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid rgba(148,163,184,.12)', fontSize: 12.5, lineHeight: 1.6, color: '#64748b' }}>
                  Nếu bạn không yêu cầu mã này, hãy bỏ qua. FADO AssetFlow sẽ không bao giờ hỏi mã của bạn qua điện thoại hay email.
                </p>
              </>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <p style={{ fontSize: 12, color: '#5b6b82', lineHeight: 1.6 }}>© 2026 FADO AssetFlow</p>
          <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10.5, letterSpacing: '.4px', color: '#3f4d63', marginTop: 8 }}>Intelligent Business Operations Platform</p>
        </div>
      </div>
    </div>
  );
}
