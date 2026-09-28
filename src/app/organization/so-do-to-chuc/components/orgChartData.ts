// Types + hằng số + thuật toán layout của Sơ Đồ Tổ Chức.
// Tách riêng để page.tsx và các component node dùng chung.

import type { Node, Edge } from '@xyflow/react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrgRole = 'head' | 'deputy' | 'assistant' | 'member';

export interface MemberData {
  id: string;
  name: string;
  avatar: string | null;
  position_name: string | null;
  org_role: OrgRole;
  is_concurrent: boolean;
}
export interface GroupData {
  id: string;
  name: string;
  parent_id: string | null;
  member_count?: number;
}
export interface CompanyData {
  id: string;
  name: string;
  group_id?: string | null;
  logo_url: string | null;
  head_name: string | null;
  head_avatar: string | null;
  head_user_id?: string | null;
  head_job_title?: string | null;
  /** Cấp bậc của người đứng đầu (positions.rank; nhỏ = cao) — dùng xếp hàng theo cấp bậc. */
  head_rank?: number | null;
  /** Trưởng đơn vị đồng thời là trưởng ở đơn vị khác → hiện badge */
  is_head_concurrent?: boolean;
  /** Tổng đầu người của công ty (mọi phòng ban/bộ phận) — hiển thị trên badge */
  member_count: number;
  members: MemberData[];
}
export interface DeptData {
  id: string;
  name: string;
  company_id: string;
  parent_department_id: string | null;
  head_name: string | null;
  head_avatar: string | null;
  head_user_id?: string | null;
  head_job_title?: string | null;
  /** Cấp bậc của người đứng đầu (positions.rank; nhỏ = cao) — dùng xếp hàng theo cấp bậc. */
  head_rank?: number | null;
  is_head_concurrent?: boolean;
  member_count: number;
  members: MemberData[];
  /** true khi phòng ban không có bộ phận con → node tự hiện danh sách thành viên */
  is_leaf?: boolean;
}
export interface SubData {
  id: string;
  name: string;
  department_id: string;
  parent_sub_department_id?: string | null;
  head_name: string | null;
  head_avatar: string | null;
  head_user_id?: string | null;
  head_job_title?: string | null;
  /** Cấp bậc của người đứng đầu (positions.rank; nhỏ = cao) — dùng xếp hàng theo cấp bậc. */
  head_rank?: number | null;
  is_head_concurrent?: boolean;
  member_count: number;
  members: MemberData[];
}

// ─── Node sizes & spacing ─────────────────────────────────────────────────────

// Bề rộng đủ chứa tên đầy đủ (không truncate) trong đa số trường hợp; tên quá dài sẽ
// tự xuống dòng thay vì cắt "...".
export const NW = { group: 280, company: 300, dept: 252, sub: 224 };
export const NH = { group: 60, company: 100, dept: 84, sub: 64 };
export const GAP_X = 28;
export const GAP_Y = 84;
export const COMPANY_VGAP = 110; // khoảng cách dọc giữa cây của các công ty (chế độ "Tất cả")

// Ước lượng chiều cao node bộ phận (danh sách thành viên hiển thị luôn, có max-height)
export const SUB_MEMBER_ROW = 34; // 1 dòng thành viên (tên không truncate, có thể xuống dòng)
export const SUB_LIST_MAX = 5 * SUB_MEMBER_ROW; // trần trước khi cuộn (max-h-[150px])
export function estimateSubHeight(s: SubData): number {
  if (!s.members.length) return NH.sub;
  return NH.sub + 8 + Math.min(s.members.length * SUB_MEMBER_ROW, SUB_LIST_MAX);
}

// Phòng ban "lá" (không có bộ phận con) cũng hiện danh sách thành viên luôn
export function estimateLeafDeptHeight(d: DeptData): number {
  if (!d.members.length) return NH.dept;
  return NH.dept + 8 + Math.min(d.members.length * SUB_MEMBER_ROW, SUB_LIST_MAX);
}

// Node giờ XỔ SẴN danh sách (yêu cầu user) → ước lượng phải cộng phần danh sách,
// nếu không node thật cao hơn ước lượng và ĐÈ lên hàng dưới. +18 = nhãn section.
export function estimateCompanyHeight(c: CompanyData): number {
  if (!c.members.length) return NH.company;
  return NH.company + 8 + 18 + Math.min(c.members.length * SUB_MEMBER_ROW, SUB_LIST_MAX);
}
export function estimateOpenDeptHeight(d: DeptData): number {
  if (!d.members.length) return NH.dept;
  return NH.dept + 8 + 18 + Math.min(d.members.length * SUB_MEMBER_ROW, SUB_LIST_MAX);
}

// ─── Company colors ───────────────────────────────────────────────────────────

