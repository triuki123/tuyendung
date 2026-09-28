'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Plus, Download, Upload, Filter, AlertTriangle, CheckCircle, Settings, Columns3, QrCode } from 'lucide-react';
import { Asset, MOCK_ASSETS, AssetCategory, AssetStatus, DEPARTMENTS, DeleteRequest, MockUser } from '@/lib/mockData';
import { isSuperAdmin } from '@/lib/authStore';
import { canAccess } from '@/lib/permissions';
import {
  fetchAssets, createAsset, updateAsset, deleteAsset as deleteAssetAPI, createDeleteRequest,
  fetchHardware, createHardware, updateHardware, deleteHardware
} from '@/lib/api-client';
import AssetTable, { ALL_COLUMNS } from './AssetTable';
import AssetFilters from './AssetFilters';
import AssetModal from './AssetModal';
import AssetHistoryDrawer from './AssetHistoryDrawer';
import AssetQRModal from './AssetQRModal';
import BulkQRPrintModal from './BulkQRPrintModal';
import AssetDetailModal from './AssetDetailModal';
import AssetInventoryModal from './AssetInventoryModal';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import ErrorState from '@/components/ui/ErrorState';

export interface FilterState {
  search: string;
  category: AssetCategory | '';
  status: AssetStatus | '';
  department: string;
}

// In-memory store for delete requests (shared across sessions in this demo)
let globalDeleteRequests: DeleteRequest[] = [];

