'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Loader2, ArrowLeft, Plus, Search, FolderKanban, Folder, FolderPlus, MoveRight, CheckSquare, ChevronRight, Pencil, Trash2, X, SlidersHorizontal, Plug,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { listCvs, searchCvs, deleteCv, markCvViewed, listRequisitionOptions, listCvIndustries, createCvIndustry, renameCvIndustry, deleteCvIndustry, moveCvsToIndustry, CvIndustryFolder, CvItem, CvSearchFilter } from '@/lib/api/onboardingApi';
import { countCvFilters, formatCvUploadTime, type CvAdvancedFilter } from '@/lib/cvFilters';
import { STAGES, STAGE_MAP, avatarFor, fmtExp } from './candidateShared';
import type { CandidateImportDraft } from './CandidateAddModal';
import { Briefcase, FileText, Mail, Phone, MessageCircle, CalendarDays, MapPin, ClipboardCheck, GraduationCap } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import ErrorState from '@/components/ui/ErrorState';
import { useConfirm } from '@/context/ConfirmContext';
import { normalizeVN } from '@/lib/utils/searchVN';
import { useRealtimeData } from '@/hooks/useRealtimeData';

// Open these only after the TA starts the corresponding task. This keeps the
// candidate list interactive while upload and detail code is
// still outside the first payload.
const CandidateDrawer = dynamic(() => import('./CandidateDrawer'), { ssr: false });
const CandidateAddModal = dynamic(() => import('./CandidateAddModal'), { ssr: false });
const CandidateFilterDrawer = dynamic(() => import('./CandidateFilterDrawer'), { ssr: false });
const ALL_INDUSTRIES = '__all_industries';
const shouldUseRecruitmentRealtime = process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS !== 'true';

function resolveCanEdit(): boolean {
  const u = getCurrentUser() as any;
  if (!u) return false;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  const list: string[] = Array.isArray(u.module_permissions?.['hr-cv']) ? u.module_permissions['hr-cv']
    : Array.isArray(u.module_permissions?.['hr-resources']) ? u.module_permissions['hr-resources'] : [];
  return list.includes('edit') || list.includes('create');
}

