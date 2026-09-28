'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  ViewportPortal,
  useNodesState,
  useEdgesState,
  useReactFlow,
  applyNodeChanges,
  BackgroundVariant,
  SelectionMode,
  type Node,
  type Edge,
  type NodeChange,
  type NodePositionChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Link from 'next/link';
import { Loader2, ArrowLeft, MousePointer2, Hand } from 'lucide-react';
import {
  buildLayout, getCompanyColor, normalizeVi, slugifyVi,
  type CompanyData, type DeptData, type SubData, type MemberData, type GroupData,
} from './components/orgChartData';
import { nodeTypes } from './components/OrgChartNodes';
import { OrgChartToolbar, AlignToolbar, nodeDims } from './components/OrgChartToolbar';

// ─── Theme hook: theo dõi class .light trên <html> để đổi màu canvas/export ──

function useIsLight(): boolean {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setLight(el.classList.contains('light'));
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return light;
}

// ─── Smart guides (đường gióng kiểu Canva) ────────────────────────────────────

const SNAP_T = 6; // ngưỡng hít (đơn vị toạ độ flow)

interface Guides {
  v: { x: number; y1: number; y2: number } | null;
  h: { y: number; x1: number; x2: number } | null;
}

/** So mép trái/tâm/phải + mép trên/tâm/dưới của node đang kéo với các node khác.
 *  Trả về vị trí đã "hít" + đường gióng cần vẽ. */
