'use client';

// Custom node của Sơ Đồ Tổ Chức (Công ty / Phòng ban / Nhóm) + danh sách thành viên.
// LƯU Ý theme: mọi nền/viền/chữ dùng token (var(--card), var(--line)...) — KHÔNG
// hardcode màu tối để node không "tàng hình" trên giao diện Sáng.

import React, { useState } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import Image from 'next/image';
import { Building2, Users, UserCircle, ChevronDown, Landmark } from 'lucide-react';
import {
  NW,
  NH,
  getCompanyColor,
  type MemberData,
  type CompanyData,
  type DeptData,
  type SubData,
} from './orgChartData';

interface GroupNodeData { id: string; name: string; member_count?: number }

/** Node Nhóm/Tập đoàn/HĐQT — tầng trên công ty. Kiểu thẻ gọn, gradient tím-teal. */
function GroupNode({ data, selected }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  return (
    <div className="rounded-2xl border overflow-hidden shadow-lg h-full"
      style={{ width: '100%', background: 'var(--card)', borderColor: '#14b8a688' }}>
      <NodeResizer isVisible={!!selected} minWidth={NW.group} minHeight={NH.group}
        lineStyle={{ borderColor: '#14b8a655', borderWidth: 6 }}
        handleStyle={{ width: 14, height: 14, borderRadius: 9999, background: '#fff', border: '2.5px solid #14b8a6' }} />
      <Handle type="target" position={Position.Top} style={{ background: '#14b8a6', border: 'none', width: 8, height: 8 }} />
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'linear-gradient(135deg,#14b8a6,#6366f1)' }}>
        <Landmark size={18} className="text-white shrink-0" />
        <span className="text-sm font-700 text-white break-words leading-tight flex-1">{d.name}</span>
        {typeof d.member_count === 'number' && d.member_count > 0 && (
          <span className="flex items-center gap-1 text-white/90 text-2xs font-600 shrink-0">
            <Users size={11} /> {d.member_count}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#14b8a6', border: 'none', width: 8, height: 8 }} />
    </div>
  );
}

