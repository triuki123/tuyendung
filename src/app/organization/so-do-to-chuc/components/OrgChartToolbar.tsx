'use client';

// Thanh công cụ Sơ Đồ Tổ Chức: Đặt lại layout, Xuất PNG/PDF, Fit view, Toàn màn hình,
// Tìm kiếm + toolbar căn chỉnh nổi kiểu Canva khi chọn ≥2 node.

import React, { useCallback, useRef, useState } from 'react';
import { useReactFlow, getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';
import {
  LayoutGrid, Download, Maximize2, Minimize2, Scan, Search, Loader2, ChevronDown,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react';
import { NW, NH } from './orgChartData';

// Kích thước thật của node (đã đo) — fallback theo hằng số khi chưa đo xong
export function nodeDims(n: Node): { w: number; h: number } {
  const w = n.measured?.width
    ?? (n.type === 'groupNode' ? NW.group : n.type === 'companyNode' ? NW.company : n.type === 'deptNode' ? NW.dept : NW.sub);
  const h = n.measured?.height
    ?? (n.type === 'groupNode' ? NH.group : n.type === 'companyNode' ? NH.company : n.type === 'deptNode' ? NH.dept : NH.sub);
  return { w, h };
}

const BTN =
  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-600 text-muted-foreground ' +
  'hover:text-foreground hover:bg-hover transition-colors whitespace-nowrap';

// ─── Toolbar chính (góc trên phải canvas) ─────────────────────────────────────

interface ToolbarProps {
  onReset: () => void;
  fileBase: string; // so-do-to-chuc-{slug}-{yyyymmdd}
  isLight: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  search: string;
  onSearch: (v: string) => void;
  matchCount: number;
}

export function OrgChartToolbar({
  onReset, fileBase, isLight, containerRef, search, onSearch, matchCount,
}: ToolbarProps) {
  const { fitView, getNodes } = useReactFlow();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Chụp vùng viewport React Flow thành PNG dataURL (nền trong suốt)
  const capturePng = useCallback(async (): Promise<{ url: string; w: number; h: number } | null> => {
    const viewport = containerRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!viewport) return null;

    // Trong lúc chụp: phá max-height + scroll của danh sách nhân sự để in ra thấy
    // toàn bộ, không dính scrollbar; đồng thời buộc mở các dropdown đang đóng.
    const expandStyle = document.createElement('style');
    expandStyle.textContent = `
      .react-flow__viewport .nowheel { max-height: none !important; overflow: visible !important; }
      .react-flow__viewport ::-webkit-scrollbar { display: none !important; }
    `;
    document.head.appendChild(expandStyle);
    // Chờ reflow + ResizeObserver của React Flow cập nhật kích thước node
    await new Promise(r => setTimeout(r, 250));

    try {
      const bounds = getNodesBounds(getNodes());
      // Scale 2x cho nét, trần 4096px để không nổ bộ nhớ canvas
      const scale = Math.min(2, 4096 / Math.max(bounds.width, bounds.height, 1));
      const w = Math.round((bounds.width + 80) * scale);
      const h = Math.round((bounds.height + 80) * scale);
      const vp = getViewportForBounds(bounds, w, h, 0.05, 4, 0.02);
      // Ảnh avatar (next/image) mặc định loading=lazy → html-to-image treo chờ ảnh
      // ngoài viewport không bao giờ load. Ép eager + chờ decode trước khi chụp.
      const imgs = Array.from(viewport.querySelectorAll('img'));
      imgs.forEach(img => { img.loading = 'eager'; img.decoding = 'sync'; });
      await Promise.allSettled(imgs.map(img =>
        Promise.race([img.decode(), new Promise(r => setTimeout(r, 3000))]),
      ));
      const { toPng } = await import('html-to-image');
      const url = await toPng(viewport, {
        // Nền trong suốt để PDF/PNG dán được lên slide/tài liệu có nền riêng
        backgroundColor: undefined,
        width: w,
        height: h,
        pixelRatio: 1,
        // App dùng font hệ thống (không webfont) → bỏ bước nhúng font, tránh treo khi
        // html-to-image cố fetch/parse toàn bộ stylesheet.
        skipFonts: true,
        style: {
          width: `${w}px`,
          height: `${h}px`,
          transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
        },
      });
      return { url, w, h };
    } finally {
      expandStyle.remove();
    }
  }, [containerRef, getNodes]);

  const exportPng = useCallback(async () => {
    setExporting(true);
    try {
      const shot = await capturePng();
      if (!shot) return;
      const a = document.createElement('a');
      a.href = shot.url;
      a.download = `${fileBase}.png`;
      a.click();
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  }, [capturePng, fileBase]);

  const exportPdf = useCallback(async () => {
    setExporting(true);
    try {
      const shot = await capturePng();
      if (!shot) return;
      const { jsPDF } = await import('jspdf');
      // Khổ ngang, kích thước theo đúng tỉ lệ ảnh → nội dung vừa khít trang
      const pw = Math.max(shot.w, shot.h);
      const ph = Math.min(shot.w, shot.h);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [pw, ph] });
      // Căn giữa ảnh trong trang
      const ratio = Math.min(pw / shot.w, ph / shot.h);
      const iw = shot.w * ratio;
      const ih = shot.h * ratio;
      pdf.addImage(shot.url, 'PNG', (pw - iw) / 2, (ph - ih) / 2, iw, ih);
      pdf.save(`${fileBase}.pdf`);
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  }, [capturePng, fileBase]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setIsFull(false);
    } else {
      await el.requestFullscreen();
      setIsFull(true);
    }
  }, [containerRef]);

  return (
    <div className="flex items-center gap-1 p-1 rounded-xl border border-line-subtle shadow-lg"
      style={{ background: 'var(--card)' }}>

      {/* Tìm kiếm người / đơn vị */}
      <div className="relative flex items-center">
        <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Tìm người / đơn vị..."
          className="w-36 sm:w-44 pl-7 pr-2 py-1.5 rounded-lg text-xs bg-transparent border border-line-subtle
            text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/50"
        />
        {search && (
          <span className={`absolute right-2 text-[10px] font-600 ${matchCount ? 'text-indigo-400' : 'text-red-400'}`}>
            {matchCount}
          </span>
        )}
      </div>

      <div className="w-px h-5 bg-line-subtle mx-0.5" style={{ background: 'var(--line-subtle)' }} />

      <button onClick={onReset} className={BTN} title="Chạy lại auto-layout, đưa các node về ngay hàng thẳng lối">
        <LayoutGrid className="h-3.5 w-3.5" /> Đặt lại
      </button>

      <button onClick={() => fitView({ padding: 0.15, duration: 400 })} className={BTN} title="Thu toàn bộ sơ đồ vào khung nhìn">
        <Scan className="h-3.5 w-3.5" />
      </button>

      {/* Xuất PNG / PDF */}
      <div className="relative" ref={exportRef}>
        <button onClick={() => setExportOpen(o => !o)} className={BTN} disabled={exporting} title="Xuất sơ đồ ra file ảnh / PDF">
          {exporting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Download className="h-3.5 w-3.5" />}
          Xuất <ChevronDown className={`h-3 w-3 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
        </button>
        {exportOpen && (
          <div className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-line shadow-xl overflow-hidden z-50"
            style={{ background: 'var(--card)' }}>
            <button onClick={exportPng} disabled={exporting}
              className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-hover transition-colors">
              Ảnh PNG
            </button>
            <button onClick={exportPdf} disabled={exporting}
              className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-hover transition-colors border-t border-line-subtle">
              Tài liệu PDF
            </button>
          </div>
        )}
      </div>

      <button onClick={toggleFullscreen} className={BTN} title={isFull ? 'Thoát toàn màn hình' : 'Toàn màn hình'}>
        {isFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ─── Toolbar căn chỉnh nổi (kiểu Canva, hiện khi chọn ≥2 node) ────────────────

type AlignOp = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom' | 'distH' | 'distV';

interface AlignToolbarProps {
  selectedIds: string[];
  onAnimate: () => void; // bật transition ngắn cho chuyển động mượt
}

export function AlignToolbar({ selectedIds, onAnimate }: AlignToolbarProps) {
  const { getNodes, setNodes } = useReactFlow();

  const apply = useCallback((op: AlignOp) => {
    const all = getNodes();
    const sel = all.filter(n => selectedIds.includes(n.id));
    if (sel.length < 2) return;

    const boxes = sel.map(n => {
      const { w, h } = nodeDims(n);
      return { id: n.id, x: n.position.x, y: n.position.y, w, h, cx: n.position.x + w / 2, cy: n.position.y + h / 2 };
    });

    const newPos: Record<string, { x: number; y: number }> = {};
    const minX = Math.min(...boxes.map(b => b.x));
    const maxR = Math.max(...boxes.map(b => b.x + b.w));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxB = Math.max(...boxes.map(b => b.y + b.h));

    switch (op) {
      case 'left': boxes.forEach(b => { newPos[b.id] = { x: minX, y: b.y }; }); break;
      case 'right': boxes.forEach(b => { newPos[b.id] = { x: maxR - b.w, y: b.y }; }); break;
      case 'centerX': {
        const cx = (minX + maxR) / 2;
        boxes.forEach(b => { newPos[b.id] = { x: cx - b.w / 2, y: b.y }; });
        break;
      }
      case 'top': boxes.forEach(b => { newPos[b.id] = { x: b.x, y: minY }; }); break;
      case 'bottom': boxes.forEach(b => { newPos[b.id] = { x: b.x, y: maxB - b.h }; }); break;
      case 'centerY': {
        const cy = (minY + maxB) / 2;
        boxes.forEach(b => { newPos[b.id] = { x: b.x, y: cy - b.h / 2 }; });
        break;
      }
      case 'distH': {
        const sorted = [...boxes].sort((a, b) => a.cx - b.cx);
        const totalW = sorted.reduce((s, b) => s + b.w, 0);
        const gap = (maxR - minX - totalW) / (sorted.length - 1);
        let x = minX;
        sorted.forEach(b => { newPos[b.id] = { x, y: b.y }; x += b.w + gap; });
        break;
      }
      case 'distV': {
        const sorted = [...boxes].sort((a, b) => a.cy - b.cy);
        const totalH = sorted.reduce((s, b) => s + b.h, 0);
        const gap = (maxB - minY - totalH) / (sorted.length - 1);
        let y = minY;
        sorted.forEach(b => { newPos[b.id] = { x: b.x, y }; y += b.h + gap; });
        break;
      }
    }

    onAnimate();
    setNodes(nds => nds.map(n => (newPos[n.id] ? { ...n, position: newPos[n.id] } : n)));
  }, [getNodes, setNodes, selectedIds, onAnimate]);

  if (selectedIds.length < 2) return null;

  const IconBtn = ({ op, title, children }: { op: AlignOp; title: string; children: React.ReactNode }) => (
    <button onClick={() => apply(op)} title={title}
      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-hover transition-colors">
      {children}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-1.5 py-1 rounded-xl border border-line shadow-xl"
      style={{ background: 'var(--card)' }}>
      <span className="px-1.5 text-[10px] font-600 text-indigo-400">{selectedIds.length} node</span>
      <div className="w-px h-4" style={{ background: 'var(--line-subtle)' }} />
      <IconBtn op="left" title="Căn trái"><AlignStartVertical className="h-4 w-4" /></IconBtn>
      <IconBtn op="centerX" title="Căn tâm dọc"><AlignCenterVertical className="h-4 w-4" /></IconBtn>
      <IconBtn op="right" title="Căn phải"><AlignEndVertical className="h-4 w-4" /></IconBtn>
      <div className="w-px h-4" style={{ background: 'var(--line-subtle)' }} />
      <IconBtn op="top" title="Căn trên"><AlignStartHorizontal className="h-4 w-4" /></IconBtn>
      <IconBtn op="centerY" title="Căn tâm ngang"><AlignCenterHorizontal className="h-4 w-4" /></IconBtn>
      <IconBtn op="bottom" title="Căn dưới"><AlignEndHorizontal className="h-4 w-4" /></IconBtn>
      {selectedIds.length >= 3 && (
        <>
          <div className="w-px h-4" style={{ background: 'var(--line-subtle)' }} />
          <IconBtn op="distH" title="Phân bố đều ngang"><AlignHorizontalDistributeCenter className="h-4 w-4" /></IconBtn>
          <IconBtn op="distV" title="Phân bố đều dọc"><AlignVerticalDistributeCenter className="h-4 w-4" /></IconBtn>
        </>
      )}
    </div>
  );
}