export default function CandidatePoolClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<CvItem[]>([]);
  const [facetItems, setFacetItems] = useState<CvItem[]>([]);
  const [allItems, setAllItems] = useState<CvItem[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [folders, setFolders] = useState<CvIndustryFolder[]>([]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<CvIndustryFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState('');
  const [moving, setMoving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [importDraft, setImportDraft] = useState<CandidateImportDraft | null>(null);
  const [selected, setSelected] = useState<CvItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const canEdit = useMemo(resolveCanEdit, []);

  const createPairingCode = async () => {
    setPairingLoading(true);
    try {
      const response = await fetch('/api/hr/cv/extension/pairing-code', { method: 'POST' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Không tạo được mã');
      setPairingCode(json.data.code);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không tạo được mã ghép nối'); }
    finally { setPairingLoading(false); }
  };

  // filter
  const [keyword, setKeyword] = useState('');
  const [stage, setStage] = useState('');
  const [filters, setFilters] = useState<CvAdvancedFilter>({});
  const [reqOptions, setReqOptions] = useState<{ id: string; title: string; status: string }[]>([]);
  const debounceRef = useRef<any>(null);
  const requestRef = useRef(0);
  const initialDataLoaded = useRef(false);
  const previousKeyword = useRef(keyword);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const handleCvRealtimeUpdate = useCallback((event: { entity: string }) => {
    if (event.entity !== 'hr_cv_pool') return;
    refreshRef.current().catch((error) => console.error('Không thể đồng bộ Kho CV:', error));
  }, []);
  // Local recruitment focus deliberately avoids an SSE connection and its
  // background refreshes; list actions already update the UI optimistically.
  useRealtimeData(['hr_cv_pool'], { enabled: shouldUseRecruitmentRealtime, onUpdate: handleCvRealtimeUpdate });

  // Tải toàn bộ 1 lần để dựng "vũ trụ kỹ năng" cho bộ lọc + danh sách yêu cầu tuyển dụng
  const loadAll = async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(false);
    try {
      // Candidate rows are the primary screen. Requisition choices are only
      // needed after the TA opens that filter, so do not keep the whole pool
      // behind a slower requisition query.
      void listRequisitionOptions('')
        .then((requisitions) => { if (requestId === requestRef.current) setReqOptions(requisitions); })
        .catch((error) => console.error('Không thể tải lựa chọn yêu cầu tuyển dụng:', error));
      const [all, industryFolders] = await Promise.all([
        listCvs(),
        listCvIndustries(),
      ]);
      if (requestId !== requestRef.current) return;
      initialDataLoaded.current = true;
      setItems(all);
      setFacetItems(all);
      setAllItems(all);
      setFolders(industryFolders);
    } catch (e) {
      if (requestId === requestRef.current) { console.error(e); setError(true); }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.hash.startsWith('#import=')) return;
    try {
      const encoded = decodeURIComponent(window.location.hash.slice('#import='.length));
      const draft = JSON.parse(decodeURIComponent(escape(atob(encoded)))) as CandidateImportDraft;
      setImportDraft(draft);
      setShowAdd(true);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      toast.error('Dữ liệu từ extension không hợp lệ');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quick action from the recruitment header/dashboard. Remove the parameter so
  // refreshing the page does not unexpectedly reopen the upload dialog.
  useEffect(() => {
    if (searchParams.get('add') !== '1') return;
    setShowAdd(true);
    // Clear the one-shot command through the router, so the same header button
    // works repeatedly without requiring a page refresh.
    router.replace('/nguon-nhan-luc/kho-ung-vien');
  }, [router, searchParams]);

  // Deep-link từ "Cần Xử Lý": /kho-ung-vien?openCandidate=<cvId> → mở thẳng hồ sơ ứng viên.
  useEffect(() => {
    let refreshing = false;
    const refreshWhenActive = () => {
      if (document.visibilityState !== 'visible' || refreshing) return;
      refreshing = true;
      refreshRef.current().finally(() => { refreshing = false; });
    };
    window.addEventListener('focus', refreshWhenActive);
    document.addEventListener('visibilitychange', refreshWhenActive);
    return () => {
      window.removeEventListener('focus', refreshWhenActive);
      document.removeEventListener('visibilitychange', refreshWhenActive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openedDeepLink = useRef(false);
  useEffect(() => {
    if (openedDeepLink.current || typeof window === 'undefined' || items.length === 0) return;
    const openId = new URLSearchParams(window.location.search).get('openCandidate');
    if (!openId) return;
    const cv = items.find((c) => c.id === openId);
    if (cv) { openCandidate(cv); openedDeepLink.current = true; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Áp filter (server-side) khi thay đổi — keyword debounce
  const runSearch = async () => {
    const requestId = ++requestRef.current;
    const filter: CvSearchFilter = { ...filters };
    if (keyword.trim()) filter.keyword = keyword.trim();
    if (stage) filter.status = stage;
    if (selectedIndustry !== null && selectedIndustry !== ALL_INDUSTRIES) filter.industry = selectedIndustry;
    setLoading(true);
    setError(false);
    const facetFilter = { ...filter };
    delete facetFilter.status;
    try {
      const [result, facets] = await Promise.all([
        searchCvs(filter),
        filter.status ? searchCvs(facetFilter) : Promise.resolve(null),
      ]);
      if (requestId === requestRef.current) {
        const preferNameMatches = (candidates: CvItem[]) => {
          const terms = normalizeVN(keyword).trim().split(/\s+/).filter(Boolean);
          if (!terms.length) return candidates;
          const nameMatches = candidates.filter((candidate) => {
            const name = normalizeVN(candidate.candidate_name);
            return terms.every((term) => name.includes(term));
          });
          // Prefer deterministic name matches, but preserve server results when the
          // keyword only exists in skills, positions or extracted CV contents.
          return nameMatches.length ? nameMatches : candidates;
        };
        setItems(preferNameMatches(result));
        setFacetItems(preferNameMatches(facets ?? result));
      }
    } catch (e) {
      if (requestId === requestRef.current) { console.error(e); setError(true); }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };
  refreshRef.current = async () => {
    const [, freshFolders] = await Promise.all([runSearch(), listCvIndustries()]);
    setFolders(freshFolders);
  };
  useEffect(() => {
    if (!initialDataLoaded.current) return; // Mount is handled by loadAll.
    // Invalidate the previous request before scheduling the new filters. A slow
    // response must never replace the results of the currently selected tab.
    ++requestRef.current;
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = keyword !== previousKeyword.current ? 300 : 0;
    previousKeyword.current = keyword;
    debounceRef.current = setTimeout(runSearch, delay);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, stage, filters, selectedIndustry]);

  const matchesSelectedIndustry = useCallback((cv: CvItem) => selectedIndustry === null || selectedIndustry === ALL_INDUSTRIES
    || (cv.industry || '').trim().toLocaleLowerCase('vi') === selectedIndustry.trim().toLocaleLowerCase('vi'), [selectedIndustry]);
  const scopedFacets = useMemo(() => facetItems.filter(cv => matchesSelectedIndustry(cv)
    && (!filters.onlyUnviewed || !cv.is_viewed)), [facetItems, matchesSelectedIndustry, filters.onlyUnviewed]);
  // Also guard optimistic changes and the brief interval before a new server
  // search starts. No row from another folder/status can leak into this tab.
  const visibleItems = useMemo(() => items.filter((cv) => matchesSelectedIndustry(cv)
    && (!stage || cv.status === stage) && (!filters.onlyUnviewed || !cv.is_viewed)), [items, matchesSelectedIndustry, stage, filters.onlyUnviewed]);
  const activeStageLabel = stage ? STAGE_MAP[stage]?.label || stage : 'Tất cả';
  const activeTabId = `cv-status-tab-${stage || 'all'}`;
  const reviewItems = selected && !visibleItems.some(cv => cv.id === selected.id) ? [selected, ...visibleItems] : visibleItems;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of scopedFacets) c[i.status] = (c[i.status] || 0) + 1;
    return c;
  }, [scopedFacets]);

  const selectStage = (nextStage: string) => {
    if (nextStage === stage || moving) return;
    ++requestRef.current;
    setStage(nextStage);
    setLoading(true);
    setSelectedIds([]);
    setMoveTarget('');
  };
  useEffect(() => {
    const visibleIds = new Set(visibleItems.map((cv) => cv.id));
    setSelectedIds((current) => current.every((id) => visibleIds.has(id)) ? current : current.filter((id) => visibleIds.has(id)));
  }, [visibleItems]);

  const onUpdated = (cv: CvItem) => {
    const previous = items.find(item => item.id === cv.id);
    // A detail GET can finish after the explicit view POST. Preserve a view
    // already confirmed for this TA instead of restoring a stale unread flag.
    cv = { ...cv, is_viewed: cv.is_viewed || items.find(item => item.id === cv.id)?.is_viewed || false };
    setItems((p) => p.map((x) => (x.id === cv.id ? cv : x)));
    setFacetItems((p) => p.map((x) => (x.id === cv.id ? cv : x)));
    setAllItems((p) => p.map((x) => (x.id === cv.id ? cv : x)));
    setSelected((s) => (s && s.id === cv.id
      ? matchesSelectedIndustry(cv) && (!stage || cv.status === stage) ? cv : null
      : s));
    // A single-CV edit can transfer the candidate to another industry from the
    // detail drawer. Refresh the authoritative folders/counts immediately so
    // the folder cards never wait for a full page reload to catch up.
    if (previous && (previous.industry || '').trim().toLocaleLowerCase('vi') !== (cv.industry || '').trim().toLocaleLowerCase('vi')) {
      void listCvIndustries().then(setFolders).catch(error => console.error('Không thể đồng bộ thư mục ngành nghề sau khi chuyển CV:', error));
    }
    const criteriaFields: (keyof CvItem)[] = ['status', 'industry', 'years_experience', 'expected_salary', 'date_of_birth',
      'employment_type', 'gender', 'languages', 'education_level', 'education_degree', 'job_search_status', 'skills', 'rating', 'updated_at', 'last_activity_at'];
    if (countCvFilters(filters) && previous && criteriaFields.some(key => JSON.stringify(previous[key]) !== JSON.stringify(cv[key]))) {
      void refreshRef.current().catch(error => console.error('Không thể cập nhật bộ lọc Kho CV:', error));
    }
  };
  const onDeleted = (id: string) => {
    // Keep the review flow continuous: prefer the next visible CV, then the
    // previous one when the deleted item was the final entry.
    const index = visibleItems.findIndex((item) => item.id === id);
    const next = index >= 0 ? (visibleItems[index + 1] || visibleItems[index - 1] || null) : null;
    setItems((current) => current.filter((item) => item.id !== id));
    setFacetItems((current) => current.filter((item) => item.id !== id));
    setAllItems((current) => current.filter((item) => item.id !== id));
    const removed = allItems.find((item) => item.id === id) || items.find((item) => item.id === id);
    if (removed) {
      const industry = (removed.industry || '').trim().toLocaleLowerCase('vi');
      // Give TA instant feedback after a successful delete, then reconcile with
      // the server in the background in case another user changed the folder.
      setFolders((current) => current.map((folder) => (
        (folder.name || '').trim().toLocaleLowerCase('vi') === industry
          ? { ...folder, count: Math.max(0, folder.count - 1) }
          : folder
      )));
    }
    void listCvIndustries().then(setFolders).catch(error => console.error('Không thể đồng bộ số CV sau khi xóa:', error));
    setSelected(next);
  };
  const addCreatedCvs = (cvs: CvItem[]) => {
    const hasActiveCriteria = countCvFilters(filters) > 0;
    // Let the API evaluate new CVs against advanced criteria (especially job
    // linkage). Never flash an unqualified upload into an already filtered list.
    setItems((current) => hasActiveCriteria ? current : [...cvs, ...current]);
    setFacetItems((current) => hasActiveCriteria ? current : [...cvs, ...current]);
    setAllItems((current) => [...cvs, ...current]);
    setFolders((current) => current.map((folder) => ({
      ...folder,
      count: folder.count + cvs.filter((cv) => (cv.industry || '').trim().toLocaleLowerCase('vi') === folder.name.trim().toLocaleLowerCase('vi')).length,
    })));
    // Automatic classification can create a folder. Fetch its real ID and
    // counts once after the upload, so rename/move actions work immediately.
    void listCvIndustries().then(setFolders).catch(error => console.error('Không thể cập nhật thư mục CV vừa tạo:', error));
    if (hasActiveCriteria) void refreshRef.current().catch(error => console.error('Không thể lọc CV vừa thêm:', error));
  };
  const onCreated = (cv: CvItem) => {
    addCreatedCvs([cv]);
    setShowAdd(false);
  };

  // The global quick-add button keeps the TA on the current screen. When the
  // pool is visible, reflect its new CV immediately instead of reloading data.
  useEffect(() => {
    const receiveCreatedCvs = (event: Event) => {
      const cvs = (event as CustomEvent<CvItem[]>).detail;
      if (Array.isArray(cvs) && cvs.length) addCreatedCvs(cvs);
    };
    window.addEventListener('recruitment-cv-created', receiveCreatedCvs);
    return () => window.removeEventListener('recruitment-cv-created', receiveCreatedCvs);
  }, [addCreatedCvs]);

  const clearFilters = () => { setKeyword(''); setFilters({}); setSelectedIds([]); };
  const advancedFilterCount = countCvFilters(filters);
  const industryFolders = useMemo(() => {
    const known = new Set(folders.map((folder) => folder.name.toLocaleLowerCase('vi')));
    const extras = [...new Set(allItems.map((cv) => cv.industry?.trim()).filter(Boolean) as string[])]
      .filter((name) => !known.has(name.toLocaleLowerCase('vi')))
      .map((name) => ({ id: name, name, count: allItems.filter((cv) => cv.industry === name).length }));
    const result = [...folders.filter((folder) => folder.name), ...extras]
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    const serverUnclassified = folders.find((folder) => !folder.name);
    const unclassified = serverUnclassified?.count ?? allItems.filter((cv) => !cv.industry?.trim()).length;
    if (unclassified) result.push({ id: '__unclassified', name: '', count: unclassified });
    return result;
  }, [allItems, folders]);
  const unclassifiedFolder = industryFolders.find((folder) => !folder.name) || null;
  const classifiedFolders = industryFolders.filter((folder) => folder.name);
  const selectedFolderCount = selectedIndustry === null
    ? null
    : selectedIndustry === ALL_INDUSTRIES ? allItems.length
    : industryFolders.find((folder) => folder.name === selectedIndustry)?.count ?? items.length;
  const hasDetailedFilter = Boolean(keyword || advancedFilterCount);
  const visibleTotal = !hasDetailedFilter && selectedFolderCount !== null ? selectedFolderCount : scopedFacets.length;

  function openCandidate(cv: CvItem) {
    setSelected(cv);
    if (cv.is_viewed) return;
    void markCvViewed(cv.id).then(() => {
      const mark = (current: CvItem[]) => current.map(item => item.id === cv.id ? { ...item, is_viewed: true } : item);
      setItems(mark); setFacetItems(mark); setAllItems(mark);
      setSelected(current => current?.id === cv.id ? { ...current, is_viewed: true } : current);
    }).catch(error => toast.error(error instanceof Error ? error.message : 'Không lưu được lịch sử xem'));
  }

  const addFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const folder = await createCvIndustry(newFolderName);
      setFolders((current) => current.some((item) => item.id === folder.id) ? current : [...current, folder]);
      setNewFolderName(''); setShowNewFolder(false);
      toast.success('Đã tạo thư mục');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không tạo được thư mục'); }
  };

  const saveFolderName = async () => {
    if (!editingFolder || !editFolderName.trim()) return;
    try {
      await renameCvIndustry(editingFolder.id, editFolderName);
      setEditingFolder(null); setEditFolderName('');
      await loadAll();
      toast.success('Đã đổi tên thư mục');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không đổi tên được thư mục'); }
  };

  const removeFolder = async (folder: CvIndustryFolder) => {
    const message = folder.count > 0
      ? `Thư mục có ${folder.count} CV. Khi xóa, các CV sẽ được chuyển về “Chưa phân loại”.`
      : 'Thư mục này đang trống.';
    if (!await confirm({ title: `Xóa thư mục “${folder.name}”?`, message, confirmLabel: 'Xóa thư mục', danger: true })) return;
    try {
      const moved = await deleteCvIndustry(folder.id);
      await loadAll();
      toast.success(moved ? `Đã xóa thư mục và chuyển ${moved} CV về Chưa phân loại` : 'Đã xóa thư mục');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không xóa được thư mục'); }
  };

  const moveSelected = async () => {
    if (!selectedIds.length || !moveTarget) return;
    setMoving(true);
    try {
      await moveCvsToIndustry(selectedIds, moveTarget);
      setSelectedIds([]); setSelectMode(false); setMoveTarget('');
      await loadAll();
      if (selectedIndustry !== moveTarget) setSelectedIndustry(null);
      toast.success('Đã chuyển CV sang thư mục mới');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không chuyển được CV'); }
    finally { setMoving(false); }
  };

  const deleteSelected = async () => {
    if (!selectedIds.length) return;
    if (!await confirm({
      title: `Xóa ${selectedIds.length} hồ sơ?`,
      message: 'Các hồ sơ được chọn sẽ bị xóa khỏi Kho CV.',
      confirmLabel: 'Xóa hồ sơ',
      danger: true,
    })) return;

    setMoving(true);
    const deleted: string[] = [];
    const failed: string[] = [];
    try {
      // Sequential deletion prevents an upload/review workstation from opening
      // a burst of database requests at once.
      for (const id of selectedIds) {
        try {
          await deleteCv(id);
          deleted.push(id);
        } catch (error) {
          failed.push(error instanceof Error ? error.message : id);
        }
      }
      if (deleted.length) {
        const deletedSet = new Set(deleted);
        const removedByIndustry = new Map<string, number>();
        for (const item of allItems) if (deletedSet.has(item.id)) {
          const industry = (item.industry || '').trim().toLocaleLowerCase('vi');
          removedByIndustry.set(industry, (removedByIndustry.get(industry) || 0) + 1);
        }
        setItems((current) => current.filter((item) => !deletedSet.has(item.id)));
        setFacetItems((current) => current.filter((item) => !deletedSet.has(item.id)));
        setAllItems((current) => current.filter((item) => !deletedSet.has(item.id)));
        setFolders((current) => current.map((folder) => {
          const count = removedByIndustry.get((folder.name || '').trim().toLocaleLowerCase('vi')) || 0;
          return count ? { ...folder, count: Math.max(0, folder.count - count) } : folder;
        }));
        void listCvIndustries().then(setFolders).catch(error => console.error('Không thể đồng bộ số CV sau khi xóa nhiều:', error));
      }
      setSelectedIds(failed.length ? selectedIds.filter((id) => !deleted.includes(id)) : []);
      if (failed.length) {
        toast.error(`Đã xóa ${deleted.length}/${selectedIds.length} CV. ${failed[0]}`);
      } else {
        setSelectMode(false);
        toast.success(`Đã xóa ${deleted.length} CV`);
      }
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className={`space-y-5 ${selectMode ? 'pb-28 sm:pb-20' : ''}`}>
      <Link href="/nguon-nhan-luc" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Tuyển Dụng
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2.5">
            <FolderKanban className="h-6 w-6 text-purple-400" /> {selectedIndustry === null ? 'Kho Ứng Viên' : selectedIndustry === ALL_INDUSTRIES ? 'Hồ sơ ứng viên' : (selectedIndustry || 'Chưa phân loại')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{selectedIndustry === null ? 'Chọn thư mục ngành nghề để xem hồ sơ ứng viên' : selectedIndustry === ALL_INDUSTRIES ? 'Toàn bộ CV đã tải lên; phân loại ngành nghề được hiển thị song song' : 'Tìm kiếm, lọc và quản lý CV trong thư mục này'}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && selectedIndustry === null && (
            <button onClick={() => setShowNewFolder((value) => !value)} className="btn-ghost h-10 rounded-xl px-3 text-sm font-600 flex items-center gap-2 border border-line">
              <FolderPlus className="h-4 w-4" /> Thêm thư mục
            </button>
          )}
          {canEdit && (
            <button onClick={createPairingCode} disabled={pairingLoading} className="btn-ghost h-10 rounded-xl px-3 text-sm font-600 flex items-center gap-2 border border-line">
              {pairingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Kết nối extension
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowAdd(true)}
              className="btn-accent h-10 rounded-xl px-4 text-sm font-600 flex items-center gap-2">
              <Plus className="h-4 w-4" /> Thêm Ứng Viên
            </button>
          )}
        </div>
      </div>

      {pairingCode && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 border border-indigo-500/35 bg-indigo-500/[0.06] p-4">
          <div className="flex-1"><p className="text-sm font-700 text-foreground">Mã ghép nối Chrome Extension</p><p className="text-xs text-muted-foreground">Nhập mã này vào extension trong 10 phút. Mã chỉ dùng một lần.</p></div>
          <code className="text-xl font-700 tracking-[0.2em] text-indigo-200 bg-surface-2 border border-line px-4 py-2">{pairingCode}</code>
          <button onClick={() => navigator.clipboard.writeText(pairingCode).then(() => toast.success('Đã sao chép mã'))} className="btn-indigo h-10 px-4 text-sm font-600">Sao chép</button>
          <button onClick={() => setPairingCode('')} className="btn-ghost h-10 px-3 text-sm">Đóng</button>
        </div>
      )}

      {showNewFolder && selectedIndustry === null && (
        <div className="flex flex-col sm:flex-row gap-2 border border-line bg-surface-2 p-3">
          <input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addFolder()}
            placeholder="Tên bộ phận hoặc ngành nghề mới" className="h-10 flex-1 px-3 text-sm text-foreground bg-surface border border-line focus:outline-none focus:border-indigo-500/60" />
          <button onClick={addFolder} disabled={!newFolderName.trim()} className="btn-indigo h-10 px-4 text-sm font-600 disabled:opacity-50">Tạo thư mục</button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="btn-ghost h-10 px-3 text-sm">Hủy</button>
        </div>
      )}

      {editingFolder && selectedIndustry === null && (
        <div className="flex flex-col sm:flex-row gap-2 border border-indigo-500/30 bg-indigo-500/[0.05] p-3">
          <div className="flex-1 min-w-0">
            <p className="text-2xs font-600 text-muted-foreground uppercase mb-1">Đổi tên thư mục</p>
            <input autoFocus value={editFolderName} onChange={(event) => setEditFolderName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && saveFolderName()}
              className="h-10 w-full px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
          </div>
          <button onClick={saveFolderName} disabled={!editFolderName.trim()} className="btn-indigo h-10 px-4 text-sm font-600 disabled:opacity-50 sm:self-end">Lưu tên</button>
          <button onClick={() => { setEditingFolder(null); setEditFolderName(''); }} className="btn-ghost h-10 px-3 text-sm sm:self-end">Hủy</button>
        </div>
      )}

      {selectedIndustry === null ? (
        loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> :
        error ? <ErrorState message="Không tải được kho ứng viên. Vui lòng thử lại." onRetry={loadAll} /> :
        <div className="space-y-6">
          <section className="candidate-master-section" aria-labelledby="candidate-master-heading">
            <div className="mb-2">
              <h2 id="candidate-master-heading" className="text-sm font-700 text-foreground">Hồ sơ ứng viên</h2>
              <p className="text-xs text-muted-foreground">Nơi xem toàn bộ CV đã tải lên, không phụ thuộc vào trạng thái phân loại ngành nghề</p>
            </div>
            <button type="button" onClick={() => { setSelectedIndustry(ALL_INDUSTRIES); setSelectedIds([]); setSelectMode(false); }}
              className="candidate-master-folder w-full min-h-28 px-5 text-left flex items-center gap-4">
              <div className="candidate-master-folder-icon h-12 w-12 flex items-center justify-center shrink-0"><FolderKanban className="h-6 w-6" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-700 text-foreground">Tất cả hồ sơ ứng viên</p>
                <p className="mt-1 text-xs text-muted-foreground">Mở danh sách đầy đủ để tìm kiếm, xem và quản lý mọi CV.</p>
              </div>
              <div className="hidden text-right sm:block shrink-0">
                <p className="text-lg font-700 text-foreground">{allItems.length}</p>
                <p className="text-xs text-muted-foreground">CV đã tải lên</p>
              </div>
              <span className="candidate-master-folder-action hidden md:inline-flex">Mở danh sách</span>
              <ChevronRight className="h-5 w-5 text-blue-500 shrink-0" />
            </button>
          </section>
          <section>
            <div className="mb-2">
              <h2 className="text-sm font-700 text-foreground">Thư mục ngành nghề</h2>
              <p className="text-xs text-muted-foreground">Phân loại CV theo bộ phận hoặc chuyên môn để thao tác nhanh hơn</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {classifiedFolders.map((folder) => (
            <div key={folder.id} onClick={() => { setSelectedIndustry(folder.name); setSelectedIds([]); setSelectMode(false); }}
              className="industry-folder-card relative h-24 border border-line px-4 text-left transition-colors flex items-center gap-3 cursor-pointer">
              <div className="h-11 w-11 flex items-center justify-center bg-amber-500/15 text-amber-300 shrink-0"><Folder className="h-6 w-6" /></div>
              <div className="min-w-0 flex-1"><p className="text-sm font-600 text-foreground truncate">{folder.name || 'Chưa phân loại'}</p><p className="text-xs text-muted-foreground mt-1">{folder.count} CV</p></div>
              {folder.name && canEdit ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={(event) => { event.stopPropagation(); setEditingFolder(folder); setEditFolderName(folder.name); setShowNewFolder(false); }}
                    className="h-9 w-9 border border-line flex items-center justify-center text-muted-foreground hover:text-indigo-300 hover:border-indigo-500/40 hover:bg-indigo-500/10" title="Đổi tên thư mục">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={(event) => { event.stopPropagation(); removeFolder(folder); }}
                    className="h-9 w-9 border border-line flex items-center justify-center text-muted-foreground hover:text-red-300 hover:border-red-500/40 hover:bg-red-500/10" title="Xóa thư mục">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-1" />
                </div>
              ) : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            </div>
          ))}
          {unclassifiedFolder && <button type="button" onClick={() => { setSelectedIndustry(''); setSelectedIds([]); setSelectMode(false); }}
            className="industry-unclassified-card h-24 border border-amber-500/35 px-4 text-left transition-colors flex items-center gap-3">
            <div className="h-11 w-11 flex items-center justify-center bg-amber-500/20 text-amber-300 shrink-0"><Folder className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1"><p className="text-sm font-700 text-foreground">Chưa phân loại</p><p className="text-xs text-amber-200/80 mt-1">{unclassifiedFolder.count} CV đang chờ phân loại</p></div>
            <span className="hidden sm:inline text-xs font-600 text-amber-200">Mở và phân loại</span>
            <ChevronRight className="h-4 w-4 text-amber-300 shrink-0" />
          </button>}
            </div>
          </section>
        </div>
      ) : <>
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => { setSelectedIndustry(null); setStage(''); clearFilters(); setSelectMode(false); setSelectedIds([]); }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Tất cả thư mục
        </button>
        {canEdit && (
          <button onClick={() => { setSelectMode((value) => !value); setSelectedIds([]); setMoveTarget(''); }}
            className={`h-9 px-3 text-sm font-600 flex items-center gap-2 border transition-colors ${selectMode ? 'border-red-500/35 text-red-300 hover:bg-red-500/10' : 'border-line text-muted-foreground hover:text-foreground hover:bg-hover'}`}>
            {selectMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
            {selectMode ? 'Xong' : 'Chọn nhiều'}
          </button>
        )}
      </div>

      {selectMode && (
        <div className="flex items-center gap-3 border-y border-indigo-500/20 bg-indigo-500/[0.04] px-3 py-2">
          <button disabled={loading || moving || !visibleItems.length}
            onClick={() => setSelectedIds(selectedIds.length === visibleItems.length ? [] : visibleItems.map((item) => item.id))}
            className="inline-flex items-center gap-2 text-sm font-600 text-indigo-200 hover:text-indigo-100">
            <span className={`h-4 w-4 border flex items-center justify-center ${selectedIds.length === visibleItems.length && visibleItems.length ? 'border-indigo-400 bg-indigo-500' : 'border-line bg-surface-2'}`}>
              {selectedIds.length === visibleItems.length && visibleItems.length ? <CheckSquare className="h-3 w-3 text-white" /> : null}
            </span>
            {selectedIds.length === visibleItems.length && visibleItems.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </button>
          <span className="text-xs text-muted-foreground">Bấm vào thẻ ứng viên để chọn</span>
          {selectedIds.length > 0 && <span className="text-xs font-600 text-indigo-200">Đã chọn {selectedIds.length} CV</span>}
        </div>
      )}

      {/* Thanh tìm kiếm + nút bộ lọc */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="candidate-pool-search-icon absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm theo tên, kỹ năng, vị trí, hoặc nội dung bên trong CV (không dấu cũng được)..."
            className="candidate-pool-search w-full h-11 pl-10 pr-9 rounded-xl text-sm text-foreground border focus:outline-none" />
          {keyword && <button onClick={() => setKeyword('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <button onClick={() => setShowFilters(true)} aria-haspopup="dialog" aria-expanded={showFilters}
          className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border text-sm ${showFilters || advancedFilterCount ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
          <SlidersHorizontal className="h-4 w-4" /> Bộ lọc{advancedFilterCount ? ` (${advancedFilterCount})` : ''}
        </button>
      </div>

      {advancedFilterCount > 0 && <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Đang áp dụng {advancedFilterCount} tiêu chí trong tab {activeStageLabel}</span>
        <button onClick={clearFilters} className="text-blue-600">Xóa lọc</button>
      </div>}

      <div role="tablist" aria-label="Trạng thái hồ sơ" className="flex flex-wrap gap-2"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
          const index = tabs.indexOf(event.target as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[nextIndex].focus();
          tabs[nextIndex].click();
        }}>
        <button id="cv-status-tab-all" role="tab" aria-selected={!stage} aria-controls="cv-status-panel"
          tabIndex={!stage ? 0 : -1} disabled={moving} onClick={() => selectStage('')}
          className={`rounded-full border px-3 py-2 text-xs font-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${!stage ? 'border-blue-500/40 bg-blue-500/10 text-blue-600' : 'border-line text-foreground hover:bg-hover'}`}>
          Tất cả ({visibleTotal})
        </button>
        {STAGES.map((s) => (
          <button key={s.key} id={`cv-status-tab-${s.key}`} role="tab" aria-selected={stage === s.key} aria-controls="cv-status-panel"
            tabIndex={stage === s.key ? 0 : -1} disabled={moving} onClick={() => selectStage(s.key)}
            className={`rounded-full border px-3 py-2 text-xs font-600 flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${stage === s.key ? 'border-blue-500/40 bg-blue-500/10 text-blue-600' : 'border-line text-foreground hover:bg-hover'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {s.label} ({counts[s.key] || 0})
          </button>
        ))}
      </div>

      <section key={stage || 'all'} id="cv-status-panel" role="tabpanel" data-active-status={stage || 'all'}
        aria-labelledby={activeTabId} aria-busy={loading} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-600 text-foreground">{stage ? `Hồ sơ · ${activeStageLabel}` : 'Tất cả hồ sơ'}</h2>
        <p aria-live="polite" className="text-xs text-muted-foreground">{loading ? 'Đang tải hồ sơ…' : `${visibleItems.length} hồ sơ`}</p>
      </div>
      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải hồ sơ…</div>
      ) : error ? (
        <ErrorState message="Không tải được danh sách ứng viên. Vui lòng thử lại." onRetry={runSearch} />
      ) : visibleItems.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <FolderKanban className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm text-foreground">{hasDetailedFilter ? 'Không tìm thấy ứng viên phù hợp' : stage ? `Chưa có hồ sơ ở trạng thái “${activeStageLabel}”` : 'Thư mục chưa có hồ sơ'}</p>
          <p className="text-xs mt-1">{hasDetailedFilter ? 'Thử thay đổi từ khóa hoặc bộ lọc trong tab đang chọn.' : stage ? 'Chọn Tất cả hoặc một trạng thái khác để xem hồ sơ.' : 'Thêm CV ứng viên vào thư mục này để bắt đầu.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {visibleItems.map((cv) => <CandidateListRow key={cv.id} cv={cv} onOpen={() => openCandidate(cv)} selectable={selectMode} checked={selectedIds.includes(cv.id)} onToggle={() => setSelectedIds((current) => current.includes(cv.id) ? current.filter((id) => id !== cv.id) : [...current, cv.id])} />)}
        </div>
      )}
      </section>

      </>}

      {showFilters && <CandidateFilterDrawer applied={filters} industry={selectedIndustry === ALL_INDUSTRIES ? '*' : selectedIndustry || ''}
        industries={classifiedFolders.map(folder => folder.name)} requisitions={reqOptions} onClose={() => setShowFilters(false)}
        onApply={(nextFilters, industry) => { ++requestRef.current; setLoading(true); setFilters(nextFilters); setSelectedIndustry(industry === '*' ? ALL_INDUSTRIES : industry); setSelectedIds([]); setMoveTarget(''); setShowFilters(false); }} />}
      {showAdd && <CandidateAddModal initialIndustry={selectedIndustry === ALL_INDUSTRIES ? '' : selectedIndustry || ''} initialDraft={importDraft}
        onClose={() => { setShowAdd(false); setImportDraft(null); }}
        onCreated={(cv) => { setImportDraft(null); onCreated(cv); }}
        onCreatedMany={(cvs) => {
          setImportDraft(null);
          addCreatedCvs(cvs);
          setShowAdd(false);
        }} />}
      {selected && <CandidateDrawer key={selected.id} cv={selected} candidates={reviewItems} canEdit={canEdit}
        onClose={() => setSelected(null)} onNavigate={openCandidate} onUpdated={onUpdated} onDeleted={onDeleted} />}
      {selectMode && (
        <div className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 border border-indigo-500/40 bg-surface shadow-2xl px-3 py-3 sm:px-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="shrink-0">
              <p className="text-sm font-700 text-foreground">{selectedIds.length} CV đã chọn</p>
              <p className="text-2xs text-muted-foreground">Chọn thao tác cần thực hiện</p>
            </div>
            <button onClick={deleteSelected} disabled={!selectedIds.length || moving} className="h-10 px-4 text-sm font-600 flex items-center justify-center gap-2 border border-red-500/45 text-red-300 hover:bg-red-500/10 disabled:opacity-40 shrink-0">
              <Trash2 className="h-4 w-4" /> Xóa đã chọn
            </button>
            <select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)} className="h-10 flex-1 min-w-0 px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60">
              <option value="">Chuyển thư mục (tùy chọn)...</option>
              {folders.filter((folder) => folder.name !== selectedIndustry).map((folder) => <option key={folder.id} value={folder.name}>{folder.name}</option>)}
            </select>
            <button onClick={moveSelected} disabled={!selectedIds.length || !moveTarget || moving} className="btn-indigo h-10 px-4 text-sm font-600 flex items-center justify-center gap-2 disabled:opacity-40 shrink-0">
              {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoveRight className="h-4 w-4" />} Chuyển
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateListRow({ cv, onOpen, selectable = false, checked = false, onToggle }: { cv: CvItem; onOpen: () => void; selectable?: boolean; checked?: boolean; onToggle?: () => void }) {
  const st = STAGE_MAP[cv.status];
  const uploadedAt = cv.uploaded_at || cv.created_at;
  return (
    <div data-candidate-id={cv.id} data-status={cv.status} onClick={selectable ? onToggle : onOpen} className={`candidate-summary-card group rounded-2xl border p-4 cursor-pointer transition-colors ${checked ? 'border-indigo-500 bg-indigo-500/[0.08]' : 'border-line-subtle hover:border-indigo-500/30'}`} style={{ background: 'var(--card)' }}>
      <div className="grid items-center gap-4 md:grid-cols-[minmax(270px,1.2fr)_minmax(210px,1fr)_minmax(210px,0.9fr)]">
        <div className="flex min-w-0 items-center gap-3">
        {selectable && (
          <span className={`h-5 w-5 border flex items-center justify-center shrink-0 transition-colors ${checked ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-line bg-surface-2 text-transparent group-hover:border-indigo-400'}`} aria-label={`Chọn ${cv.candidate_name}`}>
            <CheckSquare className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-700 text-white shrink-0" style={{ background: avatarFor(cv.candidate_name) }}>
          {cv.candidate_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-700 text-foreground truncate">{cv.candidate_name}</h2>
          {cv.candidate_email && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground truncate"><Mail className="h-3.5 w-3.5 shrink-0" />{cv.candidate_email}</p>}
          {cv.candidate_phone && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" />{cv.candidate_phone}</p>}
          <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} className="mt-1 inline-flex items-center gap-1.5 text-xs font-600 text-emerald-600 hover:text-emerald-700"><MessageCircle className="h-3.5 w-3.5" />Trao đổi với ứng viên</button>
        </div>
        </div>
        <div className="min-w-0 border-t border-line-subtle pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
          <p className="flex items-center gap-1.5 text-sm font-600 text-foreground truncate"><Briefcase className="h-4 w-4 shrink-0 text-blue-500" />{cv.position_applied || cv.current_title || 'Chưa có vị trí ứng tuyển'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Mã hồ sơ: #{cv.id.slice(-8).toUpperCase()}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-cv-uploaded-at={uploadedAt}><CalendarDays className="h-3.5 w-3.5" />Tải lên: {formatCvUploadTime(uploadedAt)}</p>
          {cv.education_degree && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><GraduationCap className="h-3.5 w-3.5" />Bằng cấp: {cv.education_degree}</p>}
          {cv.years_experience != null && <p className="mt-1 text-xs text-muted-foreground">{fmtExp(cv.years_experience)}</p>}
        </div>
        <div className="min-w-0 border-t border-line-subtle pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
          {st && <span className={`inline-flex rounded-full border px-2 py-1 text-2xs font-600 ${st.color}`}>{st.label}</span>}
          {cv.location && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0 text-blue-500" />{cv.location}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-xs font-600 text-foreground"><ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />Đánh giá CV: {cv.rating != null ? `${cv.rating}/5` : 'Chưa đánh giá'}</p>
          {cv.file_name && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground truncate"><FileText className="h-3.5 w-3.5 shrink-0" />{cv.file_name}</p>}
        </div>
      </div>
    </div>
  );
}