function Avatar({ name, avatar, size = 24 }: { name: string | null; avatar: string | null; size?: number }) {
  if (!name) return null;
  if (avatar?.startsWith('/')) {
    return (
      <Image src={avatar} alt={name} width={size} height={size} unoptimized
        className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center text-white font-700 flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.45, background: 'linear-gradient(135deg,#6366f1,#C62828)' }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * Tay cầm resize kiểu Canva: chấm tròn trắng viền màu (to, dễ nắm) + viền kéo
 * bán-trong-suốt dày làm vùng nắm rộng ở 4 cạnh. Chỉ hiện khi node được chọn.
 */
function CanvaResizer({ selected, color, minWidth, minHeight }: {
  selected: boolean; color: string; minWidth: number; minHeight: number;
}) {
  return (
    <NodeResizer
      isVisible={selected}
      minWidth={minWidth}
      minHeight={minHeight}
      lineStyle={{ borderColor: `${color}55`, borderWidth: 6 }}
      handleStyle={{
        width: 14, height: 14, borderRadius: 9999,
        background: '#ffffff', border: `2.5px solid ${color}`,
        boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
      }}
    />
  );
}

// Badge vai trò: Trưởng (indigo) / Phó (sky) / Trợ lý (amber); Kiêm nhiệm (purple)
const ROLE_BADGE: Record<string, { label: string; cls: string } | undefined> = {
  head: { label: 'Trưởng', cls: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  deputy: { label: 'Phó', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  assistant: { label: 'Trợ lý', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
};

const CONCURRENT_BADGE_CLS =
  'flex-shrink-0 px-1 py-px rounded border text-[9px] font-600 leading-none bg-purple-500/15 text-purple-400 border-purple-500/30';

function MemberRow({ m }: { m: MemberData }) {
  const badge = ROLE_BADGE[m.org_role];
  return (
    <div className="flex items-center gap-1.5 py-1 min-w-0">
      <Avatar name={m.name} avatar={m.avatar} size={18} />
      <div className="flex-1 min-w-0 leading-tight">
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
          <span className="text-2xs font-600 text-foreground break-words">{m.name}</span>
          {badge && (
            <span className={`flex-shrink-0 px-1 py-px rounded border text-[9px] font-600 leading-none ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          {m.is_concurrent && (
            <span className="flex-shrink-0 px-1 py-px rounded border text-[9px] font-600 leading-none bg-purple-500/15 text-purple-400 border-purple-500/30">
              Kiêm nhiệm
            </span>
          )}
        </div>
        {m.position_name && (
          <p className="text-[9px] text-muted-foreground break-words">{m.position_name}</p>
        )}
      </div>
    </div>
  );
}

function MemberList({ members }: { members: MemberData[] }) {
  if (!members.length) {
    return <p className="text-2xs text-muted-foreground/50 py-1">Chưa có thành viên trực thuộc</p>;
  }
  return (
    // max-h khớp SUB_LIST_MAX (150px) trong orgChartData — danh sách dài thì cuộn trong thẻ,
    // KHÔNG nở node vượt ước lượng layout (nở quá là node đè lên hàng dưới).
    <div className="pr-0.5 max-h-[150px] overflow-y-auto nowheel">
      {members.map(m => <MemberRow key={m.id} m={m} />)}
    </div>
  );
}

function CompanyNode({ data, selected }: NodeProps) {
  const d = data as unknown as CompanyData;
  // Mặc định XỔ SẴN (yêu cầu user) — vẫn thu gọn được bằng chevron.
  const [open, setOpen] = useState(true);
  const [c1, c2] = getCompanyColor(d.id);
  return (
    <div className="rounded-2xl border overflow-hidden shadow-lg h-full"
      style={{ width: '100%', background: 'var(--card)', borderColor: `${c1}55` }}>
      <CanvaResizer selected={!!selected} color={c1} minWidth={NW.company} minHeight={80} />
      <Handle type="target" position={Position.Top} style={{ background: c1, border: 'none', width: 8, height: 8 }} />
      <div className="flex items-center gap-3 px-4 py-3"
        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
        <Building2 size={18} className="text-white shrink-0" />
        <span className="text-sm font-700 text-white break-words leading-tight">{d.name}</span>
      </div>
      {/* Người đứng đầu công ty + nút xổ Ban Lãnh Đạo & Văn Phòng */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {d.head_name
            ? <Avatar name={d.head_name} avatar={d.head_avatar} size={20} />
            : <UserCircle size={18} className="text-muted-foreground/40" />}
          <div className="min-w-0 leading-tight">
            <span className={`text-2xs break-words ${d.head_name ? 'text-foreground font-600' : 'text-muted-foreground/50'}`}>
              {d.head_name || 'Chưa gán người đứng đầu'}
            </span>
            {d.head_name && d.head_job_title && (
              <p className="text-[9px] text-indigo-400/90 break-words leading-tight">{d.head_job_title}</p>
            )}
          </div>
          {d.is_head_concurrent && d.head_name && (
            <span className={CONCURRENT_BADGE_CLS} title="Trưởng kiêm nhiệm nhiều đơn vị">Kiêm nhiệm</span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          className="flex items-center gap-1 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title="Tổng nhân sự công ty · bấm để xem Ban Lãnh Đạo & Văn Phòng"
        >
          <Users size={11} />
          <span className="text-2xs font-600">{d.member_count}</span>
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="px-3 pb-2 border-t border-line-subtle">
          <p className="text-[9px] font-600 text-muted-foreground uppercase tracking-wider pt-1.5 pb-0.5">
            Ban Lãnh Đạo &amp; Văn Phòng
          </p>
          <MemberList members={d.members} />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: c1, border: 'none', width: 8, height: 8 }} />
    </div>
  );
}

function DeptNode({ data, selected }: NodeProps) {
  const d = data as unknown as DeptData;
  // Mặc định XỔ SẴN (yêu cầu user) — vẫn thu gọn được bằng chevron.
  const [open, setOpen] = useState(true);
  const [c1] = getCompanyColor(d.company_id);
  return (
    <div className="rounded-xl border overflow-hidden h-full"
      style={{ width: '100%', background: 'var(--card)', borderColor: 'var(--line)' }}>
      <CanvaResizer selected={!!selected} color={c1} minWidth={NW.dept} minHeight={NH.dept} />
      <Handle type="target" position={Position.Top} style={{ background: c1, border: 'none', width: 6, height: 6 }} />
      <div className="px-3 py-2.5 space-y-1.5">
        <p className="text-xs font-600 text-foreground leading-tight break-words">{d.name}</p>
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
            {d.head_name
              ? <Avatar name={d.head_name} avatar={d.head_avatar} size={18} />
              : <UserCircle size={16} className="text-muted-foreground/40" />}
            {d.head_name && (
              <span className="text-2xs text-muted-foreground break-words leading-tight">
                {d.head_name}
                {d.head_job_title && <span className="text-indigo-400/90"> · {d.head_job_title}</span>}
              </span>
            )}
            {d.is_head_concurrent && d.head_name && (
              <span className={CONCURRENT_BADGE_CLS} title="Trưởng kiêm nhiệm nhiều đơn vị">Kiêm nhiệm</span>
            )}
          </div>
          {d.is_leaf ? (
            <div className="flex items-center gap-1 text-muted-foreground/60 flex-shrink-0">
              <Users size={11} />
              <span className="text-2xs font-600">{d.member_count}</span>
            </div>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
              className="flex items-center gap-1 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              title="Nhân sự trực thuộc phòng"
            >
              <Users size={11} />
              <span className="text-2xs font-600">{d.member_count}</span>
              <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        {/* Phòng ban lá (không có bộ phận con) → hiện danh sách thành viên luôn như node bộ phận */}
        {d.is_leaf && d.members.length > 0 && (
          <div className="border-t border-line-subtle pt-1">
            <MemberList members={d.members} />
          </div>
        )}
        {!d.is_leaf && open && (
          <div className="border-t border-line-subtle pt-1">
            <p className="text-[9px] font-600 text-muted-foreground uppercase tracking-wider pb-0.5">
              Trực thuộc phòng
            </p>
            <MemberList members={d.members} />
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#818cf8', border: 'none', width: 6, height: 6 }} />
    </div>
  );
}

function SubNode({ data, selected }: NodeProps) {
  const d = data as unknown as SubData;
  return (
    <div className="rounded-xl border px-3 py-2 h-full"
      style={{ width: '100%', background: 'var(--card)', borderColor: 'var(--line-subtle)' }}>
      <CanvaResizer selected={!!selected} color="#818cf8" minWidth={NW.sub} minHeight={NH.sub} />
      <Handle type="target" position={Position.Top} style={{ background: '#818cf8', border: 'none', width: 5, height: 5 }} />
      <p className="text-2xs font-600 text-muted-foreground break-words leading-tight">{d.name}</p>
      <div className="flex items-center justify-between gap-1.5 mt-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
          {d.head_name
            ? <Avatar name={d.head_name} avatar={d.head_avatar} size={16} />
            : <UserCircle size={14} className="text-muted-foreground/30" />}
          {d.head_name ? (
            <span className="text-2xs text-muted-foreground break-words leading-tight">
              {d.head_name}
              {/* Trước đây SubNode QUÊN render chức vụ (DeptNode có) → user tưởng mất dữ liệu */}
              {d.head_job_title && <span className="text-indigo-400/90"> · {d.head_job_title}</span>}
            </span>
          ) : (
            <span className="text-2xs text-muted-foreground/40 leading-tight">Chưa gán trưởng đơn vị</span>
          )}
          {d.is_head_concurrent && d.head_name && (
            <span className={CONCURRENT_BADGE_CLS} title="Trưởng kiêm nhiệm nhiều đơn vị">Kiêm nhiệm</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground/60 flex-shrink-0">
          <Users size={10} />
          <span className="text-2xs">{d.member_count}</span>
        </div>
      </div>
      {/* Danh sách thành viên bộ phận — hiển thị luôn, dài thì cuộn */}
      {d.members.length > 0 && (
        <div className="border-t border-line-subtle mt-1.5 pt-1">
          <MemberList members={d.members} />
        </div>
      )}
    </div>
  );
}

export const nodeTypes = {
  groupNode: GroupNode,
  companyNode: CompanyNode,
  deptNode: DeptNode,
  subNode: SubNode,
};
