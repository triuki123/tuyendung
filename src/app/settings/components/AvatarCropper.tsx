'use client';

import { useState, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { X, Loader2 } from 'lucide-react';
import { useNotification } from '@/lib/useNotification';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface AvatarCropperProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onUploadSuccess: (avatarUrl: string) => void;
  /** Cập nhật localStorage/sidebar của NGƯỜI ĐANG ĐĂNG NHẬP (true = đổi ảnh của chính mình).
   *  Đặt false khi admin đổi ảnh cho user khác (tránh ghi đè avatar của chính admin). */
  applyToCurrentUser?: boolean;
}

export function AvatarCropper({ isOpen, onClose, userId, onUploadSuccess, applyToCurrentUser = true }: AvatarCropperProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showNotification } = useNotification();

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose, isOpen && !loading);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      showNotification('Kích thước ảnh không được vượt quá 1MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
      markDirty();
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const getCroppedImage = async (): Promise<Blob | null> => {
    if (!selectedImage || !croppedAreaPixels) return null;

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = selectedImage;

      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const scaleX = image.naturalWidth / image.width;
          const scaleY = image.naturalHeight / image.height;

          canvas.width = croppedAreaPixels.width;
          canvas.height = croppedAreaPixels.height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Cannot get canvas context'));
            return;
          }

          ctx.drawImage(
            image,
            croppedAreaPixels.x * scaleX,
            croppedAreaPixels.y * scaleY,
            croppedAreaPixels.width * scaleX,
            croppedAreaPixels.height * scaleY,
            0,
            0,
            croppedAreaPixels.width,
            croppedAreaPixels.height
          );

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create blob from canvas'));
              }
            },
            'image/jpeg',
            0.8
          );
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Image processing timeout'));
      }, 5000);
    });
  };

  const handleSave = async () => {
    if (!selectedImage) return;
    if (!userId || userId.trim() === '') {
      showNotification('Không thể xác định ID người dùng. Vui lòng đăng nhập lại.', 'error');
      return;
    }

    try {
      setLoading(true);
      setUploadProgress(0);

      let croppedBlob: Blob | null = null;
      try {
        croppedBlob = await getCroppedImage();
      } catch (cropError) {
        showNotification(cropError instanceof Error ? cropError.message : 'Không thể xử lý ảnh', 'error');
        setLoading(false);
        return;
      }

      if (!croppedBlob) {
        showNotification('Không thể xử lý ảnh', 'error');
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', croppedBlob, 'avatar.jpg');

      // Use XMLHttpRequest to track upload progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            setUploadProgress(Math.round(progress));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);

              // CHỈ cập nhật localStorage/sidebar của người đăng nhập khi đổi ảnh của chính mình.
              if (applyToCurrentUser) {
                const currentUserStr = localStorage.getItem('currentUser') || localStorage.getItem('assetflow_auth');
                if (currentUserStr) {
                  try {
                    const user = JSON.parse(currentUserStr);
                    user.avatar = response.data.url;
                    localStorage.setItem('currentUser', JSON.stringify(user));
                    localStorage.setItem('assetflow_auth', JSON.stringify(user));
                  } catch (e) {
                    console.warn('[AvatarCropper] Failed to update localStorage:', e);
                  }
                }
                window.dispatchEvent(new CustomEvent('userAvatarUpdated', {
                  detail: { userId, avatarUrl: response.data.url }
                }));
              }

              showNotification('Ảnh đại diện đã được cập nhật', 'success');

              onUploadSuccess(response.data.url);
              setSelectedImage(null);
              setUploadProgress(0);
              markClean();
              onClose();
              resolve();
            } catch (error) {
              reject(new Error('Phản hồi không hợp lệ từ server'));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              console.error('[AvatarCropper] Upload error:', error);
              reject(new Error(error.error || `Tải ảnh lên thất bại (${xhr.status})`));
            } catch {
              reject(new Error(`Tải ảnh lên thất bại (${xhr.status})`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          console.error('[AvatarCropper] Network error');
          reject(new Error('Lỗi mạng khi tải ảnh lên'));
        });

        const uploadUrl = `/api/users/${userId}/avatar`;
        xhr.open('POST', uploadUrl);
        xhr.send(formData);
      });
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Có lỗi xảy ra', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={guardedClose} />

      <div
        className="relative w-full max-w-lg rounded-2xl border border-line bg-slate-900/95 shadow-2xl modal-entrance"
        style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="text-lg font-600 text-foreground">Chỉnh Sửa Ảnh Đại Diện</h2>
          <button
            onClick={guardedClose}
            disabled={loading}
            className="p-1 hover:bg-hover-strong rounded-lg transition-colors disabled:opacity-50"
          >
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!selectedImage ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-full px-4 py-8 rounded-lg border-2 border-dashed border-line-strong hover:border-white/40 transition-colors flex flex-col items-center gap-3 disabled:opacity-50"
              >
                <div className="text-4xl">📷</div>
                <div>
                  <p className="text-sm font-medium text-foreground">Chọn ảnh để crop</p>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF, WebP • Max 1MB</p>
                </div>
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center py-8">
                <Loader2 size={32} className="animate-spin text-indigo-400" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Đang tải ảnh...</span>
                  <span className="text-foreground font-medium">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-hover-strong rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="relative w-full h-64 bg-black/50 rounded-lg overflow-hidden">
                  <Cropper
                    image={selectedImage}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onCropComplete={handleCropComplete}
                    onZoomChange={setZoom}
                  />
                </div>

                {/* Zoom Control */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Zoom</label>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-full h-2 bg-hover-strong rounded-full appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="text-xs text-muted-foreground text-center">{zoom.toFixed(1)}x</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {selectedImage && !loading && (
          <div className="flex gap-3 px-6 py-4 border-t border-line">
            <button
              onClick={() => {
                setSelectedImage(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="flex-1 px-4 py-2 rounded-lg border border-line hover:bg-hover text-foreground font-medium transition-colors"
            >
              Chọn Lại
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium transition-all disabled:opacity-50"
            >
              Lưu Ảnh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
