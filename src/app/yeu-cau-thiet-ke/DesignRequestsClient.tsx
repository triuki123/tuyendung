'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Copy, Download, ExternalLink, Eye, FileText, Image as ImageIcon, Info, Link2, ListChecks, Loader2, MessageCircle, Palette, Pencil, Plus, Send, Star, Trash2, Upload, UserRound, X } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import DateInputVN from '@/components/ui/DateInputVN';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

type Status = 'new' | 'accepted' | 'in_progress' | 'review' | 'revision_requested' | 'approved' | 'completed' | 'rejected' | 'archived' | 'blocked';
type BriefDetail = { goal?:string; keyMessage?:string; audience?:string; copy?:string };
type DesignSpec = { size?:string; ratio?:string; formats?:string };
type Resource = { label:string; url:string };
type Item = {
  id:string; title:string; description:string; request_type:string; priority:string; status:Status;
  requester_id?:string; requester_name?:string; assignee_id?:string; assignee_name?:string;
  assignees?: {id:string; name:string}[];
  brief_url?:string; result_url?:string; result_note?:string; quantity:number; estimated_hours?:number; actual_hours?:number;
  due_date?:string; completed_at?:string; created_at:string;
  campaign_name?:string; channel?:string; brief_detail?:BriefDetail; design_spec?:DesignSpec; resources?:Resource[];
  block_reason?:string; block_note?:string;
};
type Assignee = { id:string; name:string; email?:string; avatar?:string; unit_name:string };
const STATUS: Record<Status, string> = {
  new:'Mới', accepted:'Đã giao', in_progress:'Đang thiết kế', review:'Chờ duyệt', revision_requested:'Cần chỉnh sửa',
  approved:'Đã duyệt', completed:'Hoàn thành', rejected:'Từ chối', archived:'Lưu trữ', blocked:'Đang bị chặn',
};
const STATUS_COLOR: Record<Status, string> = {
  new:'border-sky-500/30 text-sky-300 bg-sky-500/10', accepted:'border-indigo-500/30 text-indigo-300 bg-indigo-500/10',
  in_progress:'border-amber-500/30 text-amber-300 bg-amber-500/10', review:'border-fuchsia-500/30 text-fuchsia-300 bg-fuchsia-500/10',
  revision_requested:'border-orange-500/30 text-orange-300 bg-orange-500/10', approved:'border-teal-500/30 text-teal-300 bg-teal-500/10',
  completed:'border-emerald-500/30 text-emerald-300 bg-emerald-500/10', rejected:'border-red-500/30 text-red-300 bg-red-500/10',
  archived:'border-white/10 text-muted-foreground bg-white/5', blocked:'border-red-500/40 text-red-300 bg-red-500/15',
};
const PRIORITY_LABEL: Record<string,string> = { low:'Thấp', normal:'Bình thường', high:'Cao', urgent:'Khẩn cấp' };
const PRIORITY_COLOR: Record<string,string> = { low:'border-white/10 text-muted-foreground', normal:'border-sky-500/30 text-sky-300', high:'border-amber-500/30 text-amber-300', urgent:'border-red-500/30 text-red-300' };
const TYPES: Record<string,string> = { social:'Social media', banner:'Banner', print:'Ấn phẩm', video:'Video/Motion', brand:'Nhận diện', other:'Khác' };
const BLOCK_REASONS: Record<string,string> = { missing_image:'Thiếu hình ảnh', missing_content:'Thiếu nội dung', unclear_brief:'Brief chưa rõ', waiting_feedback:'Chờ feedback', waiting_info:'Chờ người khác cung cấp thông tin', technical_issue:'Lỗi kỹ thuật', other:'Khác' };
const ACTIVE_STATUSES: Status[] = ['new','accepted','in_progress','review','revision_requested','approved','blocked'];
const CLOSED_STATUSES: Status[] = ['completed','rejected','archived'];
const FAVORITES_KEY = 'assetflow_design_favorites';

// Style dùng chung cho form modal — đồng bộ với OrderModal (module Yêu Cầu
// Tuyển Dụng): input/select nền bg-surface-2, viền border-line, bo rounded-xl.
const inputCls = 'w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-fuchsia-500/60';
const textareaCls = 'w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-fuchsia-500/60 resize-none';
const labelCls = 'block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5';

function headers(json=false) {
  const u = JSON.parse(localStorage.getItem('assetflow_auth') || '{}');
  return { ...(json ? {'Content-Type':'application/json'} : {}), 'x-current-user-id':u.id||'', 'x-current-user-role':u.role||'', 'x-current-user-company':u.active_company_id||u.company_id||'', 'x-user-permissions':JSON.stringify(u.module_permissions||{}) };
}
function isOverdue(x: Item) {
  return !!x.due_date && !['completed','archived'].includes(x.status) && new Date(x.due_date) < new Date();
}
// 1 yêu cầu có thể giao cho nhiều người (team), không chỉ 1 người — luôn ưu
// tiên đọc từ team, fallback về assignee_id/name đơn (dữ liệu cũ/API cũ).
function assigneeTeam(x: Item): {id:string; name:string}[] {
  if (x.assignees?.length) return x.assignees;
  return x.assignee_id ? [{ id: x.assignee_id, name: x.assignee_name || '' }] : [];
}
function assigneeNamesLabel(x: Item): string {
  const team = assigneeTeam(x);
  if (!team.length) return 'Chưa giao';
  return team.length===1 ? team[0].name : `${team[0].name} +${team.length-1}`;
}
function loadFavorites(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')); } catch { return new Set(); }
}