export default function AssetManagementClient({ assetType = 'hardware' }: { assetType?: string }) {
  const FALLBACK_CATEGORIES: string[] = ['Laptop', 'Màn hình', 'Điện thoại', 'Máy in', 'Máy tính bảng', 'Thiết bị mạng', 'Máy chủ', 'Phụ kiện'];
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetCategories, setAssetCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ search: '', category: '', status: '', department: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [serverSyncedFilters, setServerSyncedFilters] = useState<FilterState>({ search: '', category: '', status: '', department: '' });

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [viewAsset, setViewAsset] = useState<Asset | null>(null);
  const [inventoryAsset, setInventoryAsset] = useState<Asset | null>(null);
  const [deleteAsset, setDeleteAsset] = useState<Asset | null>(null);
  const [deleteRequestModal, setDeleteRequestModal] = useState<Asset | null>(null);
  const [deleteRequestReason, setDeleteRequestReason] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importPreviewError, setImportPreviewError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Mã tài sản từ QR (deep-link ?assetCode=...) — mở chi tiết khi danh sách đã tải
  const [scanAssetCode, setScanAssetCode] = useState<string | null>(null);
  // Popup cảnh báo số serial trùng
  const [duplicateSerialError, setDuplicateSerialError] = useState<string | null>(null);
  // Lý do xóa (xóa trực tiếp — bắt buộc) cho 1 tài sản và cho xóa hàng loạt
  const [deleteReason, setDeleteReason] = useState('');
  const [bulkDeleteReason, setBulkDeleteReason] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkQROpen, setBulkQROpen] = useState(false);

  // ESC đóng các hộp thoại inline (xác nhận/lỗi) trong trang này.
  const closeInlineDialogs = () => {
    if (deleteAsset) { setDeleteAsset(null); setDeleteReason(''); }
    if (bulkDeleteConfirm) setBulkDeleteConfirm(false);
    if (duplicateSerialError) setDuplicateSerialError(null);
    if (deleteRequestModal) { setDeleteRequestModal(null); setDeleteRequestReason(''); }
  };
  useEscapeKey(
    closeInlineDialogs,
    Boolean(deleteAsset || bulkDeleteConfirm || duplicateSerialError || deleteRequestModal),
  );

  // Sort
  const [sortCol, setSortCol] = useState<keyof Asset>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Column visibility
  const STORAGE_KEY = 'asset_table_visible_cols';
  const defaultCols = new Set(ALL_COLUMNS.map(c => c.key as string));
  const [visibleCols, setVisibleCols] = useState<Set<string>>(defaultCols);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  const initialFiltersLoaded = useRef(false);

  useEffect(() => {
    setMounted(true);
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }

    // Khôi phục cột hiển thị từ localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: string[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const migrated = parsed.map(col => (col === 'department' ? 'company' : col));
          setVisibleCols(new Set(migrated));
        }
      } catch { /* bỏ qua */ }
    }

    // Đóng dropdown khi click ngoài
    const handleClickOutside = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    const loadCategories = async () => {
      try {
        const res = await fetch('/api/asset-categories');
        const json = await res.json();
        const list = json?.success && Array.isArray(json.data)
          ? json.data.map((c: any) => c.name).filter(Boolean)
          : [];
        if (list.length > 0) setAssetCategories(list);
      } catch {
        setAssetCategories(FALLBACK_CATEGORIES);
      }
    };
    loadCategories();
    const loadCompanies = async () => {
      try {
        const res = await fetch('/api/organizations/companies');
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json?.data || []);
        const names = list.map((c: any) => c.name).filter(Boolean);
        if (names.length > 0) setCompanies(names);
      } catch {
        setCompanies([]);
      }
    };
    loadCompanies();

    // Deep-link từ quét QR tài sản: ?assetCode=CODE → lọc theo mã + mở chi tiết
    const urlParams = new URLSearchParams(window.location.search);
    const assetCode = urlParams.get('assetCode');
    if (assetCode) {
      setScanAssetCode(assetCode);
      setFilters(f => ({ ...f, search: assetCode }));
      urlParams.delete('assetCode');
      const qs = urlParams.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    const urlFilters: Partial<FilterState> = {};
    const urlSearch = urlParams.get('search');
    const urlStatus = urlParams.get('status') as AssetStatus | null;
    const urlCategory = urlParams.get('category') as AssetCategory | null;
    const urlDepartment = urlParams.get('department');
    if (urlSearch) urlFilters.search = urlSearch;
    if (urlStatus) urlFilters.status = urlStatus;
    if (urlCategory) urlFilters.category = urlCategory;
    if (urlDepartment) urlFilters.department = urlDepartment;
    if (Object.keys(urlFilters).length > 0) {
      setFilters(f => ({ ...f, ...urlFilters }));
    }
    initialFiltersLoaded.current = true;

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Khi danh sách đã tải, mở chi tiết đúng tài sản vừa quét
  useEffect(() => {
    if (!scanAssetCode || assets.length === 0) return;
    const found = assets.find(a => a.code?.toLowerCase() === scanAssetCode.toLowerCase());
    if (found) setViewAsset(found);
    setScanAssetCode(null);
  }, [scanAssetCode, assets]);

  const loadAssets = async () => {
      try {
        setLoading(true);
        setLoadError(false);
        let assetsData;

        // Use hardware-specific API for hardware type
        if (assetType === 'hardware') {
          const response: any = await fetchHardware({
            search: serverSyncedFilters.search || undefined,
            status: serverSyncedFilters.status || undefined,
            category: serverSyncedFilters.category || undefined,
            company: serverSyncedFilters.department || undefined,
            page,
            perPage,
          });
          assetsData = response?.data ?? [];
          setTotalCount(response?.meta?.total ?? 0);
          setTotalPages(response?.meta?.totalPages ?? 1);
        } else {
          assetsData = await fetchAssets({
            status: serverSyncedFilters.status || undefined,
            department: serverSyncedFilters.department || undefined,
          });
          const total = Array.isArray(assetsData) ? assetsData.length : 0;
          setTotalCount(total);
          setTotalPages(Math.max(1, Math.ceil(total / perPage)));
        }

        // Bản đồ id→tên để RESOLVE tên ở client (fallback khi JOIN ở API trả null,
        // vd asset tham chiếu id loại/công ty cũ). Lỗi mạng thì bỏ qua, vẫn dùng JOIN.
        const [catMap, coMap] = await Promise.all([
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

        const mappedAssets = (Array.isArray(assetsData) ? assetsData : []).map((asset: any) => {
          // All use assets table format now
          return {
            id: asset.id,
            code: asset.code,
            name: asset.name,
            category: asset.category,
            brand: asset.brand,
            model: asset.model,
            serialNumber: asset.serial_number,
            status: asset.status,
            assignedTo: asset.assigned_to,
            assignedToName: asset.assigned_to_name,
            company: asset.company_id,
            division: asset.department_id,
            department: asset.sub_department_id,
            purchaseDate: asset.purchase_date,
            warrantyExpiry: asset.warranty_expiry,
            warrantyStatus: asset.warranty_status,
            warrantyMonths: asset.warranty_months,
            value: asset.value,
            condition: asset.condition,
            location: asset.location,
            notes: asset.notes,
            imageUrl: asset.image_url,
            history: [],
            // Tên hiển thị: ưu tiên JOIN ở API, fallback bản đồ client, cuối cùng id
            categoryName: asset.category_name || catMap[String(asset.category)],
            companyName: asset.company_name || coMap[String(asset.company_id)],
            divisionName: asset.department_name,
            departmentName: asset.sub_department_name,
          };
        });
        setAssets(mappedAssets);
      } catch (error) {
        console.error('Failed to load assets:', error);
        setLoadError(true);
        setAssets([]);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetType, serverSyncedFilters, page, perPage]);

  useEffect(() => {
    const t = setTimeout(() => setServerSyncedFilters(filters), 250);
    return () => clearTimeout(t);
  }, [filters]);

  useEffect(() => {
    if (!mounted || !initialFiltersLoaded.current) return;
    const params = new URLSearchParams(window.location.search);
    const setParam = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };
    setParam('search', filters.search.trim());
    setParam('status', filters.status);
    setParam('category', filters.category);
    setParam('department', filters.department);
    window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  }, [filters, mounted]);

  const filtered = useMemo(() => {
    let result = [...assets];
    if (assetType !== 'hardware' && filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(a =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.serialNumber?.toLowerCase() ?? '').includes(q) ||
        (a.assignedToName ?? '').toLowerCase().includes(q)
      );
    }
    if (assetType !== 'hardware' && filters.category) {
      result = result.filter(a => a.category === filters.category);
    }
    if (assetType !== 'hardware' && filters.status) {
      result = result.filter(a => a.status === filters.status);
    }
    if (filters.department) {
      result = result.filter(a =>
        a.divisionName === filters.department ||
        a.departmentName === filters.department ||
        a.department === filters.department
      );
    }

    result.sort((a, b) => {
      const aVal = a[sortCol] ?? '';
      const bVal = b[sortCol] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal), 'vi');
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [assets, filters, assetType, sortCol, sortDir]);

  const paginated = assetType === 'hardware'
    ? filtered
    : filtered.slice((page - 1) * perPage, page * perPage);
  const activeFilterCount = [filters.search, filters.status, filters.category, filters.department].filter(Boolean).length;

  const handleSort = (col: keyof Asset) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const mapApiAsset = (a: any): Asset => ({
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
    warrantyStatus: a.warranty_status,
    warrantyMonths: a.warranty_months,
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
  });

  const handleCreate = async (data: Omit<Asset, 'id' | 'history'>) => {
    try {
      const newAsset = await createHardware({
        code: data.code,
        name: data.name,
        category: data.category,
        brand: data.brand || null,
        model: data.model || null,
        serial_number: data.serialNumber || null,
        status: data.status || 'active',
        assigned_to: data.assignedTo || null,
        assigned_to_name: data.assignedToName || null,
        company_id: data.company || null,
        department_id: data.division || null,
        sub_department_id: data.department || null,
        purchase_date: data.purchaseDate || null,
        warranty_expiry: data.warrantyExpiry || null,
        warranty_status: data.warrantyStatus || null,
        warranty_months: data.warrantyMonths || null,
        value: data.value || null,
        condition: data.condition || null,
        location: data.location || null,
        notes: data.notes || null,
        image_url: data.imageUrl || '',
      });

      setAssets(prev => [mapApiAsset(newAsset), ...prev]);
      setCreateModalOpen(false);
    } catch (error: any) {
      console.error('Failed to create asset:', error);
      if (error?.status === 409 && error?.code === 'DUPLICATE_SERIAL') {
        setDuplicateSerialError(error.message);
      } else if (error?.status === 409 && error?.code === 'DUPLICATE_CODE') {
        toast.warning(error.message);
      } else {
        toast.error(`Không thể tạo tài sản. Lỗi: ${error.message || 'Lỗi không xác định'}. Vui lòng kiểm tra lại thông tin và thử lại.`);
      }
    }
  };

  const handleEdit = async (data: Asset) => {
    try {
      const updatedAsset = await updateHardware(data.id, {
        code: data.code,
        name: data.name,
        category: data.category,
        brand: data.brand || null,
        model: data.model || null,
        serial_number: data.serialNumber || null,
        status: data.status || 'active',
        assigned_to: data.assignedTo || null,
        assigned_to_name: data.assignedToName || null,
        company_id: data.company || null,
        department_id: data.division || null,
        sub_department_id: data.department || null,
        purchase_date: data.purchaseDate || null,
        warranty_expiry: data.warrantyExpiry || null,
        warranty_status: data.warrantyStatus || null,
        warranty_months: data.warrantyMonths || null,
        value: data.value || null,
        condition: data.condition || null,
        location: data.location || null,
        notes: data.notes || null,
        image_url: data.imageUrl || '',
      });

      setAssets(prev => prev.map(a => a.id === data.id ? { ...mapApiAsset(updatedAsset), history: a.history } : a));
      setEditAsset(null);
    } catch (error: any) {
      console.error('Failed to update asset:', error);
      if (error?.status === 409 && error?.code === 'DUPLICATE_SERIAL') {
        setDuplicateSerialError(error.message);
      } else {
        toast.error(`Không thể cập nhật tài sản. Lỗi: ${error.message || 'Lỗi không xác định'}`);
      }
    }
  };

  // Người được xóa trực tiếp: super_admin VÀ có quyền 'delete' ở Quản Lý Tài Sản
  const canDeleteAssets =
    isSuperAdmin(currentUser) &&
    canAccess(currentUser?.module_permissions, 'asset-management', 'delete');

  // Xóa trực tiếp (cần quyền) — bắt buộc lý do
  const handleDelete = async () => {
    if (!deleteAsset) return;
    const reason = deleteReason.trim();
    if (!reason) {
      toast.error('Vui lòng nhập lý do xóa tài sản.');
      return;
    }
    setActionBusy(true);
    try {
      if (assetType === 'hardware') {
        await deleteHardware(deleteAsset.id, reason);
      } else {
        await deleteAssetAPI(deleteAsset.id, reason);
      }
      setAssets(prev => prev.filter(a => a.id !== deleteAsset.id));
      setDeleteAsset(null);
      setDeleteReason('');
      toast.success('Đã xóa tài sản');
    } catch (error: any) {
      console.error('Failed to delete asset:', error);
      toast.error(`Không thể xóa tài sản. Lỗi: ${error.message || 'Vui lòng thử lại.'}`);
    } finally {
      setActionBusy(false);
    }
  };

  // Admin: send delete request to Super Admin
  const handleRequestDelete = async () => {
    if (!deleteRequestModal || !currentUser) return;
    setActionBusy(true);
    try {
      await createDeleteRequest({
        asset_id: deleteRequestModal.id,
        asset_code: deleteRequestModal.code,
        asset_name: deleteRequestModal.name,
        asset_type: assetType,
        requested_by: currentUser.id,
        requested_by_name: currentUser.name,
        requested_at: new Date().toISOString(),
        reason: deleteRequestReason,
        status: 'pending',
      });
      setDeleteRequestModal(null);
      setDeleteRequestReason('');
      setRequestSent(true);
      setTimeout(() => setRequestSent(false), 4000);
    } catch (error) {
      console.error('Failed to create delete request:', error);
      toast.error('Không thể gửi yêu cầu xóa. Vui lòng thử lại.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    const reason = bulkDeleteReason.trim();
    if (!reason) {
      toast.error('Vui lòng nhập lý do xóa.');
      return;
    }
    setActionBusy(true);
    try {
      // For each selected ID, check if it's hardware and call correct delete API
      await Promise.all(Array.from(selectedIds).map(id => {
        const asset = assets.find(a => a.id === id);
        if (!asset) return Promise.resolve();

        // Use correct delete API based on asset type
        if (assetType === 'hardware') {
          return deleteHardware(id, reason);
        } else {
          return deleteAssetAPI(id, reason);
        }
      }));

      // Remove deleted items from UI
      setAssets(prev => prev.filter(a => !selectedIds.has(a.id)));
      const deletedCount = selectedIds.size;
      setSelectedIds(new Set());
      setBulkDeleteReason('');
      toast.success(`Đã xóa thành công ${deletedCount} tài sản`);
    } catch (error: any) {
      console.error('Failed to delete assets:', error);
      toast.error(`Không thể xóa một số tài sản. Lỗi: ${error.message || 'Vui lòng thử lại.'}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(paginated.map(a => a.id)));
    else setSelectedIds(new Set());
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleCol = (key: string, required: boolean) => {
    if (required) return;
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // Định tuyến nút xóa: có quyền xóa → xóa trực tiếp (kèm lý do);
  // không có quyền → gửi yêu cầu xóa cho người duyệt.
  const handleDeleteClick = (asset: Asset) => {
    if (canDeleteAssets) {
      setDeleteReason('');
      setDeleteAsset(asset);
    } else {
      setDeleteRequestModal(asset);
    }
  };

  const normalizeText = (value: any) => String(value ?? '').trim();
  const toNullableNumber = (value: any) => {
    const n = Number(String(value ?? '').replace(/[,\s]/g, ''));
    return Number.isFinite(n) && String(value ?? '').trim() !== '' ? n : null;
  };

  const pick = (row: Record<string, any>, keys: string[]) => {
    for (const key of keys) {
      const found = Object.keys(row).find(k => k.trim().toLowerCase() === key.trim().toLowerCase());
      if (found) return row[found];
    }
    return '';
  };

  const parseCsvText = (text: string) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;

    const pushCell = () => {
      row.push(cell);
      cell = '';
    };

    const pushRow = () => {
      if (row.length > 0 || cell !== '') rows.push(row);
      row = [];
    };

    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < normalized.length; i += 1) {
      const ch = normalized[i];
      const next = normalized[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cell += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        continue;
      }

      if (ch === ',') {
        pushCell();
        continue;
      }

      if (ch === '\n') {
        pushCell();
        pushRow();
        continue;
      }

      cell += ch;
    }

    pushCell();
    pushRow();

    const headers = (rows.shift() || []).map(h => h.trim());
    return rows
      .filter(r => r.some(cellValue => String(cellValue ?? '').trim() !== ''))
      .map(r => {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          obj[h] = r[idx] ?? '';
        });
        return obj;
      });
  };

  const parseImportRows = async (file: File) => {
    setImportBusy(true);
    setImportPreviewError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let rows: Record<string, any>[] = [];
      if (ext === 'csv') {
        const text = await file.text();
        rows = parseCsvText(text);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const first = wb.SheetNames[0];
        if (!first) throw new Error('File Excel không có sheet nào');
        rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[first], { defval: '' });
      } else {
        throw new Error('Chỉ hỗ trợ CSV hoặc Excel (.xlsx, .xls)');
      }

      const mapped = rows.map((row, index) => {
        const code = normalizeText(pick(row, ['code', 'mã tài sản', 'ma tai san', 'asset code']));
        const name = normalizeText(pick(row, ['name', 'tên tài sản', 'ten tai san', 'asset name']));
        const category = normalizeText(pick(row, ['category', 'loại', 'loai', 'asset category']));
        const company = normalizeText(pick(row, ['company', 'công ty', 'cong ty']));
        const department = normalizeText(pick(row, ['department', 'phòng ban', 'phong ban']));
        const assignedToName = normalizeText(pick(row, ['assigned_to_name', 'người dùng', 'nguoi dung', 'assigned user']));
        return {
          rowNumber: index + 2,
          code,
          name,
          category,
          brand: normalizeText(pick(row, ['brand', 'hãng', 'hang'])),
          model: normalizeText(pick(row, ['model', 'mẫu', 'mau'])),
          serialNumber: normalizeText(pick(row, ['serial', 'serial number', 'số serial', 'so serial'])),
          status: normalizeText(pick(row, ['status', 'trạng thái', 'trang thai'])) || 'available',
          company,
          department,
          assignedToName,
          value: toNullableNumber(pick(row, ['value', 'giá trị', 'gia tri'])),
          location: normalizeText(pick(row, ['location', 'vị trí', 'vi tri'])),
          notes: normalizeText(pick(row, ['notes', 'ghi chú', 'ghi chu'])),
          errors: [] as string[],
        };
      }).filter(r => r.code || r.name || r.category || r.serialNumber);

      if (mapped.length === 0) {
        throw new Error('Không tìm thấy dòng dữ liệu hợp lệ');
      }

      setImportFileName(file.name);
      setImportRows(mapped);
      setImportModalOpen(true);
    } catch (error: any) {
      setImportPreviewError(error?.message || 'Không đọc được file import');
      setImportModalOpen(true);
    } finally {
      setImportBusy(false);
    }
  };

  const handleImportConfirm = async () => {
    if (assetType !== 'hardware') return;
    const candidates = importRows.map((row) => {
      const errors: string[] = [];
      if (!row.code) errors.push('Thiếu mã tài sản');
      if (!row.name) errors.push('Thiếu tên tài sản');
      if (!row.category) errors.push('Thiếu loại tài sản');
      if (!row.company) errors.push('Thiếu công ty');
      return { ...row, errors };
    });
    setImportRows(candidates);
    const validRows = candidates.filter(r => r.errors.length === 0);
    if (validRows.length === 0) {
      toast.error('Không có dòng hợp lệ để import.');
      return;
    }
    setImportBusy(true);
    try {
      let success = 0;
      let failed = 0;
      for (const row of validRows) {
        try {
          await createHardware({
            code: row.code,
            name: row.name,
            category: row.category,
            brand: row.brand || null,
            model: row.model || null,
            serial_number: row.serialNumber || null,
            status: row.status || 'available',
            assigned_to_name: row.assignedToName || null,
            company_id: row.company || null,
            location: row.location || null,
            notes: row.notes || null,
            value: row.value || null,
          });
          success += 1;
        } catch (err: any) {
          failed += 1;
          row.errors.push(err?.message || 'Lỗi import');
        }
      }
      setImportRows([...candidates]);
      toast.success(`Import xong: ${success} thành công, ${failed} lỗi.`);
      if (success > 0) {
        setImportModalOpen(false);
        setImportFileName('');
        setImportRows([]);
        setPage(1);
        await loadAssets();
      }
    } finally {
      setImportBusy(false);
    }
  };

  const STATUSES: { value: AssetStatus; label: string }[] = [
    { value: 'available', label: 'Sẵn sàng' },
    { value: 'assigned', label: 'Đang dùng' },
    { value: 'maintenance', label: 'Bảo trì' },
    { value: 'broken', label: 'Hỏng' },
    { value: 'retired', label: 'Thanh lý' },
  ];

  if (!mounted) {
    return <div className="space-y-5" />;
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
            <h1 className="text-xl sm:text-2xl font-700 text-foreground">Quản Lý Tài Sản</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {loading ? 'Đang tải...' : `${totalCount || filtered.length} tài sản · ${assets.filter(a => a.status === 'available').length} sẵn sàng · ${assets.filter(a => a.status === 'broken').length} hỏng`}
            </p>
          </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterOpen(prev => !prev)}
            className={`flex items-center gap-2 h-9 px-3 sm:px-4 rounded-xl text-sm font-500 transition-all ${filterOpen ? 'btn-indigo' : 'btn-ghost'}`}
          >
            <Filter size={15} />
            <span className="hidden xs:inline">Bộ lọc</span>
            {activeFilterCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            )}
          </button>

          {/* Column picker */}
          <div className="relative hidden sm:block" ref={colPickerRef}>
            <button
              onClick={() => setColPickerOpen(v => !v)}
              className={`flex items-center gap-2 h-9 px-3 sm:px-4 rounded-xl text-sm font-500 transition-all ${colPickerOpen ? 'btn-indigo' : 'btn-ghost'}`}
              title="Tuỳ chỉnh cột hiển thị"
            >
              <Columns3 size={15} />
              <span className="hidden sm:inline">Cột</span>
              {visibleCols.size < ALL_COLUMNS.length && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
            </button>
            {colPickerOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-40 w-52 rounded-2xl border border-white/10 shadow-xl overflow-hidden"
                style={{ background: 'var(--card)' }}
              >
                <div className="px-4 py-3 border-b border-white/08">
                  <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Cột hiển thị</p>
                </div>
                <div className="py-2">
                  {ALL_COLUMNS.map(col => {
                    const isRequired = !!col.required;
                    const isVisible = visibleCols.has(col.key as string);
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${isRequired ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/05'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          disabled={isRequired}
                          onChange={() => toggleCol(col.key as string, isRequired)}
                          className="w-3.5 h-3.5 rounded border-white/20 accent-indigo"
                        />
                        <span className={isVisible ? 'text-foreground' : 'text-muted-foreground'}>
                          {col.label}
                        </span>
                        {isRequired && (
                          <span className="ml-auto text-2xs text-muted-foreground/50">Cố định</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <div className="px-4 py-2.5 border-t border-white/08">
                  <button
                    onClick={() => {
                      const all = new Set(ALL_COLUMNS.map(c => c.key as string));
                      setVisibleCols(all);
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(all)));
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Hiện tất cả
                  </button>
                </div>
              </div>
            )}
          </div>
          <button className="hidden sm:flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-500 btn-ghost">
            <Upload size={15} />
            <label className="cursor-pointer">
              <span onClick={() => importInputRef.current?.click()}>Import</span>
            </label>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void parseImportRows(file);
              e.currentTarget.value = '';
            }}
          />
          <button className="hidden sm:flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-500 btn-ghost">
            <Download size={15} />
            Export
          </button>
          {isSuperAdmin(currentUser) && (
            <Link href="/asset-management/admin/config"
              className="hidden sm:flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-500 btn-ghost">
              <Settings size={15} />
              Cấu hình
            </Link>
          )}
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 h-9 px-3 sm:px-4 rounded-xl text-sm font-600 btn-accent ml-auto sm:ml-0"
          >
            <Plus size={15} />
            <span className="hidden xs:inline">Thêm Tài Sản</span>
            <span className="xs:hidden">Thêm</span>
          </button>
        </div>
      </div>

      {/* Request sent notification */}
      {requestSent && (
        <div className="flex items-center gap-3 p-4 rounded-2xl fade-in" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <CheckCircle size={18} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300">✅ Yêu cầu xóa tài sản đã được gửi đến Admin Master để phê duyệt.</p>
        </div>
      )}

      {/* Filters */}
      {filterOpen && (
          <AssetFilters
          filters={filters}
          onFilterChange={f => { setFilters(f); setPage(1); }}
          categories={assetCategories}
          statuses={STATUSES}
          companies={companies}
          onReset={() => setFilters({ search: '', category: '', status: '', department: '' })}
        />
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-indigo-500/30 slide-up"
          style={{ background: 'rgba(99,102,241,0.1)' }}
        >
          <span className="text-sm font-600 text-indigo-300">
            Đã chọn {selectedIds.size} tài sản
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg btn-ghost"
          >
            Bỏ chọn
          </button>
          <button
            onClick={() => setBulkQROpen(true)}
            className="flex items-center gap-1.5 text-xs font-600 text-indigo-300 hover:text-indigo-200 transition-colors px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)' }}
          >
            <QrCode size={13} />
            Xuất QR ({selectedIds.size})
          </button>
          {canDeleteAssets && (
            <button
              onClick={() => { setBulkDeleteReason(''); setBulkDeleteConfirm(true); }}
              className="text-xs font-600 text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(198,40,40,0.15)', border: '1px solid rgba(198,40,40,0.3)' }}
            >
              Xóa {selectedIds.size} tài sản
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {loadError ? (
        <div className="rounded-2xl border border-white/5" style={{ background: 'var(--card)' }}>
          <ErrorState message="Không thể tải dữ liệu tài sản. Vui lòng thử lại." onRetry={loadAssets} />
        </div>
      ) : (
      <AssetTable
        assets={paginated}
        allAssets={filtered}
        selectedIds={selectedIds}
        sortCol={sortCol}
        sortDir={sortDir}
        onSort={handleSort}
        onSelectAll={handleSelectAll}
        onSelectOne={handleSelectOne}
        onEdit={a => setEditAsset(a)}
        onDelete={handleDeleteClick}
        onHistory={a => setHistoryAsset(a)}
        onQR={a => setQrAsset(a)}
        onView={a => setViewAsset(a)}
        page={page}
        perPage={perPage}
        totalPages={totalPages}
        totalCount={totalCount || filtered.length}
        onPageChange={setPage}
        onPerPageChange={v => { setPerPage(v); setPage(1); }}
        currentUser={currentUser}
        visibleCols={visibleCols}
      />
      )}

      {/* Modals */}
      {createModalOpen && (
          <AssetModal
            mode="create"
            onSave={handleCreate}
            onClose={() => setCreateModalOpen(false)}
            departments={DEPARTMENTS}
            categories={assetCategories}
          />
        )}

      {editAsset && (
          <AssetModal
            mode="edit"
            asset={editAsset}
            onSave={d => handleEdit(d as Asset)}
            onClose={() => setEditAsset(null)}
            departments={DEPARTMENTS}
            categories={assetCategories}
          />
        )}

      {historyAsset && (
        <AssetHistoryDrawer
          asset={historyAsset}
          onClose={() => setHistoryAsset(null)}
        />
      )}

      {qrAsset && (
        <AssetQRModal
          asset={qrAsset}
          onClose={() => setQrAsset(null)}
          onInventory={(a) => { setQrAsset(null); setInventoryAsset(a); }}
        />
      )}

      {bulkQROpen && (
        <BulkQRPrintModal
          assets={assets.filter(a => selectedIds.has(a.id))}
          onClose={() => setBulkQROpen(false)}
        />
      )}

      {viewAsset && (
        <AssetDetailModal
          asset={viewAsset}
          onClose={() => setViewAsset(null)}
          onEdit={a => { setViewAsset(null); setEditAsset(a); }}
          onQR={a => { setViewAsset(null); setQrAsset(a); }}
          onInventory={a => { setViewAsset(null); setInventoryAsset(a); }}
        />
      )}

      {inventoryAsset && (
        <AssetInventoryModal
          asset={inventoryAsset}
          onClose={() => setInventoryAsset(null)}
          onSaved={(updated) => {
            setAssets(prev => prev.map(a => a.id === updated.id ? { ...a, ...mapApiAsset(updated as any) } : a));
            setInventoryAsset(null);
          }}
        />
      )}

      {/* Xóa trực tiếp 1 tài sản — bắt buộc nhập lý do */}
      {deleteAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => { setDeleteAsset(null); setDeleteReason(''); }}>
          <div className="w-full max-w-md rounded-3xl border border-red-500/30 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/15">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-700 text-foreground">Xác nhận xóa tài sản</h3>
                <p className="text-xs text-muted-foreground">Hành động này không thể hoàn tác</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="p-3 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-sm font-600 text-foreground">{deleteAsset.name}</p>
                <p className="text-xs font-mono text-indigo-300">{deleteAsset.code}</p>
              </div>
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Lý do xóa *</label>
                <textarea
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-[#162033] border border-white/10 focus:outline-none focus:border-indigo-500/60 resize-none"
                  placeholder="Mô tả lý do xóa tài sản này (lưu vào lịch sử)..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => { setDeleteAsset(null); setDeleteReason(''); }} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button
                onClick={handleDelete}
                disabled={!deleteReason.trim() || actionBusy}
                className="rounded-xl px-4 py-2 text-sm font-600 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionBusy ? 'Đang xóa...' : 'Xóa Tài Sản'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Xóa hàng loạt — bắt buộc nhập lý do (áp dụng cho tất cả) */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setBulkDeleteConfirm(false)}>
          <div className="w-full max-w-md rounded-3xl border border-red-500/30 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/15">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-700 text-foreground">Xóa {selectedIds.size} tài sản</h3>
                <p className="text-xs text-muted-foreground">Hành động này không thể hoàn tác</p>
              </div>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Lý do xóa *</label>
              <textarea
                value={bulkDeleteReason}
                onChange={e => setBulkDeleteReason(e.target.value)}
                rows={3}
                autoFocus
                className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-[#162033] border border-white/10 focus:outline-none focus:border-indigo-500/60 resize-none"
                placeholder={`Lý do xóa ${selectedIds.size} tài sản đã chọn (lưu vào lịch sử)...`}
              />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setBulkDeleteConfirm(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button
                onClick={async () => { await handleBulkDelete(); setBulkDeleteConfirm(false); }}
                disabled={!bulkDeleteReason.trim() || actionBusy}
                className="rounded-xl px-4 py-2 text-sm font-600 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionBusy ? 'Đang xóa...' : `Xác Nhận Xóa ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: số serial trùng */}
      {duplicateSerialError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setDuplicateSerialError(null)}>
          <div className="w-full max-w-md rounded-3xl border border-red-500/30 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/15">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <h3 className="text-base font-700 text-foreground">Số Serial Đã Tồn Tại</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-foreground">{duplicateSerialError}</p>
              <p className="text-xs text-muted-foreground mt-2">Vui lòng kiểm tra lại số serial hoặc để trống nếu thiết bị chưa có serial.</p>
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-white/5">
              <button
                onClick={() => setDuplicateSerialError(null)}
                className="btn-indigo rounded-xl px-5 py-2 text-sm font-600"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin: send delete request modal */}
      {deleteRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => { setDeleteRequestModal(null); setDeleteRequestReason(''); }}>
          <div className="w-full max-w-md rounded-3xl border border-line p-6" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/15">
                <AlertTriangle size={20} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-700 text-foreground">Yêu cầu xóa tài sản</h3>
                <p className="text-xs text-muted-foreground">Yêu cầu sẽ được gửi đến Super Admin để phê duyệt</p>
              </div>
            </div>
            <div className="p-3 rounded-xl mb-4 border border-white/05" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs text-muted-foreground">Tài sản</p>
              <p className="text-sm font-600 text-foreground mt-0.5">{deleteRequestModal.name}</p>
              <p className="text-xs font-mono text-indigo-300">{deleteRequestModal.code}</p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-500 text-foreground mb-1.5">Lý do xóa *</label>
              <textarea
                value={deleteRequestReason}
                onChange={e => setDeleteRequestReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 resize-none"
                placeholder="Mô tả lý do cần xóa tài sản này..."
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteRequestModal(null); setDeleteRequestReason(''); }} className="flex-1 h-9 rounded-xl btn-ghost text-sm">Hủy</button>
              <button
                onClick={handleRequestDelete}
                disabled={!deleteRequestReason.trim() || actionBusy}
                className="flex-1 h-9 rounded-xl btn-accent text-sm font-600 disabled:opacity-50"
              >
                {actionBusy ? 'Đang gửi...' : 'Gửi Yêu Cầu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setImportModalOpen(false)}>
          <div className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-3xl border border-white/10" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500/15">
                <Upload size={20} className="text-indigo-300" />
              </div>
              <div>
                <h3 className="text-base font-700 text-foreground">Import tài sản</h3>
                <p className="text-xs text-muted-foreground">{importFileName || 'Chưa có file'} · {importRows.length} dòng xem trước</p>
              </div>
            </div>
            <div className="px-6 py-5 max-h-[60vh] overflow-auto">
              {importPreviewError ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                  {importPreviewError}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Cột được nhận diện: mã, tên, loại, công ty, người dùng, serial, hãng, model, trạng thái, vị trí, ghi chú, giá trị.
                  </p>
                  <div className="overflow-x-auto rounded-2xl border border-white/5">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-white/5 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Dòng</th>
                          <th className="px-3 py-2 text-left">Mã</th>
                          <th className="px-3 py-2 text-left">Tên</th>
                          <th className="px-3 py-2 text-left">Loại</th>
                          <th className="px-3 py-2 text-left">Công ty</th>
                          <th className="px-3 py-2 text-left">Lỗi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 50).map((row) => (
                          <tr key={`${row.rowNumber}-${row.code}`} className="border-t border-white/5">
                            <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                            <td className="px-3 py-2 font-mono text-indigo-300">{row.code || '—'}</td>
                            <td className="px-3 py-2 text-foreground">{row.name || '—'}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.category || '—'}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.company || '—'}</td>
                            <td className="px-3 py-2 text-red-300">{row.errors?.join(', ') || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/5">
              <button onClick={() => setImportModalOpen(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
              <button
                onClick={() => void handleImportConfirm()}
                disabled={importBusy || !!importPreviewError || importRows.length === 0}
                className="rounded-xl px-4 py-2 text-sm font-600 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importBusy ? 'Đang import...' : 'Xác Nhận Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