const COMPANY_COLORS = [
  ['#6366f1', '#4f46e5'], ['#0ea5e9', '#0284c7'], ['#10b981', '#059669'],
  ['#f59e0b', '#d97706'], ['#ec4899', '#db2777'], ['#8b5cf6', '#7c3aed'],
  ['#14b8a6', '#0d9488'], ['#f97316', '#ea580c'], ['#06b6d4', '#0891b2'],
  ['#84cc16', '#65a30d'], ['#ef4444', '#dc2626'], ['#a855f7', '#9333ea'],
];
const colorCache: Record<string, string[]> = {};
let colorIdx = 0;
export function getCompanyColor(id: string): string[] {
  if (!colorCache[id]) colorCache[id] = COMPANY_COLORS[colorIdx++ % COMPANY_COLORS.length];
  return colorCache[id];
}

// ─── Layout builder (ĐỆ QUY, sâu tuỳ ý) ─────────────────────────────────────────
// Cây thật: Nhóm/Tập đoàn → Công ty → Phòng ban (lồng) → Bộ phận (lồng) → thành viên.
// Thuật toán "tidy tree": bề rộng cây con = max(bề rộng node, tổng bề rộng con); con xếp
// giữa dưới cha; y của con = y cha + chiều cao cha + GAP_Y. Nhiều gốc (nhóm + công ty chưa
// gom) xếp cạnh nhau.

interface TNode {
  id: string;
  type: 'groupNode' | 'companyNode' | 'deptNode' | 'subNode';
  width: number;
  height: number;
  data: Record<string, unknown>;
  children: TNode[];
  px?: number;
  py?: number;
}

const ROOT_GAP = 80; // cách ngang giữa các cây gốc

