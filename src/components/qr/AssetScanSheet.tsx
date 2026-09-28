'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { Asset } from '@/lib/mockData';
import AssetDetailModal from '@/app/asset-management/components/AssetDetailModal';
import AssetInventoryModal from '@/app/asset-management/components/AssetInventoryModal';
import { getCurrentUser, isSuperAdmin } from '@/lib/authStore';
import { canAccessInherited } from '@/lib/permissions';

interface AssetScanSheetProps {
  code: string;
  onClose: () => void;
}

/** Map 1 dòng assets (đã JOIN tên) sang kiểu Asset của UI. */
function mapAsset(a: any): Asset {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    brand: a.brand,
    model: a.model,
    serialNumber: a.serial_number,
    status: a.status,
    assignedTo: a.assigned_to,
    assignedToName: a.assigned_to_name,
    company: a.company_id,
    division: a.department_id,
    department: a.sub_department_id,
    purchaseDate: a.purchase_date,
    warrantyExpiry: a.warranty_expiry,
    value: a.value,
    condition: a.condition,
    location: a.location,
    notes: a.notes,
    imageUrl: a.image_url,
    history: [],
    categoryName: a.category_name,
    companyName: a.company_name,
    divisionName: a.department_name,
    departmentName: a.sub_department_name,
  };
}

/**
 * Quét QR tài sản từ bất cứ đâu → tải tài sản theo mã rồi mở thẳng "Lý lịch tài sản"
 * (tương tự RoomScanSheet cho phòng họp). Không cần vào trang Quản lý tài sản.
 */
export default function AssetScanSheet({ code, onClose }: AssetScanSheetProps) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  // Có quyền kiểm kê khi quét? super_admin hoặc có quyền SỬA tài sản (hardware, kế thừa asset-management).
  const canInventory = useMemo(() => {
    const u = getCurrentUser() as any;
    return isSuperAdmin(u) || canAccessInherited(u?.module_permissions, 'hardware', 'edit');
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [res, catMap, coMap] = await Promise.all([
          fetch(`/api/assets/by-code/${encodeURIComponent(code)}`),
          fetch('/api/asset-categories').then(r => r.json()).then(j => {
            const m: Record<string, string> = {};
            (j?.data || []).forEach((c: any) => { m[String(c.id)] = c.name; });
            return m;
          }).catch(() => ({} as Record<string, string>)),
          fetch('/api/organizations/companies').then(r => r.json()).then(j => {
            const arr = Array.isArray(j) ? j : (j?.data || []);
            const m: Record<string, string> = {};
            arr.forEach((c: any) => { m[String(c.id)] = c.name; });
            return m;
          }).catch(() => ({} as Record<string, string>)),
        ]);
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) { setError(json.error || 'Không tìm thấy tài sản'); return; }
        const mapped = mapAsset(json.data);
        mapped.categoryName = mapped.categoryName || catMap[String(mapped.category)];
        mapped.companyName = mapped.companyName || coMap[String(mapped.company)];
        setAsset(mapped);
      } catch {
        if (alive) setError('Lỗi kết nối khi tải tài sản');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [code]);

  if (asset) {
    // Có quyền → mở thẳng khu Kiểm kê (thu hồi/bảo trì/cấp phát/thanh lý) ngay từ QR.
    if (inventoryOpen) {
      return (
        <AssetInventoryModal
          asset={asset}
          onClose={() => setInventoryOpen(false)}
          onSaved={() => { setInventoryOpen(false); onClose(); }}
        />
      );
    }
    return (
      <AssetDetailModal
        asset={asset}
        onClose={onClose}
        onInventory={canInventory ? () => setInventoryOpen(true) : undefined}
      />
    );
  }

  // Khung chờ / lỗi (trước khi có dữ liệu tài sản)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-white/10 p-6"
        style={{ background: 'var(--card)' }}
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
            <p className="text-sm text-muted-foreground">Đang tải tài sản…</p>
            <p className="text-2xs text-muted-foreground/60 font-mono">{code}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <AlertCircle className="h-9 w-9 text-red-400/70" />
            <p className="text-sm text-foreground">{error}</p>
            <p className="text-2xs text-muted-foreground/60 font-mono">{code}</p>
            <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm mt-1 flex items-center gap-1.5">
              <X className="h-4 w-4" /> Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
