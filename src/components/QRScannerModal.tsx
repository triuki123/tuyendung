'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, AlertCircle, CheckCircle2, Loader } from 'lucide-react';
import { useNotification } from '@/lib/useNotification';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}

export function QRScannerModal({ isOpen, onClose, onScan }: QRScannerModalProps) {
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scannedRef = useRef<string | null>(null);
  const { showNotification } = useNotification();

  useEffect(() => {
    if (isOpen) {
      // Reset state mỗi lần mở
      setCameraError(null);
      setScannedData(null);
      setShowManualInput(false);
      scannedRef.current = null;
      // Chờ DOM render xong thẻ <video> rồi mới khởi tạo
      const t = setTimeout(() => initializeScanner(), 50);
      return () => {
        clearTimeout(t);
        stopScanner();
      };
    }
    return () => stopScanner();
  }, [isOpen]);

  const initializeScanner = async () => {
    setIsInitializing(true);
    setCameraError(null);

    // Camera chỉ truy cập được trong secure context (HTTPS hoặc localhost)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      handleCameraError(new Error('insecure-context'));
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setIsInitializing(false);
      return;
    }

    try {
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 400,
      });

      // Quét liên tục từ camera sau (facingMode environment). zxing tự gọi getUserMedia
      // → trình duyệt hiện prompt quyền; quét decode toàn khung video, ổn định trên iOS.
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video,
        (result) => {
          if (result) handleQRDetected(result.getText());
        }
      );
      controlsRef.current = controls;
      setIsInitializing(false);
    } catch (error: any) {
      handleCameraError(error);
    }
  };

  const handleCameraError = (error: any) => {
    console.error('❌ Scanner initialization error:', error);
    const msg = String(error?.message || error?.name || error || '');

    let userFriendlyError = 'Không thể khởi tạo camera';
    if (msg.includes('insecure-context')) {
      userFriendlyError = 'Trình duyệt chặn camera vì trang không chạy HTTPS. Vui lòng mở app qua địa chỉ https://.';
    } else if (/NotAllowed|Permission|denied/i.test(msg)) {
      userFriendlyError = 'Bạn chưa cấp quyền camera. Vào cài đặt trình duyệt → cho phép Camera với trang này rồi thử lại.';
    } else if (/NotFound|no camera|devices/i.test(msg)) {
      userFriendlyError = 'Không tìm thấy camera trên thiết bị.';
    } else if (/NotReadable|in use|track start/i.test(msg)) {
      userFriendlyError = 'Camera đang bị ứng dụng khác sử dụng. Hãy đóng app đó rồi thử lại.';
    }

    setCameraError(userFriendlyError);
    setIsInitializing(false);
    showNotification(`${userFriendlyError} Bạn có thể nhập thủ công.`, 'error');
  };

  const handleQRDetected = (data: string) => {
    const value = (data || '').trim();
    if (value && value !== scannedRef.current) {
      scannedRef.current = value;
      setScannedData(value);
      stopScanner();

      // Auto-submit sau một nhịp ngắn để người dùng thấy phản hồi "đã quét"
      setTimeout(() => {
        onScan(value);
        setScannedData(null);
        setManualInput('');
        onClose();
      }, 400);
    }
  };

  const stopScanner = () => {
    if (controlsRef.current) {
      try { controlsRef.current.stop(); } catch { /* noop */ }
      controlsRef.current = null;
    }
    // Giải phóng hẳn track camera (chống đèn camera còn sáng / chiếm thiết bị)
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach(t => { try { t.stop(); } catch { /* noop */ } });
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  };

  const handleManualScan = () => {
    if (!manualInput.trim()) {
      showNotification('Vui lòng nhập mã hoặc ID', 'error');
      return;
    }

    onScan(manualInput.trim());
    setManualInput('');
    setScannedData(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      {/* Full screen camera scanner */}
      <div
        className="w-full h-full flex flex-col items-center justify-center"
        onClick={e => e.stopPropagation()}
      >
        {/* Camera Scanner Container - Full Screen */}
        <div className="flex-1 w-full flex items-center justify-center relative">
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
              <div className="max-w-md space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex gap-3">
                  <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-500 text-red-400">Lỗi Camera</p>
                    <p className="text-sm text-red-300 mt-2">{cameraError}</p>
                  </div>
                </div>

                {/* Troubleshooting tips */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <p className="text-sm font-500 text-amber-400 mb-2">💡 Cách khắc phục:</p>
                  <ul className="text-sm text-amber-300 space-y-1 list-disc list-inside">
                    <li>Kiểm tra cài đặt quyền camera trong trình duyệt</li>
                    <li>Đóng các ứng dụng khác đang sử dụng camera</li>
                    <li>Tải lại trang (Ctrl+R hoặc Cmd+R)</li>
                    <li>Thử trình duyệt khác (Chrome, Firefox, Safari)</li>
                  </ul>
                </div>

                <button
                  onClick={() => setShowManualInput(true)}
                  className="w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-500 text-sm transition-colors"
                >
                  Nhập Thủ Công Thay Thế
                </button>
              </div>
            </div>
          ) : (
            <>
              {isInitializing && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <Loader size={48} className="text-indigo-400 animate-spin mx-auto mb-4" />
                    <p className="text-lg text-indigo-300 font-500">Khởi động camera...</p>
                  </div>
                </div>
              )}

              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                style={{ minHeight: '100%' }}
                muted
                playsInline
                autoPlay
              />

              {/* Khung ngắm — chỉ để canh mã (decode vẫn quét toàn khung) */}
              {!isInitializing && !scannedData && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="relative w-64 h-64 max-w-[70vw] max-h-[70vw]">
                    <span className="absolute -top-px -left-px w-8 h-8 border-t-4 border-l-4 border-white/90 rounded-tl-xl" />
                    <span className="absolute -top-px -right-px w-8 h-8 border-t-4 border-r-4 border-white/90 rounded-tr-xl" />
                    <span className="absolute -bottom-px -left-px w-8 h-8 border-b-4 border-l-4 border-white/90 rounded-bl-xl" />
                    <span className="absolute -bottom-px -right-px w-8 h-8 border-b-4 border-r-4 border-white/90 rounded-br-xl" />
                  </div>
                  <p className="mt-6 text-sm text-white/80 px-6 text-center">Đưa mã QR vào trong khung để quét</p>
                </div>
              )}

              {/* Scanned data feedback overlay */}
              {scannedData && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                  <div className="bg-green-500/20 border border-green-500/50 rounded-2xl p-8 flex gap-4 max-w-md">
                    <CheckCircle2 size={28} className="text-green-400 flex-shrink-0" />
                    <div>
                      <p className="text-lg font-600 text-green-400">Quét thành công!</p>
                      <p className="text-sm text-green-300 mt-2 break-all">{scannedData}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Manual Input Overlay */}
        {showManualInput && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-[#0f1c2e] rounded-2xl border border-line p-6 w-full max-w-md">
              <h3 className="text-lg font-600 text-foreground mb-4">Nhập Mã QR / ID</h3>
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleManualScan();
                  }
                }}
                placeholder="VD: room_a101 hoặc AF-HW-0001"
                className="w-full h-11 px-4 rounded-lg text-sm bg-surface-2 border border-line text-foreground placeholder:text-ink-faint focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowManualInput(false);
                    setManualInput('');
                  }}
                  className="flex-1 h-10 rounded-lg bg-hover hover:bg-hover-strong text-muted-foreground font-500 text-sm transition-colors"
                >
                  Quay Lại
                </button>
                <button
                  onClick={handleManualScan}
                  className="flex-1 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-500 text-sm transition-colors"
                >
                  Xác Nhận
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Top Action Bar — chừa vùng an toàn (Dynamic Island / status bar iPhone) */}
        <div
          className="absolute top-0 left-0 right-0 px-4 pb-3 flex items-center justify-between"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors text-white bg-black/50"
            title="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        {/* Bottom Action Bar */}
        {!showManualInput && !cameraError && (
          <div
            className="absolute bottom-0 left-0 right-0 px-6 pt-6 flex justify-center"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
          >
            <button
              onClick={() => setShowManualInput(true)}
              className="px-6 h-10 rounded-lg bg-hover-strong hover:bg-white/20 text-foreground font-500 text-sm transition-colors backdrop-blur-sm"
            >
              Nhập Thủ Công
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