export function buildLayout(
  companies: CompanyData[],
  departments: DeptData[],
  subDepts: SubData[],
  selectedId: string | null,
  groups: GroupData[] = [],
): { nodes: Node[]; edges: Edge[] } {
  // ── Dựng cây trung gian (seen: chặn vòng lặp do dữ liệu xấu) ──
  // CẤP BẬC thể hiện bằng THỨ TỰ TRÁI→PHẢI giữa các đơn vị cùng cha (trưởng cấp cao
  // đứng trước, chưa gán cấp bậc xếp cuối, cùng cấp thì theo tên) — KHÔNG đẩy đơn vị
  // xuống hàng khác theo cấp bậc nữa (làm vậy phá hình học cây: đơn vị ngang cấp cơ
  // cấu bị tụt hàng, dây nối nhảy cóc xiên xẹo).
  const byRankThenName = <T extends { head_rank?: number | null; name: string }>(a: T, b: T) =>
    ((a.head_rank ?? 999) - (b.head_rank ?? 999)) || a.name.localeCompare(b.name, 'vi');

  const seen = new Set<string>();
  const makeSub = (sub: SubData): TNode => {
    const children = seen.has(sub.id) ? [] : (seen.add(sub.id), subDepts
      .filter(s => s.parent_sub_department_id === sub.id)
      .sort(byRankThenName)
      .map(makeSub));
    return {
      id: `sub-${sub.id}`, type: 'subNode', width: NW.sub,
      height: estimateSubHeight(sub), data: sub as unknown as Record<string, unknown>, children,
    };
  };
  const makeDept = (dept: DeptData): TNode => {
    let children: TNode[] = [];
    if (!seen.has(dept.id)) {
      seen.add(dept.id);
      const childDepts = departments
        .filter(d => d.parent_department_id === dept.id)
        .sort(byRankThenName)
        .map(makeDept);
      const topSubs = subDepts
        .filter(s => s.department_id === dept.id && !s.parent_sub_department_id)
        .sort(byRankThenName)
        .map(makeSub);
      children = [...childDepts, ...topSubs];
    }
    const isLeaf = children.length === 0;
    return {
      id: `dept-${dept.id}`, type: 'deptNode', width: NW.dept,
      height: isLeaf ? estimateLeafDeptHeight(dept) : estimateOpenDeptHeight(dept),
      data: { ...dept, is_leaf: isLeaf } as unknown as Record<string, unknown>, children,
    };
  };
  const makeCompany = (company: CompanyData): TNode => {
    const children = departments
      .filter(d => d.company_id === company.id && !d.parent_department_id)
      .sort(byRankThenName)
      .map(makeDept);
    return {
      id: `co-${company.id}`, type: 'companyNode', width: NW.company,
      height: estimateCompanyHeight(company), data: company as unknown as Record<string, unknown>, children,
    };
  };
  const groupById = new Map(groups.map(g => [g.id, g]));
  const makeGroup = (group: GroupData): TNode | null => {
    if (seen.has(`g:${group.id}`)) return null;
    seen.add(`g:${group.id}`);
    const childGroups = groups.filter(g => g.parent_id === group.id)
      .map(makeGroup).filter((n): n is TNode => n !== null);
    const groupCompanies = companies
      .filter(c => c.group_id === group.id && groupById.has(c.group_id))
      .map(makeCompany);
    const children = [...childGroups, ...groupCompanies];
    if (children.length === 0) return null; // ẩn nhóm rỗng (không có công ty hiển thị)
    const memberCount = companies
      .filter(c => c.group_id === group.id)
      .reduce((a, c) => a + (c.member_count || 0), 0);
    return {
      id: `grp-${group.id}`, type: 'groupNode', width: NW.group, height: NH.group,
      data: { id: group.id, name: group.name, member_count: memberCount } as unknown as Record<string, unknown>,
      children,
    };
  };

  // ── Chọn gốc ──
  let roots: TNode[] = [];
  if (selectedId) {
    const co = companies.find(c => c.id === selectedId);
    if (co) roots = [makeCompany(co)];
  } else {
    const topGroups = groups.filter(g => !g.parent_id || !groupById.has(g.parent_id))
      .map(makeGroup).filter((n): n is TNode => n !== null);
    const ungrouped = companies
      .filter(c => !c.group_id || !groupById.has(c.group_id))
      .map(makeCompany);
    roots = [...topGroups, ...ungrouped];
  }

  // ── TRỤC X: tidy-tree (con xếp giữa dưới cha) ──
  const subtreeWidth = (n: TNode): number => {
    if (!n.children.length) return n.width;
    const cw = n.children.reduce((a, c) => a + subtreeWidth(c), 0) + GAP_X * (n.children.length - 1);
    return Math.max(n.width, cw);
  };
  const assignX = (n: TNode, left: number) => {
    if (!n.children.length) { n.px = left + subtreeWidth(n) / 2 - n.width / 2; return; }
    let cx = left;
    for (const c of n.children) { assignX(c, cx); cx += subtreeWidth(c) + GAP_X; }
    const first = n.children[0], last = n.children[n.children.length - 1];
    n.px = ((first.px! + first.width / 2) + (last.px! + last.width / 2)) / 2 - n.width / 2;
  };
  let rootX = 0;
  for (const r of roots) { assignX(r, rootX); rootX += subtreeWidth(r) + ROOT_GAP; }

  // ── TRỤC Y: hàng = TẦNG CƠ CẤU (nhóm → công ty → con trực tiếp → cháu...) ──
  // Đơn vị ngang cấp cơ cấu LUÔN ngang hàng — dây nối chỉ đi giữa 2 hàng kề nhau,
  // thẳng và đều. (Cấp bậc trưởng đơn vị đã thể hiện bằng thứ tự trái→phải ở trên;
  // KHÔNG dùng cấp bậc để đẩy hàng — từng thử và bị chê: đơn vị cùng cha tụt hàng
  // lệch nhau, dây kéo chéo mất thẩm mỹ.)
  const allNodes: TNode[] = [];
  const collect = (n: TNode) => { allNodes.push(n); n.children.forEach(collect); };
  roots.forEach(collect);

  const hasGroup = allNodes.some(n => n.type === 'groupNode');
  const companyRow = hasGroup ? 1 : 0;

  const rowOf = new Map<string, number>();
  const setRows = (n: TNode, parentRow: number | null) => {
    let row: number;
    if (n.type === 'groupNode') row = 0;
    else if (n.type === 'companyNode') row = companyRow;
    else row = (parentRow ?? 0) + 1;
    if (parentRow != null) row = Math.max(row, parentRow + 1);
    rowOf.set(n.id, row);
    n.children.forEach(c => setRows(c, row));
  };
  roots.forEach(r => setRows(r, null));

  // Chiều cao mỗi hàng = node cao nhất trong hàng đó.
  const rowHeight = new Map<number, number>();
  for (const n of allNodes) {
    const row = rowOf.get(n.id)!;
    rowHeight.set(row, Math.max(rowHeight.get(row) ?? 0, n.height));
  }
  const maxRow = allNodes.length ? Math.max(...Array.from(rowOf.values())) : 0;
  const rowY: number[] = [];
  let yCursor = 0;
  for (let r = 0; r <= maxRow; r++) { rowY[r] = yCursor; yCursor += (rowHeight.get(r) ?? 0) + GAP_Y; }
  for (const n of allNodes) n.py = rowY[rowOf.get(n.id)!] ?? 0;

  // ── Flatten → nodes + edges ──
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const walk = (n: TNode, parentId: string | null) => {
    nodes.push({
      id: n.id, type: n.type, position: { x: n.px ?? 0, y: n.py ?? 0 },
      style: { width: n.width }, data: n.data,
    });
    if (parentId) {
      edges.push({
        id: `e-${parentId}-${n.id}`, source: parentId, target: n.id, type: 'smoothstep',
        style: { stroke: '#6366f1', strokeWidth: 1.5, opacity: 0.45 },
      });
    }
    for (const c of n.children) walk(c, n.id);
  };
  for (const r of roots) walk(r, null);

  return { nodes, edges };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Bỏ dấu tiếng Việt + lowercase (dùng cho tìm kiếm & tên file xuất) */
export function normalizeVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Slug an toàn cho tên file: "Công ty FADO" → "cong-ty-fado" */
export function slugifyVi(s: string): string {
  return normalizeVi(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