function computeSnap(
  pos: { x: number; y: number },
  node: Node,
  others: Node[],
): { x: number; y: number; guides: Guides } {
  const { w, h } = nodeDims(node);
  let bestX: { delta: number; x: number; oy1: number; oy2: number } | null = null;
  let bestY: { delta: number; y: number; ox1: number; ox2: number } | null = null;

  for (const o of others) {
    const { w: ow, h: oh } = nodeDims(o);
    const oxs = [o.position.x, o.position.x + ow / 2, o.position.x + ow];
    const oys = [o.position.y, o.position.y + oh / 2, o.position.y + oh];
    const cxs = [pos.x, pos.x + w / 2, pos.x + w];
    const cys = [pos.y, pos.y + h / 2, pos.y + h];

    for (const ox of oxs) {
      for (const cx of cxs) {
        const d = ox - cx;
        if (Math.abs(d) <= SNAP_T && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) {
          bestX = { delta: d, x: ox, oy1: o.position.y, oy2: o.position.y + oh };
        }
      }
    }
    for (const oy of oys) {
      for (const cy of cys) {
        const d = oy - cy;
        if (Math.abs(d) <= SNAP_T && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) {
          bestY = { delta: d, y: oy, ox1: o.position.x, ox2: o.position.x + ow };
        }
      }
    }
  }

  const x = pos.x + (bestX?.delta ?? 0);
  const y = pos.y + (bestY?.delta ?? 0);
  return {
    x, y,
    guides: {
      v: bestX ? { x: bestX.x, y1: Math.min(y, bestX.oy1) - 24, y2: Math.max(y + h, bestX.oy2) + 24 } : null,
      h: bestY ? { y: bestY.y, x1: Math.min(x, bestY.ox1) - 24, x2: Math.max(x + w, bestY.ox2) + 24 } : null,
    },
  };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function SoDoInner() {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [departments, setDepartments] = useState<DeptData[]>([]);
  const [subDepts, setSubDepts] = useState<SubData[]>([]);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [guides, setGuides] = useState<Guides>({ v: null, h: null });
  const [spaceDown, setSpaceDown] = useState(false);
  // Chế độ con trỏ kiểu Canva: 'select' = kéo nền để chọn vùng · 'pan' = bàn tay di chuyển khung
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const panMode = spaceDown || tool === 'pan';
  const [animating, setAnimating] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null!);
  const isLight = useIsLight();
  const { fitView } = useReactFlow();

  useEffect(() => {
    fetch('/api/organizations/org-chart')
      .then(r => r.json())
      .then(d => {
        const norm = <T extends { members?: MemberData[] }>(arr: T[]): T[] =>
          arr.map(x => ({ ...x, members: x.members ?? [] }));
        // is_head_concurrent do API trả về (dựa vào cờ is_primary của phân công head).
        const cos: CompanyData[] = norm(d.companies ?? []);
        setCompanies(cos);
        setDepartments(norm(d.departments ?? []));
        setSubDepts(norm(d.subDepartments ?? []));
        setGroups(d.groups ?? []);
        // Mặc định focus công ty đầu để view ban đầu rõ ràng; "Tất cả" vẫn bấm được.
        if (cos.length) setSelectedId(cos[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  // Rebuild layout khi dữ liệu hoặc filter thay đổi
  useEffect(() => {
    if (!companies.length) return;
    const { nodes: n, edges: e } = buildLayout(companies, departments, subDepts, selectedId, groups);
    setNodes(n);
    setEdges(e);
    // fitView phải chạy SAU khi node render (data load async sau mount nên prop fitView
    // ban đầu fit graph rỗng). Delay 1 frame để React Flow đo lại kích thước node.
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 60);
    return () => clearTimeout(t);
  }, [companies, departments, subDepts, groups, selectedId, fitView, setNodes, setEdges]);

  // Bật transition transform ngắn cho các chuyển động lập trình (align/reset/click)
  const animate = useCallback(() => {
    setAnimating(true);
    setTimeout(() => setAnimating(false), 320);
  }, []);

  // Nút "Đặt lại": chạy lại auto-layout về ngay hàng thẳng lối
  const resetLayout = useCallback(() => {
    const { nodes: n, edges: e } = buildLayout(companies, departments, subDepts, selectedId, groups);
    animate();
    setNodes(n);
    setEdges(e);
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 80);
  }, [companies, departments, subDepts, groups, selectedId, animate, setNodes, setEdges, fitView]);

  // Phím tắt kiểu Canva: giữ Space = pan tạm thời · V = chế độ Chọn · H = chế độ Bàn tay
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if (e.code === 'Space') { e.preventDefault(); setSpaceDown(true); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'v' || e.key === 'V') setTool('select');
      else if (e.key === 'h' || e.key === 'H') setTool('pan');
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ── Smart guides: chặn change position khi kéo, hít vào node thẳng hàng ──
  const onNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    setNodes(nds => {
      const posChanges = changes.filter(
        (c): c is NodePositionChange => c.type === 'position' && !!c.dragging && !!c.position,
      );
      if (posChanges.length > 0) {
        const lead = posChanges[0];
        const draggedIds = new Set(posChanges.map(c => c.id));
        const leadNode = nds.find(n => n.id === lead.id);
        if (leadNode && lead.position) {
          const others = nds.filter(n => !draggedIds.has(n.id));
          const snap = computeSnap(lead.position, leadNode, others);
          const dx = snap.x - lead.position.x;
          const dy = snap.y - lead.position.y;
          if (dx !== 0 || dy !== 0) {
            for (const pc of posChanges) {
              if (pc.position) pc.position = { x: pc.position.x + dx, y: pc.position.y + dy };
            }
          }
          setGuides(snap.guides);
        }
      } else if (changes.some(c => c.type === 'position' && !c.dragging)) {
        setGuides({ v: null, h: null }); // kết thúc kéo → tắt đường gióng
      }
      return applyNodeChanges(changes, nds);
    });
  }, [setNodes]);

  const onNodeDragStop = useCallback(() => setGuides({ v: null, h: null }), []);

  // ── Click node → tự căn trục với node cha để edge thành đường thẳng đứng ──
  const onNodeClick = useCallback((e: React.MouseEvent, node: Node) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) return; // đang multi-select thì không auto-căn
    const parentEdge = edges.find(ed => ed.target === node.id);
    if (!parentEdge) return;
    setNodes(nds => {
      const parent = nds.find(n => n.id === parentEdge.source);
      if (!parent) return nds;
      const siblings = edges.filter(ed => ed.source === parentEdge.source).map(ed => ed.target);
      const { w } = nodeDims(node);
      const { w: pw } = nodeDims(parent);

      if (siblings.length === 1) {
        // Con duy nhất → hít tâm x theo tâm cha ⇒ edge thẳng đứng tuyệt đối
        const targetX = parent.position.x + pw / 2 - w / 2;
        if (Math.abs(targetX - node.position.x) < 0.5) return nds;
        animate();
        return nds.map(n => (n.id === node.id ? { ...n, position: { x: targetX, y: n.position.y } } : n));
      }
      // Nhiều anh em → căn thẳng hàng ngang với các anh em (cùng y) để tầng gọn gàng
      const sibNodes = nds.filter(n => siblings.includes(n.id) && n.id !== node.id);
      if (!sibNodes.length) return nds;
      const targetY = Math.min(...sibNodes.map(n => n.position.y));
      if (Math.abs(targetY - node.position.y) < 0.5) return nds;
      animate();
      return nds.map(n => (n.id === node.id ? { ...n, position: { x: n.position.x, y: targetY } } : n));
    });
  }, [edges, setNodes, animate]);

  // ── Tìm kiếm tên người / đơn vị → highlight + pan tới ──
  const matchedIds = useMemo(() => {
    const q = normalizeVi(search.trim());
    if (!q) return [] as string[];
    return nodes
      .filter(n => {
        const d = n.data as unknown as { name?: string; head_name?: string | null; members?: MemberData[] };
        if (d.name && normalizeVi(d.name).includes(q)) return true;
        if (d.head_name && normalizeVi(d.head_name).includes(q)) return true;
        return (d.members ?? []).some(m => normalizeVi(m.name).includes(q));
      })
      .map(n => n.id);
  }, [search, nodes]);

  useEffect(() => {
    const set = new Set(matchedIds);
    setNodes(nds => {
      let changed = false;
      const next = nds.map(n => {
        const cls = set.has(n.id) ? 'search-hit' : undefined;
        if ((n.className || undefined) === cls) return n;
        changed = true;
        return { ...n, className: cls };
      });
      return changed ? next : nds;
    });
    if (matchedIds.length) {
      fitView({ nodes: matchedIds.map(id => ({ id })), padding: 0.35, duration: 400, maxZoom: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedIds.join('|')]);

  const selectedIds = useMemo(() => nodes.filter(n => n.selected).map(n => n.id), [nodes]);

  const stats = useMemo(() => {
    const cos = selectedId ? companies.filter(c => c.id === selectedId) : companies;
    const depts = selectedId ? departments.filter(d => d.company_id === selectedId) : departments;
    const subs = selectedId
      ? subDepts.filter(s => depts.some(d => d.id === s.department_id))
      : subDepts;
    const members = depts.reduce((a, d) => a + d.member_count, 0);
    return { cos: cos.length, depts: depts.length, subs: subs.length, members };
  }, [companies, departments, subDepts, selectedId]);

  const fileBase = useMemo(() => {
    const co = selectedId ? companies.find(c => c.id === selectedId) : null;
    const slug = co ? slugifyVi(co.name) : 'tat-ca';
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `so-do-to-chuc-${slug}-${ymd}`;
  }, [companies, selectedId]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col -m-4 sm:-m-5 lg:-m-6 xl:-m-8 2xl:-m-10 rounded-2xl overflow-hidden border border-line-subtle ${animating ? 'rf-anim' : ''}`}
      style={{ height: 'calc(100vh - 120px)', background: 'var(--background)' }}
    >

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-5 pt-3 pb-3 border-b border-line-subtle"
          style={{ background: 'var(--primary)' }}>

          <Link href="/organization"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Quản Lý Tổ Chức
          </Link>

          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h1 className="text-base font-700 text-foreground">Sơ Đồ Tổ Chức</h1>
              <p className="text-2xs text-muted-foreground mt-0.5">Toàn bộ cơ cấu tập đoàn dạng sơ đồ cây</p>
            </div>

            {/* Stats pills */}
            <div className="hidden sm:flex items-center gap-2 text-2xs text-muted-foreground">
              <span className="px-2 py-1 rounded-lg border border-line-subtle bg-white/3">
                <span className="font-700 text-indigo-400 mr-1">{stats.cos}</span>Công ty
              </span>
              <span className="px-2 py-1 rounded-lg border border-line-subtle bg-white/3">
                <span className="font-700 text-sky-400 mr-1">{stats.depts}</span>Bộ phận
              </span>
              <span className="px-2 py-1 rounded-lg border border-line-subtle bg-white/3">
                <span className="font-700 text-violet-400 mr-1">{stats.subs}</span>Nhóm
              </span>
              <span className="px-2 py-1 rounded-lg border border-line-subtle bg-white/3">
                <span className="font-700 text-emerald-400 mr-1">{stats.members}</span>Thành viên
              </span>
            </div>
          </div>

          {/* Company filter tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            <button
              onClick={() => setSelectedId(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-600 transition-colors ${
                !selectedId
                  ? 'bg-indigo-600 text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-hover'
              }`}
            >
              Tất cả
            </button>
            {companies.map(c => {
              const [color] = getCompanyColor(c.id);
              return (
                <button key={c.id}
                  onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-600 transition-all border ${
                    selectedId === c.id
                      ? 'text-white'
                      : 'text-muted-foreground hover:text-foreground border-transparent hover:border-line'
                  }`}
                  style={selectedId === c.id
                    ? { background: color, borderColor: color }
                    : {}}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Canvas ── */}
        <div className={`flex-1 relative ${panMode ? 'rf-pan-mode' : ''}`} style={{ background: 'var(--canvas)' }}>
          {/* Style theo theme cho nút điều khiển React Flow + hộp chọn + highlight tìm kiếm */}
          <style>{`
            .react-flow__controls-button {
              background: var(--card);
              border-bottom: 1px solid var(--line-subtle);
              color: var(--muted-foreground, #94a3b8);
            }
            .react-flow__controls-button:hover { background: var(--line); color: var(--foreground); }
            .react-flow__controls-button svg { fill: currentColor; }
            .react-flow__selection {
              background: rgba(99,102,241,0.08);
              border: 1px dashed rgba(99,102,241,0.8);
              border-radius: 8px;
            }
            .react-flow__node.search-hit > div {
              outline: 2px solid #ec4899;
              outline-offset: 3px;
            }
            .rf-anim .react-flow__node { transition: transform 0.28s cubic-bezier(0.25, 1, 0.5, 1); }
            /* Chế độ Bàn tay: con trỏ grab trên nền, grabbing khi đang kéo */
            .rf-pan-mode .react-flow__pane { cursor: grab; }
            .rf-pan-mode .react-flow__pane.dragging { cursor: grabbing; }
          `}</style>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onNodeDragStop={onNodeDragStop}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              // Chế độ Chọn: kéo nền = chọn vùng; Chế độ Bàn tay (hoặc giữ Space): kéo nền = pan.
              // Chuột giữa/phải luôn pan được ở cả hai chế độ.
              selectionOnDrag={!panMode}
              selectionMode={SelectionMode.Partial}
              panOnDrag={panMode ? true : [1, 2]}
              nodesConnectable={false}
              deleteKeyCode={null}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1}
                color={isLight ? '#94a3b8' : '#1e293b'} />
              <Controls
                className="!rounded-xl !overflow-hidden !shadow-lg"
                style={{ border: '1px solid var(--line)' }}
                showInteractive={false}
              />

              {/* Bộ chọn công cụ con trỏ (kiểu Canva) */}
              <Panel position="top-left">
                <div className="flex flex-col gap-1 p-1 rounded-xl border border-line shadow-lg"
                  style={{ background: 'var(--card)' }}>
                  <button
                    onClick={() => setTool('select')}
                    title="Chọn (V) — kéo nền để chọn vùng"
                    className={`flex items-center justify-center h-8 w-8 rounded-lg transition ${
                      tool === 'select'
                        ? 'bg-indigo-600 text-white'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                    }`}
                  >
                    <MousePointer2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setTool('pan')}
                    title="Bàn tay (H) — kéo nền để di chuyển khung"
                    className={`flex items-center justify-center h-8 w-8 rounded-lg transition ${
                      tool === 'pan'
                        ? 'bg-indigo-600 text-white'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                    }`}
                  >
                    <Hand className="h-4 w-4" />
                  </button>
                </div>
              </Panel>

              {/* Toolbar chính */}
              <Panel position="top-right">
                <OrgChartToolbar
                  onReset={resetLayout}
                  fileBase={fileBase}
                  isLight={isLight}
                  containerRef={containerRef}
                  search={search}
                  onSearch={setSearch}
                  matchCount={matchedIds.length}
                />
              </Panel>

              {/* Toolbar căn chỉnh nổi khi chọn ≥2 node */}
              <Panel position="top-center">
                <AlignToolbar selectedIds={selectedIds} onAnimate={animate} />
              </Panel>

              {/* Đường gióng smart guide (toạ độ flow) */}
              <ViewportPortal>
                {guides.v && (
                  <div style={{
                    position: 'absolute', pointerEvents: 'none', zIndex: 1001,
                    left: guides.v.x, top: guides.v.y1, width: 1, height: guides.v.y2 - guides.v.y1,
                    background: '#ec4899', boxShadow: '0 0 0 0.5px rgba(236,72,153,0.4)',
                  }} />
                )}
                {guides.h && (
                  <div style={{
                    position: 'absolute', pointerEvents: 'none', zIndex: 1001,
                    left: guides.h.x1, top: guides.h.y, width: guides.h.x2 - guides.h.x1, height: 1,
                    background: '#ec4899', boxShadow: '0 0 0 0.5px rgba(236,72,153,0.4)',
                  }} />
                )}
              </ViewportPortal>
            </ReactFlow>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 text-2xs text-muted-foreground
            px-3 py-2 rounded-xl border border-line-subtle shadow-lg" style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-indigo-500/80" />
              <span>Công ty</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm border border-line" style={{ background: 'var(--card)' }} />
              <span>Phòng ban</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-hover" />
              <span>Nhóm</span>
            </div>
            <span className="text-muted-foreground/40">|</span>
            <span className="hidden md:inline">
              {panMode ? 'Bàn tay (H): kéo nền để di chuyển' : 'Chọn (V): kéo nền để chọn cụm'} · Giữ Space để pan · Scroll để zoom
            </span>
          </div>
        </div>
    </div>
  );
}

export default function SoDo() {
  return (
    <ReactFlowProvider>
      <SoDoInner />
    </ReactFlowProvider>
  );
}
