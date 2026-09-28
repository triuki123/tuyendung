'use client';

import React, { useRef, useState, useMemo } from 'react';
import { Download, Mail, Phone, MapPin, X, Copy, QrCode, Edit2, Check, Loader2, Wallet, MoreVertical, UserPlus } from 'lucide-react';
import { generateVCard, generateQRCodeDataUrl } from '@/lib/vcard';

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  company_id?: string;
  department_id?: string;
  position?: string;
  position_id?: string;
  sub_department_id?: string;
  tags?: Array<{ id: string; name: string; color: string }>;
  avatar?: string;
}

interface DropdownCache {
  companies: Array<{ id: string; name: string }>;
  companyDepartmentsMap: Record<string, Array<{ id: string; name: string }>>;
  subDepartmentsByDepartmentId: Record<string, Array<{ id: string; name: string }>>;
  positions: Record<string, Array<{ id: string; name: string }>>;
}

interface UserNameCardProps {
  user: User;
  dropdownCache: DropdownCache;
  onClose: () => void;
}

export default function UserNameCard({ user, dropdownCache, onClose }: UserNameCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<number>(1);
  const [isEditing, setIsEditing] = useState(false);
  const [visibleFields, setVisibleFields] = useState({
    name: true,
    position: true,
    company: true,
    department: true,
    email: true,
    phone: true,
    qrcode: true,
  });
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isDownloadingCard, setIsDownloadingCard] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const getCompanyName = (): string => {
    if (!user.company_id) return '';
    return dropdownCache.companies.find(c => c.id === user.company_id)?.name || '';
  };

  const getDepartmentName = (): string => {
    if (!user.company_id || !user.department_id) return '';
    const departments = dropdownCache.companyDepartmentsMap[user.company_id] || [];
    return departments.find(d => d.id === user.department_id)?.name || '';
  };

  const getPositionName = (): string => {
    if (!user.company_id) return '';

    // Try to lookup position by position_id first
    if (user.position_id) {
      const positions = dropdownCache.positions[user.company_id] || [];
      const foundPosition = positions.find(p => p.id === user.position_id);
      if (foundPosition) return foundPosition.name;
    }

    // Fall back to direct position name
    if (user.position) return user.position;

    return '';
  };

  const handleDownload = async () => {
    if (!cardRef.current || isDownloadingCard) return;

    setIsDownloadingCard(true);
    setDownloadError(null);
    try {
      const images = Array.from(cardRef.current.querySelectorAll('img'));
      await Promise.allSettled(images.map((img) =>
        img.complete
          ? Promise.resolve()
          : Promise.race([
              img.decode(),
              new Promise((resolve) => setTimeout(resolve, 2000)),
            ]),
      ));

      // html2canvas renders background-clip:text as a full-width gradient
      // block. html-to-image lets the browser preserve the preview's CSS.
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: false,
        skipFonts: true,
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      const safeName = user.name.trim().replace(/[\\/:*?"<>|]+/g, '-');
      link.download = `${safeName || 'ecard'}-ecard.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error downloading ecard:', error);
      setDownloadError('Không thể tạo ảnh thẻ. Vui lòng thử lại.');
    } finally {
      setIsDownloadingCard(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Error copying to clipboard:', err);
    }
  };

  const toggleField = (field: keyof typeof visibleFields) => {
    setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const initials = user.name.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();
  const companyName = getCompanyName();
  const departmentName = getDepartmentName();
  const positionName = getPositionName();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  // Biến thể hồ sơ năng lực của user (personal + N công ty). 'contact' = vCard.
  const [variants, setVariants] = useState<Array<{ id: string; scope: 'personal' | 'company'; company_name: string | null; slug: string; title: string; is_public: boolean }>>([]);
  const [qrMode, setQrMode] = useState<'contact' | string>('contact'); // 'contact' hoặc variant.id
  const [origin, setOrigin] = useState<string>('');
  const [isAddingToWallet, setIsAddingToWallet] = useState(false);
  const [isDownloadingPass, setIsDownloadingPass] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Generate vCard data
  const vcard = useMemo(() => {
    return generateVCard({
      name: user.name,
      email: user.email,
      phone: user.phone,
      position: positionName,
      company: companyName,
      department: departmentName,
    });
  }, [user.name, user.email, user.phone, positionName, companyName, departmentName]);

  // Nạp danh sách biến thể hồ sơ (chỉ hiện biến thể đang public).
  React.useEffect(() => {
    setOrigin(window.location.origin);
    fetch(`/api/ecard/${user.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j?.data)) setVariants(j.data.filter((v: any) => v.is_public));
      })
      .catch(() => {});
  }, [user.id]);

  // Nội dung QR: 'contact' → vCard; ngược lại → URL trang hồ sơ của variant.
  const selectedVariant = variants.find(v => v.id === qrMode);
  const qrContent = selectedVariant ? `${origin}/card/${selectedVariant.slug}` : vcard;

  // Sinh QR từ nội dung đã chọn.
  React.useEffect(() => {
    if (qrContent && qrContent.length > 0) {
      setQrCodeUrl(generateQRCodeDataUrl(qrContent));
    } else {
      setQrCodeUrl('');
    }
  }, [qrContent]);

  // Add to wallet function - using GET request for best Safari iOS compatibility
  const handleAddToWallet = () => {
    try {
      setIsAddingToWallet(true);
      setWalletError(null);

      const requestData = {
        name: user.name,
        email: user.email,
        phone: user.phone,
        position: positionName,
        company: companyName,
        department: departmentName,
        vcard: vcard,
      };

      // Build download URL with data in query parameters
      // Safari iOS handles GET requests better than POST for file downloads
      const downloadUrl = `/api/wallet/download?data=${encodeURIComponent(
        JSON.stringify(requestData)
      )}`;

      // Use window.location for Safari iOS compatibility
      // This triggers native file download behavior
      window.location.href = downloadUrl;

      // Reset after a delay
      setTimeout(() => {
        setIsAddingToWallet(false);
      }, 1000);
    } catch (error: any) {
      console.error('Error downloading wallet pass:', error);
      setWalletError(error.message || 'Failed to download. Please try again.');
      setIsAddingToWallet(false);
    }
  };

  const renderTemplate = () => {
    const commonProps = { user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard };

    switch(templateId) {
      case 1: return <Template1 {...commonProps} />;
      case 2: return <Template2 {...commonProps} />;
      case 3: return <Template3 {...commonProps} />;
      case 4: return <Template4 {...commonProps} />;
      case 5: return <Template5 {...commonProps} />;
      case 6: return <Template6 {...commonProps} />;
      case 7: return <Template7 {...commonProps} />;
      case 8: return <Template8 {...commonProps} />;
      case 9: return <Template9 {...commonProps} />;
      case 10: return <Template10 {...commonProps} />;
      default: return <Template1 {...commonProps} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-6xl max-h-[90vh] rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col" style={{ background: 'var(--card)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-line">
          <h2 className="text-base sm:text-lg font-700 text-foreground">Thẻ Điện Tử Nhân Viên</h2>
          <div className="flex items-center gap-2">
            {/* Mobile Menu Button - only visible on mobile */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden w-8 h-8 rounded-xl btn-ghost flex items-center justify-center text-muted-foreground hover:bg-hover-strong"
            >
              <MoreVertical size={18} />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl btn-ghost flex items-center justify-center text-muted-foreground hover:bg-hover-strong"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* QR mode: Danh bạ + chip từng biến thể hồ sơ năng lực. Cuộn ngang nếu nhiều. */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line overflow-x-auto">
          <span className="text-xs text-muted-foreground flex-shrink-0">QR quét ra:</span>
          <button
            onClick={() => setQrMode('contact')}
            className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-600 transition-colors ${
              qrMode === 'contact' ? 'bg-blue-600 text-white' : 'bg-hover text-foreground hover:bg-hover-strong'
            }`}
          >
            Danh bạ
          </button>
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => setQrMode(v.id)}
              className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-600 transition-colors whitespace-nowrap ${
                qrMode === v.id ? 'bg-blue-600 text-white' : 'bg-hover text-foreground hover:bg-hover-strong'
              }`}
              title={`HSNL - ${v.scope === 'personal' ? 'Cá Nhân' : (v.company_name || 'Công Ty')}`}
            >
              {v.scope === 'personal' ? 'HSNL - Cá Nhân' : `HSNL - ${v.company_name || 'Công Ty'}`}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
          {/* Left: Template Selector - hidden on mobile */}
          <div className="hidden md:flex w-32 border-r border-line overflow-y-auto bg-black/20 p-3 flex-col gap-2">
            <p className="text-xs font-600 text-muted-foreground px-2 mb-2">Chọn Mẫu</p>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => (
              <button
                key={id}
                onClick={() => setTemplateId(id)}
                className={`h-14 rounded-lg text-xs font-600 transition-all ${
                  templateId === id
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                    : 'bg-hover text-foreground hover:bg-hover-strong'
                }`}
              >
                T{id}
              </button>
            ))}
          </div>

          {/* Center: Card Preview */}
          <div className="flex-1 p-3 sm:p-6 flex items-center justify-center overflow-auto bg-gradient-to-br from-slate-900 to-slate-800">
            <div ref={cardRef} className="w-full max-w-sm">
              {renderTemplate()}
            </div>
          </div>

          {/* Right: Settings - hidden on mobile */}
          <div className="hidden md:flex w-64 border-l border-line overflow-y-auto bg-black/20 p-4 flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Edit2 size={16} className="text-blue-400" />
              <h3 className="text-sm font-700 text-foreground">Hiển Thị Thông Tin</h3>
            </div>
            <div className="space-y-2">
              {[
                { key: 'name', label: 'Tên' },
                { key: 'position', label: 'Vị Trí' },
                { key: 'company', label: 'Công Ty' },
                { key: 'department', label: 'Phòng Ban' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Điện Thoại' },
                { key: 'qrcode', label: 'QR Code' },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-hover transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={visibleFields[key as keyof typeof visibleFields]}
                    onChange={() => toggleField(key as keyof typeof visibleFields)}
                    className="w-4 h-4 rounded cursor-pointer"
                  />
                  <span className="text-sm text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Mobile Menu - only visible on mobile when showMobileMenu is true */}
          {showMobileMenu && (
            <div className="md:hidden border-t border-line bg-black/20 p-4 max-h-60 overflow-y-auto">
              {/* Template Selection */}
              <div className="mb-4">
                <p className="text-xs font-600 text-muted-foreground mb-2">Chọn Mẫu</p>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => (
                    <button
                      key={id}
                      onClick={() => {
                        setTemplateId(id);
                        setShowMobileMenu(false);
                      }}
                      className={`h-10 rounded-lg text-xs font-600 transition-all ${
                        templateId === id
                          ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                          : 'bg-hover text-foreground hover:bg-hover-strong'
                      }`}
                    >
                      T{id}
                    </button>
                  ))}
                </div>
              </div>
              {/* Settings */}
              <div>
                <p className="text-xs font-600 text-blue-400 mb-2">Hiển Thị Thông Tin</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'name', label: 'Tên' },
                    { key: 'position', label: 'Vị Trí' },
                    { key: 'company', label: 'Công Ty' },
                    { key: 'department', label: 'Phòng Ban' },
                    { key: 'email', label: 'Email' },
                    { key: 'phone', label: 'Điện Thoại' },
                    { key: 'qrcode', label: 'QR Code' },
                  ].map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 cursor-pointer text-xs text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={visibleFields[key as keyof typeof visibleFields]}
                        onChange={() => toggleField(key as keyof typeof visibleFields)}
                        className="w-4 h-4 rounded cursor-pointer"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-line bg-black/10">
          {walletError && (
            <div className="p-2 sm:p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm">
              {walletError}
            </div>
          )}
          {downloadError && (
            <div className="p-2 sm:p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm">
              {downloadError}
            </div>
          )}
          {/* Mobile: 2x2 grid, Desktop: horizontal flex */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end sm:gap-2">
            <button
              onClick={() => {
                const basicInfo = [
                  user.name,
                  positionName && `Vị trí: ${positionName}`,
                  companyName && `Công ty: ${companyName}`,
                  user.email && `Email: ${user.email}`,
                  user.phone && `Điện thoại: ${user.phone}`,
                ]
                  .filter(Boolean)
                  .join('\n');
                copyToClipboard(basicInfo, 'copy');
              }}
              className="h-9 px-2 sm:px-4 rounded-xl btn-ghost text-xs sm:text-sm font-600 flex items-center justify-center sm:gap-2 transition-colors hover:bg-hover-strong"
              title="Copy contact info"
            >
              <Copy size={14} />
              <span className="hidden sm:inline">{copied === 'copy' ? 'Đã sao chép' : 'Sao chép'}</span>
            </button>
            <button
              onClick={handleAddToWallet}
              disabled={isAddingToWallet}
              className="h-9 px-2 sm:px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs sm:text-sm font-600 flex items-center justify-center sm:gap-2 transition-colors"
              title="Add to Apple Wallet / Google Wallet"
            >
              {isAddingToWallet ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Wallet size={14} />
              )}
              <span className="hidden sm:inline">{isAddingToWallet ? 'Đang tạo...' : 'Thêm vào Ví'}</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloadingCard}
              className="h-9 px-2 sm:px-4 rounded-xl btn-accent disabled:opacity-50 text-xs sm:text-sm font-600 flex items-center justify-center sm:gap-2 transition-colors hover:opacity-90"
            >
              {isDownloadingCard ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span className="hidden sm:inline">Tải về</span>
            </button>
            <button
              onClick={onClose}
              className="h-9 px-2 sm:px-5 rounded-xl btn-ghost text-xs sm:text-sm font-500 flex items-center justify-center"
            >
              <span className="hidden sm:inline">Đóng</span>
              <span className="sm:hidden">X</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============= Avatar Component =============
function AvatarEl({ user, initials, size, shape, gradient, border = '' }: {
  user: any; initials: string;
  size: string;       // e.g. 'w-28 h-28'
  shape: string;      // e.g. 'rounded-full' | 'rounded-lg' | 'rounded-2xl' | 'rounded-3xl'
  gradient: string;   // inline style background
  border?: string;    // extra class e.g. 'border-4 border-white'
}) {
  if (user.avatar && typeof user.avatar === 'string' && user.avatar.startsWith('/')) {
    return (
      <img
        src={user.avatar}
        alt={user.name}
        className={`${size} ${shape} ${border} object-cover shadow-lg`}
        style={border ? { borderWidth: undefined } : undefined}
      />
    );
  }
  return (
    <div
      className={`${size} ${shape} ${border} flex items-center justify-center font-bold text-white shadow-lg`}
      style={{ background: gradient }}
    >
      {initials}
    </div>
  );
}

// ============= QR Code Component =============
function QRCodeDisplay({ qrCodeUrl, size = 'w-28 h-28', vcard }: { qrCodeUrl?: string; size?: string; vcard?: string }) {
  const [imageError, setImageError] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const handleSaveContact = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!vcard) return;
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contact.vcf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!qrCodeUrl || imageError) {
    return (
      <div className={`${size} bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl flex items-center justify-center border-2 border-gray-200`}>
        <QrCode size={40} className="text-gray-400" />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        className={`${size} rounded-2xl overflow-hidden flex-shrink-0 bg-white p-2 cursor-pointer hover:scale-105 transition-transform`}
        style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
        title="Ấn để phóng to quét mã"
      >
        <img
          src={qrCodeUrl}
          alt="vCard QR Code"
          className="w-full h-full object-contain"
          style={{ imageRendering: 'pixelated' }}
          onError={() => setImageError(true)}
        />
      </button>

      {zoomed && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
          onClick={() => setZoomed(false)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setZoomed(false); }}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>

          <p className="text-white/70 text-xs font-700 uppercase tracking-[0.25em] mb-4">Quét mã để lưu danh bạ</p>

          <div
            className="rounded-3xl p-4 mb-5"
            style={{ background: '#0B0B0F', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl bg-white p-3">
              <img
                src={qrCodeUrl}
                alt="vCard QR Code"
                className="block"
                style={{ width: 'min(72vw, 380px)', height: 'min(72vw, 380px)', imageRendering: 'pixelated' }}
              />
            </div>
          </div>

          {vcard && (
            <button
              onClick={handleSaveContact}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-700 text-sm hover:bg-white/90 transition-colors"
            >
              <UserPlus size={16} />
              Lưu danh bạ
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ============= TEMPLATE 1: Modern Minimal =============
function Template1({ user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard }: any) {
  return (
    <div className="bg-white rounded-3xl p-8 shadow-2xl" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
      {/* Accent Top Bar */}
      <div className="h-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full mb-8" />

      {/* Avatar */}
      {visibleFields.name && (
        <div className="flex justify-center mb-6">
          <AvatarEl user={user} initials={initials} size="w-28 h-28" shape="rounded-full" gradient="linear-gradient(135deg, #0EA5E9, #06B6D4)" />
        </div>
      )}

      {/* Name */}
      {visibleFields.name && (
        <h2 className="text-2xl font-800 text-gray-900 text-center mb-2">{user.name}</h2>
      )}

      {/* Position */}
      {visibleFields.position && positionName && (
        <p className="text-center text-cyan-600 font-700 text-sm mb-6">{positionName}</p>
      )}

      {/* Info Section */}
      <div className="flex-1 space-y-4 mb-6">
        {visibleFields.company && companyName && (
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Công Ty</p>
            <p className="text-sm font-600 text-gray-800">{companyName}</p>
          </div>
        )}
        {visibleFields.department && departmentName && (
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Phòng Ban</p>
            <p className="text-sm font-600 text-gray-800">{departmentName}</p>
          </div>
        )}
        {visibleFields.email && user.email && (
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Email</p>
            <a href={`mailto:${user.email}`} className="text-sm font-500 text-cyan-600 hover:text-cyan-700">{user.email}</a>
          </div>
        )}
        {visibleFields.phone && user.phone && (
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Điện Thoại</p>
            <a href={`tel:${user.phone}`} className="text-sm font-500 text-cyan-600 hover:text-cyan-700">{user.phone}</a>
          </div>
        )}
      </div>

      {/* QR Code */}
      {visibleFields.qrcode && (
        <div className="flex justify-center mb-6">
          <QRCodeDisplay qrCodeUrl={qrCodeUrl} vcard={vcard} size="w-32 h-32" />
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-200 pt-4 text-center">
        <p className="text-xs font-700 text-gray-600">FADO GROUP</p>
      </div>
    </div>
  );
}

// ============= TEMPLATE 2: Obsidian Gold (Luxury Black) =============
function Template2({ user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard }: any) {
  return (
    <div
      className="rounded-3xl shadow-2xl overflow-hidden relative"
      style={{ minHeight: '500px', display: 'flex', flexDirection: 'column', background: 'linear-gradient(160deg, #0B0B0F 0%, #16161D 55%, #0B0B0F 100%)' }}
    >
      {/* Gold filigree corners */}
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37 30%, #F5E7A8 50%, #D4AF37 70%, transparent)' }} />
      <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 65%)' }} />

      <div className="relative z-10 p-8 flex flex-col h-full">
        {/* Avatar + Name */}
        {visibleFields.name && (
          <div className="flex flex-col items-center mb-6">
            <div className="p-[2px] rounded-full mb-4" style={{ background: 'linear-gradient(135deg, #F5E7A8, #D4AF37, #8C6A1A)' }}>
              <AvatarEl user={user} initials={initials} size="w-28 h-28" shape="rounded-full" gradient="linear-gradient(135deg, #2A2A33, #16161D)" border="border-[3px] border-[#0B0B0F]" />
            </div>
            <h2 className="text-2xl font-800 text-white text-center tracking-wide">{user.name}</h2>
            {visibleFields.position && positionName && (
              <p className="mt-1.5 text-xs font-700 uppercase tracking-[0.25em]" style={{ color: '#D4AF37' }}>{positionName}</p>
            )}
          </div>
        )}

        {/* Gold divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.6))' }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: '#D4AF37' }} />
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(212,175,55,0.6), transparent)' }} />
        </div>

        {/* Info */}
        <div className="flex-1 space-y-3.5 mb-6">
          {visibleFields.company && companyName && (
            <div className="text-center">
              <p className="text-[10px] font-700 uppercase tracking-[0.2em] mb-1" style={{ color: 'rgba(212,175,55,0.7)' }}>Công Ty</p>
              <p className="text-sm font-600 text-gray-100">{companyName}</p>
            </div>
          )}
          {visibleFields.department && departmentName && (
            <div className="text-center">
              <p className="text-[10px] font-700 uppercase tracking-[0.2em] mb-1" style={{ color: 'rgba(212,175,55,0.7)' }}>Phòng Ban</p>
              <p className="text-sm font-600 text-gray-100">{departmentName}</p>
            </div>
          )}
          {visibleFields.email && user.email && (
            <div className="flex items-center justify-center gap-2">
              <Mail size={13} style={{ color: '#D4AF37' }} />
              <a href={`mailto:${user.email}`} className="text-xs font-500 text-gray-300 hover:text-white">{user.email}</a>
            </div>
          )}
          {visibleFields.phone && user.phone && (
            <div className="flex items-center justify-center gap-2">
              <Phone size={13} style={{ color: '#D4AF37' }} />
              <a href={`tel:${user.phone}`} className="text-xs font-500 text-gray-300 hover:text-white">{user.phone}</a>
            </div>
          )}
        </div>

        {/* QR + Footer */}
        <div className="flex items-center justify-between pt-5 border-t" style={{ borderColor: 'rgba(212,175,55,0.2)' }}>
          {visibleFields.qrcode && <QRCodeDisplay qrCodeUrl={qrCodeUrl} vcard={vcard} size="w-32 h-32" />}
          <p className="text-[11px] font-700 tracking-[0.2em]" style={{ color: '#D4AF37' }}>FADO GROUP</p>
        </div>
      </div>
    </div>
  );
}

// ============= TEMPLATE 3: Creative Modern =============
function Template3({ user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard }: any) {
  return (
    <div className="bg-gradient-to-br from-white to-blue-50 rounded-3xl p-8 shadow-2xl relative" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
      {/* Geometric Accent */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-blue-400 rounded-full opacity-10 -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-400 rounded-full opacity-10 -ml-16 -mb-16" />

      <div className="relative z-10">
        {/* Avatar */}
        {visibleFields.name && (
          <div className="flex justify-center mb-6">
            <AvatarEl user={user} initials={initials} size="w-32 h-32" shape="rounded-3xl" gradient="linear-gradient(135deg, #3B82F6, #1D4ED8)" />
          </div>
        )}

        {/* Name */}
        {visibleFields.name && (
          <h2 className="text-3xl font-900 text-gray-900 text-center mb-1">{user.name}</h2>
        )}

        {/* Position */}
        {visibleFields.position && positionName && (
          <p className="text-center text-lg font-700 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-6">{positionName}</p>
        )}

        {/* Info */}
        <div className="bg-white/70 backdrop-blur rounded-2xl p-4 mb-6 space-y-3">
          {visibleFields.company && companyName && (
            <div className="text-center pb-3 border-b border-gray-200">
              <p className="text-xs font-700 text-gray-500 mb-1">CÔNG TY</p>
              <p className="text-sm font-600 text-gray-900">{companyName}</p>
            </div>
          )}
          {visibleFields.department && departmentName && (
            <div className="text-center pb-3 border-b border-gray-200">
              <p className="text-xs font-700 text-gray-500 mb-1">PHÒNG BAN</p>
              <p className="text-sm font-600 text-gray-900">{departmentName}</p>
            </div>
          )}
          {visibleFields.email && user.email && (
            <div className="text-center">
              <a href={`mailto:${user.email}`} className="text-sm font-500 text-blue-600 hover:text-blue-700">{user.email}</a>
            </div>
          )}
          {visibleFields.phone && user.phone && (
            <div className="text-center">
              <a href={`tel:${user.phone}`} className="text-sm font-500 text-blue-600 hover:text-blue-700">{user.phone}</a>
            </div>
          )}
        </div>

        {/* QR Code */}
        {visibleFields.qrcode && (
          <div className="flex justify-center mb-6">
            <QRCodeDisplay qrCodeUrl={qrCodeUrl} vcard={vcard} size="w-32 h-32" />
          </div>
        )}

      </div>
    </div>
  );
}

// ============= TEMPLATE 4: Elegant Premium =============
function Template4({ user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard }: any) {
  return (
    <div className="bg-white rounded-xl shadow-2xl overflow-hidden" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
      {/* Elegant Header with Gradient */}
      <div className="h-24 bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700" />

      <div className="px-8 py-6 flex-1 flex flex-col">
        {/* Avatar */}
        {visibleFields.name && (
          <div className="flex justify-center -mt-20 mb-6">
            <AvatarEl user={user} initials={initials} size="w-28 h-28" shape="rounded-full" gradient="linear-gradient(135deg, #B45309, #92400E)" border="border-4 border-white" />
          </div>
        )}

        {/* Name */}
        {visibleFields.name && (
          <h2 className="text-2xl font-800 text-amber-950 text-center mb-1">{user.name}</h2>
        )}

        {/* Position */}
        {visibleFields.position && positionName && (
          <p className="text-center text-amber-700 font-700 text-sm mb-8 tracking-wide">{positionName}</p>
        )}

        {/* Divider */}
        <div className="w-12 h-0.5 bg-gradient-to-r from-amber-600 to-amber-700 mx-auto mb-6" />

        {/* Info Section */}
        <div className="space-y-4 mb-6 text-center">
          {visibleFields.company && companyName && (
            <div>
              <p className="text-xs text-amber-600 font-700 uppercase tracking-wider mb-1">Công Ty</p>
              <p className="text-sm font-600 text-gray-800">{companyName}</p>
            </div>
          )}
          {visibleFields.department && departmentName && (
            <div>
              <p className="text-xs text-amber-600 font-700 uppercase tracking-wider mb-1">Phòng Ban</p>
              <p className="text-sm font-600 text-gray-800">{departmentName}</p>
            </div>
          )}
          {visibleFields.email && user.email && (
            <div>
              <a href={`mailto:${user.email}`} className="text-sm font-500 text-amber-800 hover:text-amber-900">{user.email}</a>
            </div>
          )}
          {visibleFields.phone && user.phone && (
            <div>
              <a href={`tel:${user.phone}`} className="text-sm font-500 text-amber-800 hover:text-amber-900">{user.phone}</a>
            </div>
          )}
        </div>

        {/* QR Code */}
        {visibleFields.qrcode && (
          <div className="flex justify-center my-6">
            <QRCodeDisplay qrCodeUrl={qrCodeUrl} vcard={vcard} size="w-32 h-32" />
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-amber-200 pt-4 mt-auto text-center">
          <p className="text-xs font-700 text-amber-700">FADO GROUP</p>
        </div>
      </div>
    </div>
  );
}

// ============= TEMPLATE 5: Platinum Frost (Glassmorphism) =============
function Template5({ user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard }: any) {
  return (
    <div
      className="rounded-3xl shadow-2xl relative overflow-hidden"
      style={{ minHeight: '500px', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #6D5BBA 0%, #4A3F9E 40%, #2E2A6E 100%)' }}
    >
      {/* Aurora blobs */}
      <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full opacity-50 blur-2xl" style={{ background: 'radial-gradient(circle, #8B7FE8, transparent 70%)' }} />
      <div className="absolute -bottom-20 -right-10 w-64 h-64 rounded-full opacity-40 blur-2xl" style={{ background: 'radial-gradient(circle, #C9A8FF, transparent 70%)' }} />

      <div className="relative z-10 p-6 flex flex-col h-full">
        {/* Glass panel */}
        <div
          className="rounded-3xl p-6 flex flex-col h-full"
          style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(12px)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.3)' }}
        >
          {/* Avatar */}
          {visibleFields.name && (
            <div className="flex justify-center mb-4">
              <div className="p-[2px] rounded-full" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.2))' }}>
                <AvatarEl user={user} initials={initials} size="w-24 h-24" shape="rounded-full" gradient="linear-gradient(135deg, #8B7FE8, #4A3F9E)" border="border-2 border-white/40" />
              </div>
            </div>
          )}

          {/* Name + Position */}
          {visibleFields.name && (
            <h2 className="text-2xl font-800 text-center text-white tracking-wide mb-2 drop-shadow">{user.name}</h2>
          )}
          {visibleFields.position && positionName && (
            <div className="flex justify-center mb-5">
              <div className="px-4 py-1.5 rounded-full text-xs font-700 text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)' }}>
                {positionName}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="flex-1 space-y-2.5 mb-4">
            {visibleFields.company && companyName && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <p className="text-[10px] text-white/60 font-700 uppercase tracking-widest mb-0.5">Công Ty</p>
                <p className="text-sm font-600 text-white truncate">{companyName}</p>
              </div>
            )}
            {visibleFields.department && departmentName && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <p className="text-[10px] text-white/60 font-700 uppercase tracking-widest mb-0.5">Phòng Ban</p>
                <p className="text-sm font-600 text-white truncate">{departmentName}</p>
              </div>
            )}
            {visibleFields.email && user.email && (
              <div className="flex items-center gap-2.5 rounded-xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <Mail size={14} className="text-white/80 flex-shrink-0" />
                <a href={`mailto:${user.email}`} className="text-xs font-500 text-white/90 truncate">{user.email}</a>
              </div>
            )}
            {visibleFields.phone && user.phone && (
              <div className="flex items-center gap-2.5 rounded-xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <Phone size={14} className="text-white/80 flex-shrink-0" />
                <a href={`tel:${user.phone}`} className="text-xs font-500 text-white/90">{user.phone}</a>
              </div>
            )}
          </div>

          {/* QR + Footer */}
          <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            {visibleFields.qrcode && <QRCodeDisplay qrCodeUrl={qrCodeUrl} vcard={vcard} size="w-32 h-32" />}
            <p className="text-[11px] font-700 text-white/80 tracking-[0.2em]">FADO GROUP</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============= TEMPLATE 6: Royal Navy & Gold =============
function Template6({ user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard }: any) {
  return (
    <div className="rounded-3xl shadow-2xl overflow-hidden" style={{ minHeight: '500px', display: 'flex' }}>
      {/* Left: deep navy panel */}
      <div
        className="w-5/12 p-6 flex flex-col items-center justify-center text-center relative"
        style={{ background: 'linear-gradient(160deg, #0F1E3D 0%, #1B2F54 60%, #0F1E3D 100%)' }}
      >
        <div className="absolute top-0 right-0 bottom-0 w-[3px]" style={{ background: 'linear-gradient(180deg, transparent, #D4AF37 50%, transparent)' }} />
        {visibleFields.name && (
          <>
            <div className="p-[2px] rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, #F5E7A8, #D4AF37, #8C6A1A)' }}>
              <AvatarEl user={user} initials={initials} size="w-24 h-24" shape="rounded-2xl" gradient="linear-gradient(135deg, #1B2F54, #0F1E3D)" border="border-2 border-[#0F1E3D]" />
            </div>
            <h2 className="text-lg font-800 text-white leading-tight">{user.name}</h2>
          </>
        )}
        {visibleFields.position && positionName && (
          <p className="text-[11px] font-700 uppercase tracking-[0.15em] mt-2" style={{ color: '#D4AF37' }}>{positionName}</p>
        )}
        {visibleFields.qrcode && (
          <div className="mt-5">
            <QRCodeDisplay qrCodeUrl={qrCodeUrl} vcard={vcard} size="w-32 h-32" />
          </div>
        )}
      </div>

      {/* Right: cream info panel */}
      <div className="flex-1 p-6 flex flex-col" style={{ background: 'linear-gradient(160deg, #FBF9F4, #F3EFE6)' }}>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-px" style={{ background: '#D4AF37' }} />
          <span className="text-[10px] font-700 uppercase tracking-[0.2em]" style={{ color: '#9A7B3A' }}>Thông Tin Liên Hệ</span>
        </div>

        {visibleFields.company && companyName && (
          <div className="mb-4">
            <p className="text-[10px] font-700 uppercase tracking-wider mb-1" style={{ color: '#B08D3A' }}>Công Ty</p>
            <p className="text-sm font-600" style={{ color: '#1B2F54' }}>{companyName}</p>
          </div>
        )}
        {visibleFields.department && departmentName && (
          <div className="mb-4">
            <p className="text-[10px] font-700 uppercase tracking-wider mb-1" style={{ color: '#B08D3A' }}>Phòng Ban</p>
            <p className="text-sm font-600" style={{ color: '#1B2F54' }}>{departmentName}</p>
          </div>
        )}

        <div className="flex-1" />

        {visibleFields.email && user.email && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
              <Mail size={13} style={{ color: '#D4AF37' }} />
            </div>
            <a href={`mailto:${user.email}`} className="text-xs font-500 truncate" style={{ color: '#1B2F54' }}>{user.email}</a>
          </div>
        )}
        {visibleFields.phone && user.phone && (
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
              <Phone size={13} style={{ color: '#D4AF37' }} />
            </div>
            <a href={`tel:${user.phone}`} className="text-xs font-500" style={{ color: '#1B2F54' }}>{user.phone}</a>
          </div>
        )}

        <div className="pt-3 border-t" style={{ borderColor: 'rgba(212,175,55,0.3)' }}>
          <p className="text-[11px] font-700 tracking-[0.2em]" style={{ color: '#B08D3A' }}>FADO GROUP</p>
        </div>
      </div>
    </div>
  );
}

// ============= TEMPLATE 7: Minimalist Side =============
function Template7({ user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard }: any) {
  return (
    <div className="bg-white rounded-3xl p-8 shadow-2xl relative" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
      <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-blue-500 to-cyan-500 rounded-l-3xl" />

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Header */}
        <div className="mb-6">
          {visibleFields.name && (
            <h2 className="text-3xl font-900 text-gray-900">{user.name}</h2>
          )}
          {visibleFields.position && positionName && (
            <p className="text-sm font-700 text-blue-600 mt-2">{positionName}</p>
          )}
        </div>

        {/* Divider */}
        <div className="h-0.5 bg-gradient-to-r from-blue-500 to-transparent mb-6 w-16" />

        {/* Info */}
        <div className="space-y-4 flex-1">
          {visibleFields.company && companyName && (
            <div>
              <p className="text-xs font-700 text-gray-500 uppercase tracking-wider mb-1">Công Ty</p>
              <p className="text-sm font-600 text-gray-800">{companyName}</p>
            </div>
          )}

          {visibleFields.department && departmentName && (
            <div>
              <p className="text-xs font-700 text-gray-500 uppercase tracking-wider mb-1">Phòng Ban</p>
              <p className="text-sm font-600 text-gray-800">{departmentName}</p>
            </div>
          )}

          {visibleFields.email && user.email && (
            <div>
              <p className="text-xs font-700 text-gray-500 uppercase tracking-wider mb-1">Email</p>
              <a href={`mailto:${user.email}`} className="text-sm text-blue-600 hover:text-blue-700 font-500 break-all">
                {user.email}
              </a>
            </div>
          )}

          {visibleFields.phone && user.phone && (
            <div>
              <p className="text-xs font-700 text-gray-500 uppercase tracking-wider mb-1">Điện Thoại</p>
              <a href={`tel:${user.phone}`} className="text-sm text-blue-600 hover:text-blue-700 font-500">
                {user.phone}
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between">
          {visibleFields.qrcode && (
            <QRCodeDisplay qrCodeUrl={qrCodeUrl} vcard={vcard} size="w-28 h-28" />
          )}
          <p className="text-xs font-700 text-gray-600">FADO GROUP</p>
        </div>
      </div>
    </div>
  );
}

// ============= TEMPLATE 8: Midnight Aurora =============
function Template8({ user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard }: any) {
  return (
    <div
      className="rounded-3xl p-6 shadow-2xl relative overflow-hidden"
      style={{ minHeight: '500px', display: 'flex', flexDirection: 'column', background: 'linear-gradient(165deg, #0A0F1F 0%, #111A33 55%, #0A0F1F 100%)' }}
    >
      {/* Aurora glow */}
      <div className="absolute -top-10 left-1/4 w-72 h-40 rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(ellipse, #22D3EE, transparent 70%)' }} />
      <div className="absolute top-1/3 -right-16 w-64 h-64 rounded-full opacity-30 blur-3xl" style={{ background: 'radial-gradient(circle, #818CF8, transparent 70%)' }} />
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #22D3EE, #818CF8, #C084FC)' }} />

      <div className="relative z-10 flex flex-col h-full">
        {/* Avatar + Name */}
        {visibleFields.name && (
          <div className="flex items-center gap-4 mb-5">
            <div className="p-[2px] rounded-2xl" style={{ background: 'linear-gradient(135deg, #22D3EE, #818CF8)' }}>
              <AvatarEl user={user} initials={initials} size="w-20 h-20" shape="rounded-2xl" gradient="linear-gradient(135deg, #1E293B, #0F172A)" border="border-2 border-[#0A0F1F]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-800 text-white truncate">{user.name}</h2>
              {visibleFields.position && positionName && (
                <p className="text-xs font-700 mt-1 uppercase tracking-[0.15em]" style={{ color: '#5EEAD4' }}>{positionName}</p>
              )}
            </div>
          </div>
        )}

        {/* Info cards (glass) */}
        <div className="flex-1 space-y-2.5 mb-4">
          {visibleFields.company && companyName && (
            <div className="flex gap-3 rounded-xl p-3 items-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(34,211,238,0.2)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,211,238,0.15)' }}>
                <MapPin size={14} style={{ color: '#22D3EE' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/50 font-700 uppercase tracking-wider mb-0.5">Công Ty</p>
                <p className="text-sm font-600 text-white truncate">{companyName}</p>
              </div>
            </div>
          )}
          {visibleFields.department && departmentName && (
            <div className="flex gap-3 rounded-xl p-3 items-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(129,140,248,0.2)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(129,140,248,0.15)' }}>
                <Mail size={14} style={{ color: '#818CF8' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/50 font-700 uppercase tracking-wider mb-0.5">Phòng Ban</p>
                <p className="text-sm font-600 text-white truncate">{departmentName}</p>
              </div>
            </div>
          )}
          {visibleFields.email && user.email && (
            <div className="flex gap-3 rounded-xl p-3 items-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <Mail size={14} style={{ color: '#C084FC' }} className="flex-shrink-0" />
              <a href={`mailto:${user.email}`} className="text-xs font-500 text-white/85 truncate">{user.email}</a>
            </div>
          )}
          {visibleFields.phone && user.phone && (
            <div className="flex gap-3 rounded-xl p-3 items-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <Phone size={14} style={{ color: '#5EEAD4' }} className="flex-shrink-0" />
              <a href={`tel:${user.phone}`} className="text-xs font-500 text-white/85">{user.phone}</a>
            </div>
          )}
        </div>

        {/* QR + Footer */}
        <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          {visibleFields.qrcode && <QRCodeDisplay qrCodeUrl={qrCodeUrl} vcard={vcard} size="w-32 h-32" />}
          <p className="text-[11px] font-700 tracking-[0.2em]" style={{ color: '#5EEAD4' }}>FADO GROUP</p>
        </div>
      </div>
    </div>
  );
}

// ============= TEMPLATE 9: Ivory Marble Elite =============
function Template9({ user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard }: any) {
  const gold = '#B89752';
  return (
    <div
      className="rounded-3xl p-7 shadow-2xl relative overflow-hidden"
      style={{ minHeight: '500px', display: 'flex', flexDirection: 'column', background: 'linear-gradient(155deg, #FCFAF4 0%, #F4EFE3 55%, #ECE3CF 100%)', border: '1px solid rgba(184,151,82,0.35)' }}
    >
      {/* Marble veins / gold corner */}
      <div className="absolute top-0 right-0 w-40 h-40 opacity-[0.07] -mr-10 -mt-10 rounded-full" style={{ background: 'radial-gradient(circle, #000, transparent 70%)' }} />
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, transparent, #B89752 30%, #E8D9A8 50%, #B89752 70%, transparent)' }} />

      <div className="relative z-10 flex flex-col h-full">
        {/* Crest header */}
        {visibleFields.name && (
          <div className="flex flex-col items-center mb-5">
            <div className="p-[2px] rounded-full mb-3" style={{ background: 'linear-gradient(135deg, #E8D9A8, #B89752, #8A6E32)' }}>
              <AvatarEl user={user} initials={initials} size="w-24 h-24" shape="rounded-full" gradient="linear-gradient(135deg, #C9B27A, #8A6E32)" border="border-[3px] border-[#FCFAF4]" />
            </div>
            <h2 className="text-2xl font-800 text-center tracking-wide" style={{ color: '#2A2418' }}>{user.name}</h2>
            {visibleFields.position && positionName && (
              <p className="mt-1 text-[11px] font-700 uppercase tracking-[0.25em]" style={{ color: gold }}>{positionName}</p>
            )}
          </div>
        )}

        {/* Ornamental divider */}
        <div className="flex items-center gap-2 mb-5">
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(184,151,82,0.6))' }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: gold }} />
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(184,151,82,0.6), transparent)' }} />
        </div>

        {/* Info */}
        <div className="flex-1 space-y-3">
          {visibleFields.company && companyName && (
            <div className="flex justify-between items-baseline gap-3 pb-2" style={{ borderBottom: '1px dotted rgba(184,151,82,0.4)' }}>
              <span className="text-[10px] font-700 uppercase tracking-wider" style={{ color: gold }}>Công Ty</span>
              <span className="text-sm font-600 text-right" style={{ color: '#2A2418' }}>{companyName}</span>
            </div>
          )}
          {visibleFields.department && departmentName && (
            <div className="flex justify-between items-baseline gap-3 pb-2" style={{ borderBottom: '1px dotted rgba(184,151,82,0.4)' }}>
              <span className="text-[10px] font-700 uppercase tracking-wider" style={{ color: gold }}>Phòng Ban</span>
              <span className="text-sm font-600 text-right" style={{ color: '#2A2418' }}>{departmentName}</span>
            </div>
          )}
          {visibleFields.email && user.email && (
            <div className="flex justify-between items-baseline gap-3 pb-2" style={{ borderBottom: '1px dotted rgba(184,151,82,0.4)' }}>
              <span className="text-[10px] font-700 uppercase tracking-wider" style={{ color: gold }}>Email</span>
              <a href={`mailto:${user.email}`} className="text-xs font-500 text-right truncate" style={{ color: '#2A2418' }}>{user.email}</a>
            </div>
          )}
          {visibleFields.phone && user.phone && (
            <div className="flex justify-between items-baseline gap-3 pb-2" style={{ borderBottom: '1px dotted rgba(184,151,82,0.4)' }}>
              <span className="text-[10px] font-700 uppercase tracking-wider" style={{ color: gold }}>Điện Thoại</span>
              <a href={`tel:${user.phone}`} className="text-xs font-500 text-right" style={{ color: '#2A2418' }}>{user.phone}</a>
            </div>
          )}
        </div>

        {/* QR + Footer */}
        <div className="flex items-center justify-between pt-4 mt-2" style={{ borderTop: `1.5px solid ${gold}` }}>
          {visibleFields.qrcode && <QRCodeDisplay qrCodeUrl={qrCodeUrl} vcard={vcard} size="w-32 h-32" />}
          <p className="text-[11px] font-700 tracking-[0.25em]" style={{ color: gold }}>FADO GROUP</p>
        </div>
      </div>
    </div>
  );
}

// ============= TEMPLATE 10: Premium Modern =============
function Template10({ user, initials, visibleFields, companyName, departmentName, positionName, qrCodeUrl, vcard }: any) {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-2xl relative overflow-hidden" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
      {/* Background Gradient Shape */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-transparent to-cyan-50 rounded-3xl" />

      {/* Top Colored Bar */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-500" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Top Section */}
        <div className="flex gap-4 mb-4 pb-4 border-b-2 border-gray-100">
          {/* Avatar */}
          {visibleFields.name && (
            <AvatarEl user={user} initials={initials} size="w-20 h-20" shape="rounded-2xl" gradient="linear-gradient(135deg, #0284C7, #06B6D4)" />
          )}

          {/* Name & Position */}
          <div className="flex-1 flex flex-col justify-center">
            {visibleFields.name && (
              <h2 className="text-2xl font-800 text-gray-900">{user.name}</h2>
            )}
            {visibleFields.position && positionName && (
              <p className="text-xs font-700 text-cyan-600 mt-1 uppercase tracking-wide">{positionName}</p>
            )}
          </div>
        </div>

        {/* Middle Section */}
        <div className="flex-1 space-y-3 mb-4">
          {visibleFields.company && companyName && (
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MapPin size={12} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-700 mb-0.5">Công Ty</p>
                <p className="text-sm font-600 text-gray-900 truncate">{companyName}</p>
              </div>
            </div>
          )}

          {visibleFields.department && departmentName && (
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-cyan-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mail size={12} className="text-cyan-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-700 mb-0.5">Phòng Ban</p>
                <p className="text-sm font-600 text-gray-900 truncate">{departmentName}</p>
              </div>
            </div>
          )}

          {visibleFields.email && user.email && (
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mail size={12} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-700 mb-0.5">Email</p>
                <a href={`mailto:${user.email}`} className="text-xs text-blue-600 hover:text-blue-700 font-500 truncate block">
                  {user.email}
                </a>
              </div>
            </div>
          )}

          {visibleFields.phone && user.phone && (
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Phone size={12} className="text-teal-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 font-700 mb-0.5">Điện Thoại</p>
                <a href={`tel:${user.phone}`} className="text-xs text-teal-600 hover:text-teal-700 font-500">
                  {user.phone}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-4 border-t-2 border-gray-100">
          {visibleFields.qrcode && (
            <QRCodeDisplay qrCodeUrl={qrCodeUrl} vcard={vcard} size="w-32 h-32" />
          )}
          <p className="text-xs font-700 text-gray-600 tracking-wider">FADO GROUP</p>
        </div>
      </div>
    </div>
  );
}