export default function DesignRequestsClient() {
  const toast = useToast();
  const [items,setItems]=useState<Item[]>([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState<'create'|Item|null>(null);
  const [viewing,setViewing]=useState<Item|null>(null);
  const [confirmDel,setConfirmDel]=useState<Item|null>(null);
  const [showClosed,setShowClosed]=useState(false);
  const [view,setView]=useState<'list'|'report'|'mine'|'workload'|'calendar'>('list');
  const [favorites,setFavorites]=useState<Set<string>>(new Set());
  const currentUserId=useMemo(()=>{ try { return JSON.parse(localStorage.getItem('assetflow_auth')||'{}').id||''; } catch { return ''; } },[]);
  useEscapeKey(()=>setConfirmDel(null), !!confirmDel);
  useEffect(()=>{ setFavorites(loadFavorites()); },[]);

  const load=useCallback(async()=>{ setLoading(true); try { const r=await fetch('/api/design-requests',{headers:headers()}); const j=await r.json(); if(!r.ok) throw new Error(j.error); setItems(j.data||[]); } catch(e:any){toast.error(e.message||'Không tải được yêu cầu');} finally{setLoading(false);} },[toast]);
  useEffect(()=>{void load();},[load]);

  const closedCount=useMemo(()=>items.filter(x=>CLOSED_STATUSES.includes(x.status)).length,[items]);
  const visible=useMemo(()=>{
    const list=showClosed?items:items.filter(x=>ACTIVE_STATUSES.includes(x.status));
    return [...list].sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id)));
  },[items,showClosed,favorites]);
  const metrics=useMemo(()=>({
    processing: items.filter(x=>['new','accepted','in_progress'].includes(x.status)).length,
    review: items.filter(x=>x.status==='review').length,
    revision: items.filter(x=>x.status==='revision_requested').length,
    completed: items.filter(x=>x.status==='completed').length,
    overdue: items.filter(x=>isOverdue(x)).length,
    blocked: items.filter(x=>x.status==='blocked').length,
    hours: items.reduce((s,x)=>s+Number(x.actual_hours||0),0),
  }),[items]);
  const myTasks=useMemo(()=>currentUserId?items.filter(x=>assigneeTeam(x).some(a=>a.id===currentUserId)):[],[items,currentUserId]);

  const toggleFavorite=(id:string)=>{
    setFavorites(prev=>{
      const next=new Set(prev);
      next.has(id)?next.delete(id):next.add(id);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const onSaved=(row:Item)=>{
    setItems(prev=>{ const i=prev.findIndex(x=>x.id===row.id); if(i>=0){const cp=[...prev]; cp[i]=row; return cp;} return [row,...prev]; });
    setShowForm(null);
    setViewing(v=> v && v.id===row.id ? row : v);
  };

  const update=async(id:string,body:Record<string,unknown>)=>{
    const r=await fetch('/api/design-requests',{method:'PATCH',headers:headers(true),body:JSON.stringify({id,...body})});
    const j=await r.json(); if(!r.ok) throw new Error(j.error);
    onSaved(j.data);
    return j.data as Item;
  };

  const doClone=async(x:Item)=>{
    try{
      const body={ title:`${x.title} (Bản sao)`, description:x.description, request_type:x.request_type, priority:x.priority,
        quantity:x.quantity, estimated_hours:x.estimated_hours||'', due_date:'', brief_url:x.brief_url||'', assignee_ids:assigneeTeam(x).map(a=>a.id),
        campaign_name:x.campaign_name||'', channel:x.channel||'', brief_detail:x.brief_detail||null, design_spec:x.design_spec||null, resources:x.resources||null };
      const r=await fetch('/api/design-requests',{method:'POST',headers:headers(true),body:JSON.stringify(body)});
      const j=await r.json(); if(!r.ok) throw new Error(j.error);
      toast.success('Đã nhân bản yêu cầu');
      onSaved(j.data);
    }catch(e:any){ toast.error(e.message||'Không nhân bản được'); }
  };

  const doDelete=async()=>{
    if(!confirmDel) return;
    try{
      const r=await fetch(`/api/design-requests?id=${encodeURIComponent(confirmDel.id)}`,{method:'DELETE',headers:headers()});
      const j=await r.json(); if(!r.ok) throw new Error(j.error);
      setItems(prev=>prev.filter(x=>x.id!==confirmDel.id));
      toast.success('Đã xoá yêu cầu');
    }catch(e:any){ toast.error(e.message||'Không xoá được'); }
    finally{ setConfirmDel(null); }
  };

  return <div className="mx-auto max-w-[1500px] p-4 sm:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-700 text-foreground"><Palette className="h-5 w-5 sm:h-6 sm:w-6 text-fuchsia-400"/>Yêu Cầu Thiết Kế</h1>
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground">Tiếp nhận, xử lý, bàn giao và lưu trữ yêu cầu thiết kế</p>
      </div>
      <button onClick={()=>setShowForm('create')} className="btn-accent rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 shrink-0">
        <Plus className="h-4 w-4"/> Tạo yêu cầu
      </button>
    </div>

    <div className="flex items-center gap-2 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 px-4 py-2.5">
      <Info className="h-4 w-4 text-fuchsia-400 shrink-0"/>
      <p className="text-xs text-muted-foreground">Gửi brief cho bộ phận Thiết kế và chọn người thực hiện — người được giao sẽ nhận thông báo ngay.</p>
    </div>

    <div className="flex gap-1 border-b border-white/10 overflow-x-auto">
      {[
        ['list','Danh sách',null],
        ...(currentUserId?[['mine','Việc của tôi',myTasks.length]]:[]),
        ['workload','Khối lượng công việc',null],
        ['calendar','Lịch',null],
        ['report','Báo cáo hiệu suất',null],
      ].map(([k,l,count]:any)=>
        <button key={k} onClick={()=>setView(k)} className={`h-10 px-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${view===k?'border-fuchsia-400 text-foreground':'border-transparent text-muted-foreground hover:text-foreground'}`}>
          {l}{count?` (${count})`:''}
        </button>
      )}
    </div>

    {!loading && (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          [Clock3,'Đang xử lý',metrics.processing,'text-sky-400'],
          [Send,'Chờ duyệt',metrics.review,'text-fuchsia-400'],
          [Pencil,'Cần chỉnh sửa',metrics.revision,'text-orange-400'],
          [ListChecks,'Hoàn thành',metrics.completed,'text-emerald-400'],
          [AlertTriangle,'Quá hạn',metrics.overdue,'text-red-400'],
          [AlertTriangle,'Đang bị chặn',metrics.blocked,'text-red-500'],
        ].map(([I,l,v,c]:any)=>
          <div key={l} className="rounded-2xl border border-white/5 px-3 py-3" style={{ background:'var(--card)' }}>
            <I className={`mb-1.5 h-4 w-4 ${c}`}/>
            <div className="text-lg font-700 text-foreground">{v}</div>
            <div className="text-2xs text-muted-foreground">{l}</div>
          </div>
        )}
      </div>
    )}

    {view==='report' ? <PerformanceReport items={items} loading={loading} onOpen={setViewing}/>
    : view==='mine' ? <MyTasks items={myTasks} loading={loading} onOpen={setViewing}/>
    : view==='workload' ? <Workload items={items} loading={loading}/>
    : view==='calendar' ? <CalendarView items={items} loading={loading} onOpen={setViewing}/>
    : <>
      {!loading && items.length>0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{visible.length} yêu cầu {showClosed?'':'đang hoạt động'}</span>
          {closedCount>0 && (
            <button onClick={()=>setShowClosed(v=>!v)} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              {showClosed?'Ẩn việc đã đóng':`Hiện việc đã đóng (${closedCount})`}
            </button>
          )}
        </div>
      )}

      {loading?<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>
      :visible.length===0?<div className="flex flex-col items-center py-20 text-muted-foreground">
          <Palette className="h-10 w-10 mb-3 opacity-30"/>
          <p className="text-sm">{items.length===0?'Chưa có yêu cầu thiết kế nào':'Không có yêu cầu nào đang hoạt động'}</p>
          {items.length===0 && <p className="text-xs mt-1 opacity-60">Bấm &quot;Tạo yêu cầu&quot; để gửi brief đầu tiên</p>}
          {items.length>0 && closedCount>0 && <p className="text-xs mt-1 opacity-60">Bấm &quot;Hiện việc đã đóng&quot; để xem {closedCount} yêu cầu đã hoàn thành/lưu trữ</p>}
        </div>
      :<div className="columns-1 sm:columns-2 xl:columns-3 gap-4">
        {visible.map(x=>{
          const fav=favorites.has(x.id); const overdue=isOverdue(x);
          return <div key={x.id} className="mb-4 break-inside-avoid rounded-2xl border border-white/5 p-4 flex flex-col" style={{ background:'var(--card)' }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <button onClick={()=>setViewing(x)} className="min-w-0 text-left group">
                <p className="text-sm font-600 text-foreground truncate group-hover:text-fuchsia-300 transition-colors">{x.title}</p>
                <p className="text-2xs text-muted-foreground truncate">{TYPES[x.request_type]||x.request_type} · {x.quantity||1} sản phẩm{x.campaign_name?` · ${x.campaign_name}`:''}</p>
              </button>
              <div className="flex gap-1 shrink-0">
                <button onClick={()=>setViewing(x)} className="btn-ghost rounded-lg p-2 -m-0.5 text-muted-foreground hover:text-fuchsia-400" title="Xem chi tiết"><Eye className="h-3.5 w-3.5"/></button>
                <button onClick={()=>toggleFavorite(x.id)} className={`btn-ghost rounded-lg p-2 -m-0.5 ${fav?'text-amber-400':'text-muted-foreground hover:text-amber-400'}`} title="Yêu thích">
                  <Star className={`h-3.5 w-3.5 ${fav?'fill-amber-400':''}`}/>
                </button>
                <button onClick={()=>doClone(x)} className="btn-ghost rounded-lg p-2 -m-0.5 text-muted-foreground hover:text-fuchsia-400" title="Nhân bản"><Copy className="h-3.5 w-3.5"/></button>
                <button onClick={()=>setShowForm(x)} className="btn-ghost rounded-lg p-2 -m-0.5" title="Sửa"><Pencil className="h-3.5 w-3.5"/></button>
                <button onClick={()=>setConfirmDel(x)} className="btn-ghost rounded-lg p-2 -m-0.5 text-muted-foreground hover:text-red-400" title="Xoá"><Trash2 className="h-3.5 w-3.5"/></button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${STATUS_COLOR[x.status]}`}>{STATUS[x.status]}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${PRIORITY_COLOR[x.priority]||PRIORITY_COLOR.normal}`}>{PRIORITY_LABEL[x.priority]||x.priority}</span>
              {overdue && <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-2xs font-600 text-red-300">Quá hạn</span>}
            </div>
            <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground mb-2">{x.description||'Không có mô tả'}</p>
            <div className="mt-auto pt-2 border-t border-white/5 flex items-center justify-between gap-3 text-2xs text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5"><UserRound className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{assigneeNamesLabel(x)}</span></span>
              <span className="shrink-0">{x.due_date?new Date(x.due_date).toLocaleDateString('vi-VN'):'Chưa có hạn'}</span>
            </div>
          </div>;
        })}
      </div>}
    </>}

    {showForm && <RequestForm item={showForm==='create'?null:showForm} onClose={()=>setShowForm(null)} onSaved={onSaved}/>}
    {viewing && <Detail item={viewing} currentUserId={currentUserId} onClose={()=>setViewing(null)} onEdit={()=>{setShowForm(viewing); setViewing(null);}} onUpdate={update}/>}

    {confirmDel && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.7)' }} onClick={()=>setConfirmDel(null)}>
        <div className="w-full max-w-sm rounded-3xl border border-white/10 p-6" style={{ background:'var(--card)' }} onClick={e=>e.stopPropagation()}>
          <h3 className="text-base font-700 text-foreground mb-2">Xoá yêu cầu thiết kế?</h3>
          <p className="text-xs text-muted-foreground mb-5">&quot;{confirmDel.title}&quot; sẽ bị gỡ khỏi danh sách.</p>
          <div className="flex justify-end gap-3">
            <button onClick={()=>setConfirmDel(null)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
            <button onClick={doDelete} className="rounded-xl px-4 py-2 text-sm font-600 text-white bg-red-600 hover:bg-red-700">Xoá yêu cầu</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}

function currentMonth() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

// Bộ chọn Tháng/Năm tự viết bằng tiếng Việt — thay <input type="month">
// vì lịch popup gốc của trình duyệt lấy ngôn ngữ hệ điều hành (thường ra
// tiếng Anh: Jan/Feb/...), không theo được ngôn ngữ trang.
function MonthPickerVN({value,onChange}:{value:string; onChange:(v:string)=>void}) {
  const now=new Date();
  const [y,m]=value?value.split('-').map(Number):[now.getFullYear(),now.getMonth()+1];
  const years=Array.from({length:6},(_,i)=>now.getFullYear()-4+i);
  const set=(ny:number,nm:number)=>onChange(`${ny}-${String(nm).padStart(2,'0')}`);
  return <div className="grid grid-cols-2 gap-2">
    <select value={m} onChange={e=>set(y,Number(e.target.value))} className={inputCls}>
      {Array.from({length:12},(_,i)=>i+1).map(mo=><option key={mo} value={mo}>Tháng {mo}</option>)}
    </select>
    <select value={y} onChange={e=>set(Number(e.target.value),m)} className={inputCls}>
      {years.map(yr=><option key={yr} value={yr}>{yr}</option>)}
    </select>
  </div>;
}

// Khối lượng công việc — % task đang xử lý (không tính hoàn thành/từ chối/lưu
// trữ) trên từng người thực hiện, so với ngưỡng WORKLOAD_CAP (đơn giản hoá:
// coi 8 task active/người là 100% để cảnh báo sớm khi quá tải).
const WORKLOAD_CAP = 8;
function Workload({items,loading}:{items:Item[];loading:boolean}) {
  const rows=useMemo(()=>{
    const map=new Map<string,{name:string;active:number;overdue:number;items:Item[]}>();
    for(const x of items){
      if(CLOSED_STATUSES.includes(x.status)) continue;
      for(const a of assigneeTeam(x)){
        if(!a.name) continue;
        const row=map.get(a.name)||{name:a.name,active:0,overdue:0,items:[]};
        row.active+=1;
        if(isOverdue(x)) row.overdue+=1;
        row.items.push(x);
        map.set(a.name,row);
      }
    }
    return [...map.values()].sort((a,b)=>b.active-a.active);
  },[items]);
  if(loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>;
  if(!rows.length) return <div className="flex flex-col items-center py-20 text-muted-foreground"><UserRound className="h-10 w-10 mb-3 opacity-30"/><p className="text-sm">Chưa có ai đang có task hoạt động</p></div>;
  return <div className="space-y-3">
    {rows.map(r=>{
      const pct=Math.min(100,Math.round((r.active/WORKLOAD_CAP)*100));
      const overloaded=pct>=90;
      return <div key={r.name} className="rounded-2xl border border-white/5 p-4" style={{ background:'var(--card)' }}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-500/15 text-xs font-700 text-fuchsia-300">{r.name.trim().charAt(0).toUpperCase()}</div>
            <span className="text-sm font-600 text-foreground">{r.name}</span>
            {overloaded && <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-2xs font-700 text-red-300"><AlertTriangle className="h-3 w-3"/>Khối lượng cao</span>}
          </div>
          <span className="text-xs text-muted-foreground">{r.active} task đang xử lý{r.overdue>0?` · ${r.overdue} quá hạn`:''}</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full rounded-full ${overloaded?'bg-red-500':pct>=60?'bg-amber-500':'bg-emerald-500'}`} style={{ width:`${pct}%` }}/>
        </div>
      </div>;
    })}
  </div>;
}

// Lịch — lưới theo tháng, chấm màu theo trạng thái ở từng ngày có hạn bàn
// giao. Trỏ/click vào ngày hiện popup ngay tại đó — không cần cuộn xuống.
const CALENDAR_DOT: Record<string,string> = { overdue:'bg-red-500', in_progress:'bg-sky-500', review:'bg-fuchsia-500', revision_requested:'bg-orange-500', completed:'bg-emerald-500', other:'bg-white/30' };
const CALENDAR_BORDER: Record<string,string> = { overdue:'border-red-500/50', in_progress:'border-sky-500/50', review:'border-fuchsia-500/50', revision_requested:'border-orange-500/50', completed:'border-emerald-500/50', other:'border-white/20' };
const CALENDAR_BADGE: Record<string,string> = { overdue:'bg-red-500', in_progress:'bg-sky-500', review:'bg-fuchsia-500', revision_requested:'bg-orange-500', completed:'bg-emerald-500', other:'bg-white/30' };
function calendarDot(x:Item){ if(isOverdue(x)) return 'overdue'; if(['in_progress','accepted','new'].includes(x.status)) return 'in_progress'; if(x.status==='review') return 'review'; if(x.status==='revision_requested') return 'revision_requested'; if(['completed','approved'].includes(x.status)) return 'completed'; return 'other'; }
function CalendarView({items,loading,onOpen}:{items:Item[];loading:boolean;onOpen:(x:Item)=>void}) {
  const [month,setMonth]=useState(()=>{ const d=new Date(); return { y:d.getFullYear(), m:d.getMonth() }; });
  const [popup,setPopup]=useState<{key:string; style:CSSProperties}|null>(null);
  const popupRef=useRef<HTMLDivElement>(null);

  const byDay=useMemo(()=>{
    const map=new Map<string,Item[]>();
    for(const x of items){ if(!x.due_date) continue; const key=x.due_date.slice(0,10); (map.get(key)||map.set(key,[]).get(key)!).push(x); }
    return map;
  },[items]);

  useEffect(()=>{
    if(!popup) return;
    const onDown=(e:MouseEvent)=>{ if(popupRef.current && !popupRef.current.contains(e.target as Node)) setPopup(null); };
    const onEsc=(e:KeyboardEvent)=>{ if(e.key==='Escape') setPopup(null); };
    document.addEventListener('mousedown',onDown); document.addEventListener('keydown',onEsc);
    return ()=>{ document.removeEventListener('mousedown',onDown); document.removeEventListener('keydown',onEsc); };
  },[popup]);

  const openDay=(key:string, el:HTMLElement)=>{
    if(popup?.key===key){ setPopup(null); return; }
    const rect=el.getBoundingClientRect();
    const width=280;
    const left=Math.min(Math.max(8, rect.left), window.innerWidth-width-8);
    const spaceBelow=window.innerHeight-rect.bottom;
    const top=spaceBelow>220 ? rect.bottom+6 : rect.top-6;
    setPopup({ key, style:{ position:'fixed', left, width, zIndex:99999, ...(spaceBelow>220?{top}:{bottom:window.innerHeight-top}) } });
  };

  const first=new Date(month.y,month.m,1);
  const startWeekday=(first.getDay()+6)%7; // T2 đầu tuần
  const daysInMonth=new Date(month.y,month.m+1,0).getDate();
  const cells:(string|null)[]=[...Array(startWeekday).fill(null), ...Array.from({length:daysInMonth},(_,i)=>`${month.y}-${String(month.m+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`)];

  if(loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>;
  return <div className="space-y-4">
    <div className="flex items-center justify-between">
      <button onClick={()=>{setMonth(p=>{ const m=p.m-1; return m<0?{y:p.y-1,m:11}:{y:p.y,m}; });setPopup(null);}} className="btn-ghost rounded-lg px-3 py-1.5 text-sm">‹</button>
      <span className="text-sm font-600 text-foreground">Tháng {month.m+1}/{month.y}</span>
      <button onClick={()=>{setMonth(p=>{ const m=p.m+1; return m>11?{y:p.y+1,m:0}:{y:p.y,m}; });setPopup(null);}} className="btn-ghost rounded-lg px-3 py-1.5 text-sm">›</button>
    </div>
    <div className="grid grid-cols-7 gap-1.5 text-2xs text-muted-foreground text-center">
      {['T2','T3','T4','T5','T6','T7','CN'].map(d=><div key={d} className="py-1 font-600">{d}</div>)}
      {cells.map((key,i)=>{
        if(!key) return <div key={i}/>;
        const dayItems=byDay.get(key)||[];
        const isToday=key===new Date().toISOString().slice(0,10);
        const priority:(keyof typeof CALENDAR_DOT)[]=['overdue','revision_requested','review','in_progress','completed','other'];
        const topKind=priority.find(k=>dayItems.some(x=>calendarDot(x)===k));
        const hasItems=dayItems.length>0;
        return <button key={key} onClick={e=>hasItems&&openDay(key,e.currentTarget)}
          className={`relative aspect-square rounded-lg border p-1.5 flex flex-col items-center justify-start gap-1.5 transition-colors
            ${popup?.key===key?'border-fuchsia-400 bg-fuchsia-500/10':hasItems?`${CALENDAR_BORDER[topKind||'other']} bg-white/[0.04] hover:bg-white/[0.08]`:'border-white/5 hover:bg-white/5'}
            ${isToday?'ring-1 ring-sky-400/60':''} ${!hasItems?'cursor-default':''}`}>
          <span className="text-2xs text-foreground">{Number(key.slice(8,10))}</span>
          {hasItems && (
            <>
              <span className={`flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-2xs font-700 text-white ${CALENDAR_BADGE[topKind||'other']}`}>{dayItems.length}</span>
              <div className="flex flex-wrap justify-center gap-1">
                {[...new Set(dayItems.map(calendarDot))].slice(0,4).map(kind=><span key={kind} className={`h-2 w-2 rounded-full ring-1 ring-white/30 ${CALENDAR_DOT[kind]}`}/>)}
              </div>
            </>
          )}
        </button>;
      })}
    </div>
    <div className="flex flex-wrap gap-3 text-2xs text-muted-foreground">
      {[['overdue','Quá hạn'],['in_progress','Đang thiết kế'],['review','Chờ duyệt'],['revision_requested','Cần chỉnh sửa'],['completed','Hoàn thành']].map(([k,l])=>
        <span key={k} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${CALENDAR_DOT[k]}`}/>{l}</span>
      )}
    </div>
    {popup && typeof document!=='undefined' && ReactDOM.createPortal(
      <div ref={popupRef} style={{ ...popup.style, background:'var(--card)' }} className="rounded-xl border border-white/10 shadow-2xl p-3">
        <p className="mb-2 text-2xs font-600 text-muted-foreground uppercase tracking-wider">Hạn ngày {popup.key.split('-').reverse().join('/')}</p>
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {(byDay.get(popup.key)||[]).map(x=>
            <button key={x.id} onClick={()=>{onOpen(x); setPopup(null);}} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10">
              <span className="truncate text-sm text-foreground">{x.title}</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs font-600 ${STATUS_COLOR[x.status]}`}>{STATUS[x.status]}</span>
            </button>
          )}
        </div>
      </div>,
      document.body
    )}
  </div>;
}

function dueBucket(x: Item): 'today'|'tomorrow'|'upcoming'|'overdue'|'none' {
  if (!x.due_date) return 'none';
  if (isOverdue(x)) return 'overdue';
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(x.due_date); due.setHours(0,0,0,0);
  const diffDays = Math.round((due.getTime()-today.getTime())/86400000);
  if (diffDays===0) return 'today';
  if (diffDays===1) return 'tomorrow';
  return 'upcoming';
}

// "Việc của tôi" — chỉ những yêu cầu được giao cho user đang đăng nhập, nhóm
// theo trạng thái và theo hạn. Dùng lại đúng danh sách items đã tải (API
// /api/design-requests hiện có), lọc client-side theo assignee_id.
function MyTasks({items,loading,onOpen}:{items:Item[];loading:boolean;onOpen:(x:Item)=>void}) {
  const groups: {key:Status[]; label:string; color:string}[] = [
    { key:['new','accepted'], label:'Chưa làm', color:'text-sky-400' },
    { key:['in_progress'], label:'Đang thiết kế', color:'text-amber-400' },
    { key:['review'], label:'Chờ duyệt', color:'text-fuchsia-400' },
    { key:['revision_requested'], label:'Cần chỉnh sửa', color:'text-orange-400' },
    { key:['blocked'], label:'Đang bị chặn', color:'text-red-400' },
    { key:['completed','approved'], label:'Hoàn thành', color:'text-emerald-400' },
  ];
  const dueGroups: {key:string; label:string}[] = [
    { key:'overdue', label:'Đã quá hạn' }, { key:'today', label:'Hôm nay' },
    { key:'tomorrow', label:'Ngày mai' }, { key:'upcoming', label:'Sắp tới' },
  ];
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>;
  if (!items.length) return <div className="flex flex-col items-center py-20 text-muted-foreground"><ListChecks className="h-10 w-10 mb-3 opacity-30"/><p className="text-sm">Bạn chưa có yêu cầu thiết kế nào được giao</p></div>;

  const openItems = items.filter(x=>!['rejected','archived'].includes(x.status));
  const byDue = dueGroups.map(g=>({ ...g, items: openItems.filter(x=>dueBucket(x)===g.key) })).filter(g=>g.items.length>0);

  return <div className="space-y-6">
    <div>
      <div className="mb-2 text-xs font-600 text-muted-foreground uppercase tracking-wider">Deadline của tôi</div>
      {!byDue.length ? <p className="text-xs text-muted-foreground/70">Không có hạn nào sắp tới.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {byDue.map(g=>
            <div key={g.key} className="rounded-2xl border border-white/5 p-3" style={{ background:'var(--card)' }}>
              <div className={`mb-2 text-xs font-700 ${g.key==='overdue'?'text-red-400':'text-foreground'}`}>{g.label} ({g.items.length})</div>
              <div className="space-y-1.5">
                {g.items.slice(0,4).map(x=>
                  <button key={x.id} onClick={()=>onOpen(x)} className="block w-full truncate rounded-lg px-2 py-1 text-left text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground">{x.title}</button>
                )}
                {g.items.length>4 && <p className="px-2 text-2xs text-muted-foreground/60">+{g.items.length-4} yêu cầu khác</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>

    <div>
      <div className="mb-2 text-xs font-600 text-muted-foreground uppercase tracking-wider">Công việc của tôi</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map(g=>{
          const list=items.filter(x=>g.key.includes(x.status));
          return <div key={g.label} className="rounded-2xl border border-white/5 p-3" style={{ background:'var(--card)' }}>
            <div className={`mb-2 text-xs font-700 ${g.color}`}>{g.label} ({list.length})</div>
            {!list.length ? <p className="text-2xs text-muted-foreground/60">Không có việc</p> : (
              <div className="space-y-1.5">
                {list.map(x=>
                  <button key={x.id} onClick={()=>onOpen(x)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5 transition-colors">
                    <span className="truncate text-xs text-foreground">{x.title}</span>
                    <span className="shrink-0 text-2xs text-muted-foreground">{x.due_date?new Date(x.due_date).toLocaleDateString('vi-VN'):''}</span>
                  </button>
                )}
              </div>
            )}
          </div>;
        })}
      </div>
    </div>
  </div>;
}

// Báo cáo hiệu suất theo người thực hiện — lọc theo tháng + người, tổng hợp
// ngay từ danh sách đã tải (không cần API riêng), xuất Excel theo bộ lọc.
function PerformanceReport({items,loading,onOpen}:{items:Item[];loading:boolean;onOpen:(x:Item)=>void}) {
  const [month,setMonth]=useState('');
  const [personId,setPersonId]=useState<string|null>(null);
  const [expanded,setExpanded]=useState<string|null>(null);

  const people=useMemo(()=>{
    const map=new Map<string,string>();
    for(const x of items){ for(const a of assigneeTeam(x)){ if(a.name) map.set(a.name,a.name); } }
    return [...map.values()].sort((a,b)=>a.localeCompare(b,'vi'));
  },[items]);

  const filtered=useMemo(()=>items.filter(x=>{
    if(month && !x.created_at.slice(0,7).startsWith(month)) return false;
    if(personId && !assigneeTeam(x).some(a=>a.name===personId)) return false;
    return true;
  }),[items,month,personId]);

  const rows=useMemo(()=>{
    const byAssignee=new Map<string,{name:string;open:number;done:number;overdue:number;hours:number;total:number}>();
    for(const x of filtered){
      const team=assigneeTeam(x);
      const names=team.length?team.map(a=>a.name||'Chưa giao'):['Chưa giao'];
      for(const key of names){
        const row=byAssignee.get(key)||{name:key,open:0,done:0,overdue:0,hours:0,total:0};
        row.total+=1;
        if(x.status==='completed') row.done+=1;
        else if(!['rejected','archived'].includes(x.status)) row.open+=1;
        if(isOverdue(x)) row.overdue+=1;
        row.hours+=Number(x.actual_hours||0);
        byAssignee.set(key,row);
      }
    }
    return [...byAssignee.values()].sort((a,b)=>b.total-a.total);
  },[filtered]);

  const byStatus=useMemo(()=>{
    const map=new Map<Status,number>();
    for(const x of filtered) map.set(x.status,(map.get(x.status)||0)+1);
    return (Object.keys(STATUS) as Status[]).map(s=>({ status:s, label:STATUS[s], count:map.get(s)||0 })).filter(r=>r.count>0);
  },[filtered]);

  const byCampaign=useMemo(()=>{
    const map=new Map<string,number>();
    for(const x of filtered) map.set(x.campaign_name||'Không có campaign',(map.get(x.campaign_name||'Không có campaign')||0)+1);
    return [...map.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
  },[filtered]);

  const exportExcel=async()=>{
    const XLSXStyle=(await import('xlsx-js-style')).default;
    const header=['Người thực hiện','Tổng yêu cầu','Đang xử lý','Hoàn thành','Trễ hạn','Tổng giờ thực hiện'];
    const data=rows.map(r=>[r.name,r.total,r.open,r.done,r.overdue,r.hours]);
    const ws=XLSXStyle.utils.aoa_to_sheet([header,...data]);
    ws['!cols']=header.map(h=>({ wch: Math.max(16, h.length+4) }));
    const wb=XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws, 'Hiệu suất thiết kế');
    const label=[month||'tat-ca-thoi-gian', personId||'tat-ca'].join('_').replace(/\s+/g,'-');
    XLSXStyle.writeFile(wb, `bao-cao-hieu-suat-thiet-ke_${label}.xlsx`);
  };

  return <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/5 p-3" style={{ background:'var(--card)' }}>
      <div className="min-w-[220px]">
        <label className={labelCls}>Tháng</label>
        <MonthPickerVN value={month} onChange={setMonth}/>
      </div>
      <div className="min-w-[220px] flex-1">
        <label className={labelCls}>Người thực hiện</label>
        <SearchableSelect
          value={personId}
          onChange={setPersonId}
          placeholder="Tất cả mọi người"
          emptyText="Không có ai khớp"
          options={people.map(p=>({ value:p, label:p }))}
        />
      </div>
      {(month||personId) && <button onClick={()=>{setMonth('');setPersonId(null);}} className="btn-ghost rounded-xl px-3 py-2 text-xs h-10">Xoá lọc</button>}
      <button onClick={exportExcel} disabled={!rows.length} className="btn-accent rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 h-10 disabled:opacity-50 disabled:cursor-not-allowed">
        <Download className="h-4 w-4"/> Xuất báo cáo
      </button>
      <button onClick={()=>setMonth(currentMonth())} className="btn-ghost rounded-xl px-3 py-2 text-xs h-10">Tháng này</button>
    </div>

    {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>
    : !rows.length ? <div className="flex flex-col items-center py-20 text-muted-foreground"><BarChart3 className="h-10 w-10 mb-3 opacity-30"/><p className="text-sm">Không có dữ liệu khớp bộ lọc</p></div>
    : <div className="overflow-x-auto rounded-2xl border border-white/5" style={{ background: 'var(--card)' }}>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-white/10 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">
          <th className="px-4 py-3">Người thực hiện</th>
          <th className="px-4 py-3 text-center">Tổng yêu cầu</th>
          <th className="px-4 py-3 text-center">Đang xử lý</th>
          <th className="px-4 py-3 text-center">Hoàn thành</th>
          <th className="px-4 py-3 text-center">Trễ hạn</th>
          <th className="px-4 py-3 text-right">Tổng giờ thực hiện</th>
        </tr></thead>
        <tbody>{rows.map(r=>{
          const personTasks=filtered.filter(x=>assigneeTeam(x).some(a=>a.name===r.name)||(!assigneeTeam(x).length&&r.name==='Chưa giao'));
          return <Fragment key={r.name}>
          <tr onClick={()=>setExpanded(expanded===r.name?null:r.name)} className="border-b border-white/5 last:border-0 hover:bg-white/5 cursor-pointer">
          <td className="px-4 py-3 flex items-center gap-2 text-foreground font-600"><UserRound className="h-4 w-4 text-fuchsia-400"/>{r.name}<span className="text-2xs text-sky-400 font-400">{expanded===r.name?'▲ ẩn':'▼ xem task'}</span></td>
          <td className="px-4 py-3 text-center text-foreground">{r.total}</td>
          <td className="px-4 py-3 text-center text-sky-400">{r.open}</td>
          <td className="px-4 py-3 text-center text-emerald-400">{r.done}</td>
          <td className={`px-4 py-3 text-center ${r.overdue?'text-red-400 font-600':'text-muted-foreground'}`}>{r.overdue}</td>
          <td className="px-4 py-3 text-right text-foreground">{r.hours.toLocaleString('vi-VN')}</td>
          </tr>
          {expanded===r.name && <tr className="border-b border-white/5 last:border-0">
            <td colSpan={6} className="bg-white/[0.02] px-4 py-3">
              <div className="space-y-1.5">
                {personTasks.map(x=>
                  <button key={x.id} onClick={()=>onOpen(x)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-white/5 transition-colors">
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{x.title}</span>
                    {x.campaign_name && <span className="shrink-0 text-2xs text-muted-foreground">{x.campaign_name}</span>}
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs font-600 ${STATUS_COLOR[x.status]}`}>{STATUS[x.status]}</span>
                    <span className={`shrink-0 w-20 text-right text-2xs ${isOverdue(x)?'text-red-400 font-600':'text-muted-foreground'}`}>{x.due_date?new Date(x.due_date).toLocaleDateString('vi-VN'):'—'}</span>
                    <span className="shrink-0 w-14 text-right text-2xs text-muted-foreground">{Number(x.actual_hours||0)}h</span>
                  </button>
                )}
              </div>
            </td>
          </tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>}

    {!loading && !!filtered.length && <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-white/5 p-4" style={{ background:'var(--card)' }}>
        <p className="mb-3 text-xs font-600 text-muted-foreground uppercase tracking-wider">Theo trạng thái</p>
        <div className="space-y-2">
          {byStatus.map(r=><div key={r.status} className="flex items-center gap-2">
            <span className={`w-28 shrink-0 text-2xs rounded-full border px-2 py-0.5 text-center ${STATUS_COLOR[r.status]}`}>{r.label}</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-fuchsia-500/70" style={{ width:`${Math.round(r.count/filtered.length*100)}%` }}/></div>
            <span className="w-6 shrink-0 text-right text-xs text-foreground">{r.count}</span>
          </div>)}
        </div>
      </div>
      <div className="rounded-2xl border border-white/5 p-4" style={{ background:'var(--card)' }}>
        <p className="mb-3 text-xs font-600 text-muted-foreground uppercase tracking-wider">Theo Campaign</p>
        <div className="space-y-2">
          {byCampaign.map(r=><div key={r.name} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-2xs text-muted-foreground" title={r.name}>{r.name}</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-sky-500/70" style={{ width:`${Math.round(r.count/filtered.length*100)}%` }}/></div>
            <span className="w-6 shrink-0 text-right text-xs text-foreground">{r.count}</span>
          </div>)}
        </div>
      </div>
    </div>}
  </div>;
}

// Form dùng chung cho Tạo mới (item=null) và Sửa (item có sẵn) — cùng 1 modal,
// giống cách OrderModal (module Tuyển Dụng) dùng chung create/edit.
function RequestForm({item,onClose,onSaved}:{item:Item|null;onClose:()=>void;onSaved:(row:Item)=>void}) {
  const toast=useToast();
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const [saving,setSaving]=useState(false);
  const [loadingPeople,setLoadingPeople]=useState(true);
  const [people,setPeople]=useState<Assignee[]>([]);
  const [f,setF]=useState({
    title:item?.title??'', description:item?.description??'', request_type:item?.request_type??'social',
    priority:item?.priority??'normal', quantity:item?.quantity??1, due_date:item?.due_date?item.due_date.slice(0,10):'',
    brief_url:item?.brief_url??'', estimated_hours:item?.estimated_hours!=null?String(item.estimated_hours):'',
    campaign_name:item?.campaign_name??'', channel:item?.channel??'',
    goal:item?.brief_detail?.goal??'', keyMessage:item?.brief_detail?.keyMessage??'', audience:item?.brief_detail?.audience??'',
    copy:item?.brief_detail?.copy??'',
    size:item?.design_spec?.size??'', ratio:item?.design_spec?.ratio??'', formats:item?.design_spec?.formats??'',
  });
  const [assigneeIds,setAssigneeIds]=useState<string[]>(item?assigneeTeam(item).map(a=>a.id):[]);
  const [pickAssignee,setPickAssignee]=useState<string|null>(null);
  const [resources,setResources]=useState<Resource[]>(item?.resources?.length?item.resources:[]);
  useEffect(()=>{void (async()=>{try{const r=await fetch('/api/design-requests/assignees',{headers:headers()});const j=await r.json();if(!r.ok)throw new Error(j.error);setPeople(j.data||[]);}catch(e:any){toast.error(e.message||'Không tải được danh sách nhân sự');}finally{setLoadingPeople(false);}})();},[toast]);
  const selectedPeople=assigneeIds.map(id=>people.find(p=>p.id===id)).filter(Boolean) as Assignee[];
  const addAssignee=(id:string|null)=>{ if(!id||assigneeIds.includes(id)) return; setAssigneeIds(prev=>[...prev,id]); setPickAssignee(null); markDirty(); };
  const removeAssignee=(id:string)=>{ setAssigneeIds(prev=>prev.filter(x=>x!==id)); markDirty(); };
  const set=(k:string,v:unknown)=>{setF(p=>({...p,[k]:v})); markDirty();};
  const submit=async()=>{
    setSaving(true);
    try{
      const briefDetail={ goal:f.goal, keyMessage:f.keyMessage, audience:f.audience, copy:f.copy };
      const designSpec={ size:f.size, ratio:f.ratio, formats:f.formats };
      let r: Response;
      if(item){
        r=await fetch('/api/design-requests',{method:'PATCH',headers:headers(true),body:JSON.stringify({
          id:item.id, title:f.title, description:f.description, request_type:f.request_type, priority:f.priority,
          quantity:f.quantity, due_date:f.due_date||null, brief_url:f.brief_url||null, estimated_hours:f.estimated_hours||null,
          assignee_ids:assigneeIds,
          campaign_name:f.campaign_name||null, channel:f.channel||null, brief_detail:briefDetail, design_spec:designSpec, resources,
        })});
      } else {
        r=await fetch('/api/design-requests',{method:'POST',headers:headers(true),body:JSON.stringify({
          ...f, assignee_ids:assigneeIds, brief_detail:briefDetail, design_spec:designSpec, resources,
        })});
      }
      const j=await r.json();
      if(!r.ok) throw new Error(j.error);
      toast.success(item?'Đã lưu thay đổi':'Đã tạo và giao yêu cầu thiết kế');
      markClean();
      onSaved(j.data);
    }catch(e:any){ toast.error(e.message); }finally{ setSaving(false); }
  };
  const valid=Boolean(f.title.trim()&&f.description.trim()&&assigneeIds.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e=>e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-700 text-foreground">{item?'Sửa yêu cầu thiết kế':'Tạo yêu cầu thiết kế'}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Gửi brief cho bộ phận Thiết kế</p>
          </div>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4"/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-700 text-foreground"><FileText className="h-4 w-4 text-fuchsia-400"/>Thông tin yêu cầu</div>
            <div>
              <label className={labelCls}>Tên yêu cầu *</label>
              <input value={f.title} onChange={e=>set('title',e.target.value)} placeholder="Ví dụ: Thiết kế bộ banner tuyển dụng tháng 8" className={inputCls}/>
            </div>
            <div>
              <label className={labelCls}>Mô tả và quy cách *</label>
              <textarea value={f.description} onChange={e=>set('description',e.target.value)} rows={4} placeholder="Mục tiêu, kích thước, nội dung bắt buộc, định dạng bàn giao..." className={textareaCls}/>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Loại thiết kế</label>
                <select value={f.request_type} onChange={e=>set('request_type',e.target.value)} className={inputCls}>
                  {Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Mức độ ưu tiên</label>
                <select value={f.priority} onChange={e=>set('priority',e.target.value)} className={inputCls}>
                  <option value="low">Thấp</option>
                  <option value="normal">Bình thường</option>
                  <option value="high">Cao</option>
                  <option value="urgent">Khẩn cấp</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Campaign</label>
                <input value={f.campaign_name} onChange={e=>set('campaign_name',e.target.value)} placeholder="Vd: Tuyển dụng Q3" className={inputCls}/>
              </div>
              <div>
                <label className={labelCls}>Kênh sử dụng</label>
                <input value={f.channel} onChange={e=>set('channel',e.target.value)} placeholder="Vd: Facebook, Website, In ấn" className={inputCls}/>
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-white/5 pt-5">
            <div className="flex items-center gap-2 text-sm font-700 text-foreground"><FileText className="h-4 w-4 text-fuchsia-400"/>Nội dung Brief</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelCls}>Mục tiêu</label><input value={f.goal} onChange={e=>set('goal',e.target.value)} className={inputCls}/></div>
              <div><label className={labelCls}>Thông điệp chính</label><input value={f.keyMessage} onChange={e=>set('keyMessage',e.target.value)} className={inputCls}/></div>
              <div><label className={labelCls}>Đối tượng</label><input value={f.audience} onChange={e=>set('audience',e.target.value)} className={inputCls}/></div>
            </div>
            <div><label className={labelCls}>Nội dung / Copy</label><textarea value={f.copy} onChange={e=>set('copy',e.target.value)} rows={2} className={textareaCls}/></div>
          </section>

          <section className="space-y-4 border-t border-white/5 pt-5">
            <div className="flex items-center gap-2 text-sm font-700 text-foreground"><Palette className="h-4 w-4 text-fuchsia-400"/>Thông số thiết kế</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className={labelCls}>Kích thước</label><input value={f.size} onChange={e=>set('size',e.target.value)} placeholder="1080x1080" className={inputCls}/></div>
              <div><label className={labelCls}>Tỷ lệ</label><input value={f.ratio} onChange={e=>set('ratio',e.target.value)} placeholder="1:1, 16:9..." className={inputCls}/></div>
              <div><label className={labelCls}>Định dạng bàn giao</label><input value={f.formats} onChange={e=>set('formats',e.target.value)} placeholder="PNG, PSD, AI..." className={inputCls}/></div>
            </div>
          </section>

          <section className="space-y-4 border-t border-white/5 pt-5">
            <div className="flex items-center gap-2 text-sm font-700 text-foreground"><UserRound className="h-4 w-4 text-sky-400"/>Phân công thực hiện</div>
            <div>
              <label className={labelCls}>Người thực hiện *</label>
              <SearchableSelect
                value={pickAssignee}
                onChange={addAssignee}
                disabled={loadingPeople}
                placeholder={loadingPeople?'Đang tải nhân sự...':people.length?'Gõ để thêm người thực hiện...':'Chưa có nhân sự nào trong công ty'}
                emptyText="Không tìm thấy nhân sự phù hợp"
                options={people.filter(p=>!assigneeIds.includes(p.id)).map(person=>({ value:person.id, label:person.name, sublabel:person.unit_name }))}
              />
            </div>
            {selectedPeople.length>0&&<div className="space-y-2">
              {selectedPeople.map(person=>
                <div key={person.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/15 text-sm font-700 text-fuchsia-300">{person.name.trim().charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-600 text-foreground">{person.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{person.unit_name}{person.email?` · ${person.email}`:''}</div>
                  </div>
                  <button type="button" onClick={()=>removeAssignee(person.id)} className="btn-ghost rounded-lg p-1.5 shrink-0 text-muted-foreground hover:text-red-400"><X className="h-3.5 w-3.5"/></button>
                </div>
              )}
            </div>}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Số lượng</label>
                <input type="number" min={1} value={f.quantity} onChange={e=>set('quantity',Number(e.target.value))} className={inputCls}/>
              </div>
              <div>
                <label className={labelCls}>Giờ dự kiến</label>
                <input type="number" min={0} step={0.5} value={f.estimated_hours} onChange={e=>set('estimated_hours',e.target.value)} placeholder="0" className={inputCls}/>
              </div>
              <div>
                <label className={labelCls}>Hạn bàn giao</label>
                <DateInputVN value={f.due_date} onChange={e=>set('due_date',e.target.value)} className={inputCls}/>
              </div>
            </div>
          </section>

          <section className="border-t border-white/5 pt-5 space-y-3">
            <label className={labelCls}>Link brief chính</label>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"/>
              <input value={f.brief_url} onChange={e=>set('brief_url',e.target.value)} placeholder="https://figma.com hoặc Google Drive..." className={`${inputCls} pl-10`}/>
            </div>
            <label className={labelCls}>Tài nguyên khác (hình ảnh tham khảo, brand guideline, logo...)</label>
            <div className="space-y-2">
              {resources.map((res,i)=>
                <div key={i} className="flex gap-2">
                  <input value={res.label} onChange={e=>setResources(prev=>prev.map((r,idx)=>idx===i?{...r,label:e.target.value}:r))} placeholder="Tên" className={`${inputCls} w-32 shrink-0`}/>
                  <input value={res.url} onChange={e=>setResources(prev=>prev.map((r,idx)=>idx===i?{...r,url:e.target.value}:r))} placeholder="https://..." className={inputCls}/>
                  <button type="button" onClick={()=>setResources(prev=>prev.filter((_,idx)=>idx!==i))} className="btn-ghost rounded-lg p-2 shrink-0 text-muted-foreground hover:text-red-400"><X className="h-4 w-4"/></button>
                </div>
              )}
              <button type="button" onClick={()=>setResources(prev=>[...prev,{label:'',url:''}])} className="btn-ghost rounded-xl px-3 py-1.5 text-xs">+ Thêm tài nguyên</button>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4 shrink-0">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button disabled={saving||!valid} onClick={submit} className="btn-accent rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
            {saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}{saving?'Đang lưu...':item?'Lưu':'Gửi và giao việc'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({item,currentUserId,onClose,onEdit,onUpdate}:{item:Item;currentUserId:string;onClose:()=>void;onEdit:()=>void;onUpdate:(id:string,b:Record<string,unknown>)=>Promise<Item>}) {
  const toast=useToast();
  useEscapeKey(onClose);
  const [tab,setTab]=useState<'info'|'versions'|'feedback'|'note'>('info');
  const [result,setResult]=useState(item.result_url||'');
  const [note,setNote]=useState(item.result_note||'');
  const [hours,setHours]=useState(String(item.actual_hours||''));
  const [blocking,setBlocking]=useState(false);
  const [blockReason,setBlockReason]=useState('');
  const [blockNote,setBlockNote]=useState('');
  const act=async(status:Status)=>{
    try {
      await onUpdate(item.id,{status,result_url:result,result_note:note,actual_hours:hours||null});
      toast.success('Đã cập nhật yêu cầu');
      if(status==='archived')onClose();
    } catch(e:any) { toast.error(e.message); }
  };
  const submitBlock=async()=>{
    if(!blockReason){ toast.error('Vui lòng chọn lý do bị chặn'); return; }
    try {
      await onUpdate(item.id,{status:'blocked',block_reason:blockReason,block_note:blockNote});
      toast.success('Đã báo task đang bị chặn');
      setBlocking(false);
    } catch(e:any) { toast.error(e.message); }
  };
  const actionsByStatus:Record<Status,{status:Status;label:string;primary?:boolean}[]> = {
    new:[{status:'accepted',label:'Tiếp nhận',primary:true},{status:'rejected',label:'Trả yêu cầu'}],
    accepted:[{status:'in_progress',label:'Bắt đầu thực hiện',primary:true},{status:'rejected',label:'Trả yêu cầu'}],
    in_progress:[{status:'review',label:'Gửi duyệt',primary:true},{status:'rejected',label:'Trả yêu cầu'}],
    review:[{status:'revision_requested',label:'Yêu cầu chỉnh sửa'},{status:'approved',label:'Duyệt',primary:true}],
    revision_requested:[{status:'in_progress',label:'Tiếp tục chỉnh sửa',primary:true}],
    approved:[{status:'completed',label:'Hoàn thành',primary:true}],
    completed:[{status:'archived',label:'Lưu trữ task',primary:true}],
    rejected:[{status:'new',label:'Mở lại yêu cầu',primary:true},{status:'archived',label:'Lưu trữ task'}],
    archived:[],
    blocked:[{status:'in_progress',label:'Đã xử lý xong, tiếp tục',primary:true}],
  };
  const actions=actionsByStatus[item.status];
  const canBlock = !['completed','rejected','archived','blocked'].includes(item.status);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e=>e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-700 text-foreground">{item.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{TYPES[item.request_type]||item.request_type} · {item.quantity||1} sản phẩm</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={onEdit} className="btn-ghost rounded-lg p-1.5" title="Sửa"><Pencil className="h-4 w-4"/></button>
            <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4"/></button>
          </div>
        </div>
        <div className="flex gap-1 border-b border-white/5 px-6 shrink-0 overflow-x-auto">
          {[['info','Thông tin'],['versions','Phiên bản'],['feedback','Feedback'],['note','Ghi chú & Kết quả']].map(([k,l])=>
            <button key={k} onClick={()=>setTab(k as 'info'|'versions'|'feedback'|'note')} className={`h-10 px-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${tab===k?'border-fuchsia-400 text-foreground':'border-transparent text-muted-foreground hover:text-foreground'}`}>{l}</button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab==='info' ? <>
            <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Trạng thái</span><span className={`rounded-lg border px-2 py-1 text-sm ${STATUS_COLOR[item.status]}`}>{STATUS[item.status]}</span></div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
              <div className="text-xs text-muted-foreground mb-2">Người thực hiện{assigneeTeam(item).length>1?` (${assigneeTeam(item).length} người)`:''}</div>
              {!assigneeTeam(item).length ? <p className="text-sm text-foreground">Chưa được phân công</p> : (
                <div className="flex flex-wrap gap-2">
                  {assigneeTeam(item).map(a=>
                    <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-foreground">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-500/20 text-2xs font-700 text-fuchsia-300">{(a.name||'?').trim().charAt(0).toUpperCase()}</span>
                      {a.name}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div><span className="block uppercase tracking-wider text-2xs mb-1">Người gửi</span><span className="text-sm text-foreground">{item.requester_name||'—'}</span></div>
              <div><span className="block uppercase tracking-wider text-2xs mb-1">Hạn bàn giao</span><span className="text-sm text-foreground">{item.due_date?new Date(item.due_date).toLocaleDateString('vi-VN'):'Chưa có hạn'}</span></div>
            </div>
            {(item.campaign_name||item.channel) && <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              {item.campaign_name && <div><span className="block uppercase tracking-wider text-2xs mb-1">Campaign</span><span className="text-sm text-foreground">{item.campaign_name}</span></div>}
              {item.channel && <div><span className="block uppercase tracking-wider text-2xs mb-1">Kênh sử dụng</span><span className="text-sm text-foreground">{item.channel}</span></div>}
            </div>}
            {item.status==='blocked' && item.block_reason && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5">
              <p className="text-xs font-600 text-red-300">Đang bị chặn: {BLOCK_REASONS[item.block_reason]||item.block_reason}</p>
              {item.block_note && <p className="mt-1 text-xs text-red-300/80">{item.block_note}</p>}
            </div>}
            <p className="text-sm leading-6 text-muted-foreground">{item.description||'Không có mô tả'}</p>
            {item.brief_detail && (item.brief_detail.goal||item.brief_detail.keyMessage||item.brief_detail.audience||item.brief_detail.copy) && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 space-y-1.5 text-xs">
                {item.brief_detail.goal && <p><b className="text-muted-foreground">Mục tiêu:</b> <span className="text-foreground">{item.brief_detail.goal}</span></p>}
                {item.brief_detail.keyMessage && <p><b className="text-muted-foreground">Thông điệp chính:</b> <span className="text-foreground">{item.brief_detail.keyMessage}</span></p>}
                {item.brief_detail.audience && <p><b className="text-muted-foreground">Đối tượng:</b> <span className="text-foreground">{item.brief_detail.audience}</span></p>}
                {item.brief_detail.copy && <p><b className="text-muted-foreground">Nội dung:</b> <span className="text-foreground">{item.brief_detail.copy}</span></p>}
              </div>
            )}
            {item.design_spec && (item.design_spec.size||item.design_spec.ratio||item.design_spec.formats) && (
              <div className="flex flex-wrap gap-2 text-2xs text-muted-foreground">
                {item.design_spec.size && <span className="rounded-lg border border-white/10 px-2 py-1">Kích thước: {item.design_spec.size}</span>}
                {item.design_spec.ratio && <span className="rounded-lg border border-white/10 px-2 py-1">Tỷ lệ: {item.design_spec.ratio}</span>}
                {item.design_spec.formats && <span className="rounded-lg border border-white/10 px-2 py-1">Định dạng: {item.design_spec.formats}</span>}
              </div>
            )}
            {item.brief_url&&<a href={item.brief_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300"><ExternalLink className="h-4 w-4"/>Mở tài liệu yêu cầu</a>}
            {item.resources?.filter(r=>r.url).map((r,i)=>
              <a key={i} href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300"><ExternalLink className="h-4 w-4"/>{r.label||r.url}</a>
            )}
          </> : tab==='versions' ? <VersionsTab requestId={item.id}/>
          : tab==='feedback' ? <FeedbackTab requestId={item.id} currentUserId={currentUserId}/>
          : <>
            <div>
              <label className={labelCls}>Giờ thực hiện</label>
              <input type="number" min={0} step={0.5} value={hours} onChange={e=>setHours(e.target.value)} className={inputCls}/>
            </div>
            <div>
              <label className={labelCls}>Link kết quả</label>
              <input value={result} onChange={e=>setResult(e.target.value)} placeholder="Figma, Drive..." className={inputCls}/>
            </div>
            <div>
              <label className={labelCls}>{item.status==='rejected'?'Lý do trả yêu cầu':'Ghi chú bàn giao'}</label>
              <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} className={textareaCls}/>
            </div>
          </>}
        </div>
        {(actions.length>0||canBlock)&&<div className="flex flex-wrap gap-3 border-t border-white/5 px-6 py-4 shrink-0">
          {actions.map(action=><button key={action.status} onClick={()=>void act(action.status)} className={`${action.primary?'btn-accent':'btn-ghost'} rounded-xl px-4 py-2 text-sm font-600 flex-1`}>{action.label}</button>)}
          {canBlock && <button onClick={()=>setBlocking(true)} className="btn-ghost rounded-xl px-4 py-2 text-sm font-600 text-red-400 hover:text-red-300 flex-1">Báo đang bị chặn</button>}
        </div>}
      </div>

      {blocking && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.7)' }} onClick={e=>{e.stopPropagation();setBlocking(false);}}>
          <div className="w-full max-w-sm rounded-3xl border border-white/10 p-6 space-y-4" style={{ background:'var(--card)' }} onClick={e=>e.stopPropagation()}>
            <h3 className="text-base font-700 text-foreground">Báo task đang bị chặn</h3>
            <div>
              <label className={labelCls}>Lý do *</label>
              <select value={blockReason} onChange={e=>setBlockReason(e.target.value)} className={inputCls}>
                <option value="">— Chọn lý do —</option>
                {Object.entries(BLOCK_REASONS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Mô tả vấn đề</label>
              <textarea value={blockNote} onChange={e=>setBlockNote(e.target.value)} rows={3} className={textareaCls}/>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={()=>setBlocking(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Huỷ</button>
              <button onClick={submitBlock} className="rounded-xl px-4 py-2 text-sm font-600 text-white bg-red-600 hover:bg-red-700">Xác nhận</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type VersionRow = { id:string; version_no:number; file_name:string|null; note:string|null; status:string; uploaded_by_name:string|null; created_at:string; url:string|null };
const VERSION_ALLOWED_EXT = ['png','jpg','jpeg','gif','webp','svg','pdf','psd','ai','eps','sketch','fig','zip'];

// Tab "Phiên bản" — upload/liệt kê các lần nộp bài, đánh dấu bản đã duyệt rõ
// ràng để tránh nhầm file cũ. File lưu qua module media dùng chung (MinIO).
function VersionsTab({requestId}:{requestId:string}) {
  const toast=useToast();
  const [items,setItems]=useState<VersionRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [note,setNote]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);
    try{ const r=await fetch(`/api/design-requests/${requestId}/versions`,{headers:headers()}); const j=await r.json(); if(!r.ok) throw new Error(j.error); setItems(j.data||[]); }
    catch(e:any){ toast.error(e.message||'Không tải được danh sách phiên bản'); }
    finally{ setLoading(false); }
  },[requestId,toast]);
  useEffect(()=>{void load();},[load]);

  const upload=async(file:File)=>{
    const ext=file.name.split('.').pop()?.toLowerCase()||'';
    if(!VERSION_ALLOWED_EXT.includes(ext)){ toast.error(`Định dạng .${ext} không được hỗ trợ. Chỉ nhận: ${VERSION_ALLOWED_EXT.join(', ')}`); return; }
    if(file.size>20*1024*1024){ toast.error('File vượt quá 20MB'); return; }
    setUploading(true);
    try{
      const form=new FormData(); form.append('file',file); form.append('note',note);
      const u=JSON.parse(localStorage.getItem('assetflow_auth')||'{}');
      const r=await fetch(`/api/design-requests/${requestId}/versions`,{method:'POST',headers:{'x-current-user-id':u.id||'','x-current-user-role':u.role||'','x-current-user-company':u.active_company_id||u.company_id||'','x-user-permissions':JSON.stringify(u.module_permissions||{})},body:form});
      const j=await r.json(); if(!r.ok) throw new Error(j.error);
      toast.success('Đã tải lên phiên bản mới');
      setNote('');
      await load();
    }catch(e:any){ toast.error(e.message||'Tải file thất bại'); }
    finally{ setUploading(false); }
  };

  const approve=async(versionId:string)=>{
    try{
      const r=await fetch(`/api/design-requests/${requestId}/versions/${versionId}`,{method:'PATCH',headers:headers(true),body:JSON.stringify({status:'approved'})});
      const j=await r.json(); if(!r.ok) throw new Error(j.error);
      toast.success('Đã đánh dấu phiên bản này là bản duyệt');
      await load();
    }catch(e:any){ toast.error(e.message); }
  };

  return <div className="space-y-4">
    <div className="rounded-xl border border-dashed border-white/20 p-4 space-y-3">
      <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ghi chú cho phiên bản này (tuỳ chọn)" className={inputCls}/>
      <label className={`flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm cursor-pointer hover:bg-white/10 transition-colors ${uploading?'opacity-60 pointer-events-none':''}`}>
        {uploading?<Loader2 className="h-4 w-4 animate-spin"/>:<Upload className="h-4 w-4"/>}
        <span>{uploading?'Đang tải lên...':'Chọn file thiết kế để tải lên phiên bản mới'}</span>
        <input type="file" accept={VERSION_ALLOWED_EXT.map(e=>`.${e}`).join(',')} className="hidden" disabled={uploading} onChange={e=>{const f=e.target.files?.[0]; if(f) void upload(f); e.target.value='';}}/>
      </label>
    </div>

    {loading?<div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/></div>
    :!items.length?<p className="text-center text-xs text-muted-foreground py-6">Chưa có phiên bản nào được tải lên</p>
    :<div className="space-y-2">
      {items.map(v=>
        <div key={v.id} className={`rounded-xl border p-3 flex items-start gap-3 ${v.status==='approved'?'border-emerald-500/40 bg-emerald-500/5':'border-white/10 bg-white/5'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/15 text-fuchsia-300"><ImageIcon className="h-4 w-4"/></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-600 text-foreground">Phiên bản {v.version_no}</span>
              {v.status==='approved' && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-2xs font-700 text-emerald-300"><CheckCircle2 className="h-3 w-3"/>ĐÃ DUYỆT</span>}
            </div>
            <p className="text-2xs text-muted-foreground truncate">{v.uploaded_by_name||'—'} · {new Date(v.created_at).toLocaleString('vi-VN')}</p>
            {v.note && <p className="mt-1 text-xs text-muted-foreground">{v.note}</p>}
          </div>
          <div className="flex shrink-0 gap-1">
            {v.url && <a href={v.url} target="_blank" rel="noreferrer" className="btn-ghost rounded-lg p-2" title="Xem file"><ExternalLink className="h-3.5 w-3.5"/></a>}
            {v.status!=='approved' && <button onClick={()=>approve(v.id)} className="btn-ghost rounded-lg p-2 text-emerald-400 hover:text-emerald-300" title="Đánh dấu đã duyệt"><CheckCircle2 className="h-3.5 w-3.5"/></button>}
          </div>
        </div>
      )}
    </div>}
  </div>;
}

type FeedbackRow = { id:string; author_id:string|null; author_name:string|null; message:string; status:string; created_at:string };

// Tab "Feedback" — trao đổi giữa người gửi và người thực hiện ngay trên
// task, đánh dấu đã xử lý để tránh bỏ sót.
function FeedbackTab({requestId,currentUserId}:{requestId:string;currentUserId:string}) {
  const toast=useToast();
  const [items,setItems]=useState<FeedbackRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [sending,setSending]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{ const r=await fetch(`/api/design-requests/${requestId}/feedback`,{headers:headers()}); const j=await r.json(); if(!r.ok) throw new Error(j.error); setItems(j.data||[]); }
    catch(e:any){ toast.error(e.message||'Không tải được feedback'); }
    finally{ setLoading(false); }
  },[requestId,toast]);
  useEffect(()=>{void load();},[load]);

  const send=async()=>{
    if(!message.trim()) return;
    setSending(true);
    try{
      const r=await fetch(`/api/design-requests/${requestId}/feedback`,{method:'POST',headers:headers(true),body:JSON.stringify({message})});
      const j=await r.json(); if(!r.ok) throw new Error(j.error);
      setMessage('');
      await load();
    }catch(e:any){ toast.error(e.message); }
    finally{ setSending(false); }
  };

  const resolve=async(id:string,status:string)=>{
    try{
      const r=await fetch(`/api/design-requests/${requestId}/feedback/${id}`,{method:'PATCH',headers:headers(true),body:JSON.stringify({status})});
      const j=await r.json(); if(!r.ok) throw new Error(j.error);
      await load();
    }catch(e:any){ toast.error(e.message); }
  };

  return <div className="space-y-4">
    <div className="flex gap-2">
      <input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') void send();}} placeholder="Viết feedback..." className={inputCls}/>
      <button onClick={send} disabled={sending||!message.trim()} className="btn-accent rounded-xl px-4 py-2 text-sm font-600 shrink-0 disabled:opacity-50">
        {sending?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}
      </button>
    </div>

    {loading?<div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/></div>
    :!items.length?<div className="flex flex-col items-center py-10 text-muted-foreground"><MessageCircle className="h-8 w-8 mb-2 opacity-30"/><p className="text-xs">Chưa có feedback nào</p></div>
    :<div className="space-y-2">
      {items.map(f=>
        <div key={f.id} className={`rounded-xl border p-3 ${f.author_id===currentUserId?'border-sky-500/20 bg-sky-500/5':'border-white/10 bg-white/5'}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-600 text-foreground">{f.author_name||'Người dùng'}</span>
            <span className="text-2xs text-muted-foreground">{new Date(f.created_at).toLocaleString('vi-VN')}</span>
          </div>
          <p className="text-sm text-muted-foreground leading-5">{f.message}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className={`text-2xs font-600 ${f.status==='resolved'?'text-emerald-400':'text-amber-400'}`}>{f.status==='resolved'?'Đã xử lý':'Chưa xử lý'}</span>
            <button onClick={()=>resolve(f.id, f.status==='resolved'?'open':'resolved')} className="text-2xs text-sky-400 hover:text-sky-300">
              {f.status==='resolved'?'Mở lại':'Đánh dấu đã xử lý'}
            </button>
          </div>
        </div>
      )}
    </div>}
  </div>;
}
