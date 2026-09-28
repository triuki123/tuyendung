'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Send, Loader2, FileSearch, MessageSquare, ListChecks, Plus, Trash2, ArrowLeft, Bell } from 'lucide-react';
import { authHeaders } from '@/lib/api/onboardingApi';
import { FDV_WEIGHTS } from '@/lib/fdv';
import { FDV_DEMO_CVS, FDV_DEMO_JDS, fdvDemoAnalysis, fdvDemoAnswer } from '@/lib/fdvDemo';

type Task = { id: string; title: string; due_at: string; done: boolean };
const field = 'w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm';
async function api(path: string, method = 'GET', body?: object) {
  const response = await fetch(path, { method, headers: authHeaders(!!body), ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Không kết nối được máy chủ');
  return result.data;
}
export default function FdvClient() {
  const [tab, setTab] = useState('analysis');
  const [demo, setDemo] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [cvs, setCvs] = useState<any[]>([]);
  const [jds, setJds] = useState<any[]>([]);
  const [cvId, setCvId] = useState('');
  const [jdId, setJdId] = useState('');
  const [cvSearch, setCvSearch] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [web, setWeb] = useState(false);
  const [answer, setAnswer] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    api('/api/hr/fdv').then(d => setConfigured(d.configured)).catch(e => setError(e.message));
    api('/api/hr/jd?status=active').then(setJds).catch(e => setError(e.message));
    api('/api/hr/fdv/tasks').then(setTasks).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch('/api/hr/cv/search', { method: 'POST', headers: authHeaders(true), signal: controller.signal, body: JSON.stringify({ keyword: cvSearch, limit: 100 }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Không tải được CV');
        setCvs(Array.isArray(d.data) ? d.data : []);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được CV'); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [cvSearch]);
  async function run(mode: string) {
    if (demo) {
      setError('');
      if (mode === 'ats' || mode === 'summary') setAnalysis(fdvDemoAnalysis(mode === 'summary'));
      else setAnswer(fdvDemoAnswer(mode === 'web'));
      return;
    }
    setBusy(true); setError('');
    if (mode === 'ats' || mode === 'summary') setAnalysis(null); else setAnswer(null);
    try {
      const data = await api('/api/hr/fdv', 'POST', { mode, cvId, jdId, consent, message });
      if (mode === 'ats' || mode === 'summary') setAnalysis(data); else setAnswer(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không xử lý được'); }
    finally { setBusy(false); }
  }
  async function taskAction(method: string, body: object) {
    setBusy(true); setError('');
    try {
      await api('/api/hr/fdv/tasks', method, body);
      setTasks(await api('/api/hr/fdv/tasks'));
      if (method === 'POST') { setTitle(''); setDue(''); }
      setDeleting(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được'); }
    finally { setBusy(false); }
  }
  const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
  const visibleCvs = demo ? FDV_DEMO_CVS : cvs;
  const visibleJds = demo ? FDV_DEMO_JDS : jds;
  function toggleDemo() {
    if (busy) return;
    const next = !demo;
    setDemo(next); setAnalysis(null); setAnswer(null); setError('');
    setCvId(next ? 'demo-cv' : ''); setJdId(next ? 'demo-jd' : ''); setConsent(false);
  }
  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-7">
    <Link href="/nguon-nhan-luc" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16} /> Tuyển dụng</Link>
    <header className="flex items-start gap-4"><div className="rounded-2xl bg-blue-100 p-3 text-blue-600"><Sparkles size={28} /></div><div><h1 className="text-3xl font-bold tracking-tight">FDV <span className="text-lg font-medium text-muted-foreground">FADO Visions</span></h1><p className="mt-1 text-sm text-muted-foreground">Trợ lý TA · Hiểu hồ sơ, đối chiếu vị trí, chủ động công việc.</p></div></header>
    <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy} aria-pressed={demo} onClick={toggleDemo} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${demo ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-line bg-white text-foreground'}`}>{demo ? 'Tắt chế độ Demo' : 'Chế độ Demo'}</button><span className="text-xs text-muted-foreground">Thử Phân tích CV và Hỏi FDV miễn phí với dữ liệu mẫu.</span></div>
    {demo && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>DEMO · Kết quả giả lập, không phải đánh giá AI thật.</strong><p className="mt-1">Không gọi OpenAI, không dùng hồ sơ thật và không tra cứu web. Công việc & nhắc hạn vẫn là dữ liệu thật; thao tác lưu tại đó sẽ ghi vào hệ thống.</p></div>}
    {!demo && configured === false && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">AI chưa được kích hoạt. Quản trị viên cần cấu hình <code>OPENAI_API_KEY</code> trên máy chủ. Bạn vẫn có thể tạo công việc và nhắc hạn.</div>}
    <nav aria-label="Chức năng FDV" className="flex flex-wrap gap-2">{[['analysis', FileSearch, 'Phân tích CV'], ['chat', MessageSquare, 'Hỏi FDV'], ['tasks', ListChecks, 'Công việc & nhắc hạn']].map(([id, Icon, label]: any) => <button key={id} onClick={() => { setTab(id); setError(''); }} aria-pressed={tab === id} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === id ? 'bg-blue-100 text-blue-700' : 'border border-line bg-white text-muted-foreground'}`}><Icon size={17} />{label}</button>)}</nav>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {tab === 'analysis' && <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
      <section className="space-y-4 rounded-2xl border border-line bg-white p-5"><h2 className="font-semibold">Chọn hồ sơ & vị trí</h2>
        <label className="block space-y-2 text-sm"><span>Tìm ứng viên</span><input disabled={busy || demo} className={field} value={cvSearch} onChange={e => setCvSearch(e.target.value)} placeholder="Tên, vị trí hoặc kỹ năng…" /></label>
        <label className="block space-y-2 text-sm"><span>CV ứng viên</span><select disabled={busy} className={field} value={cvId} onChange={e => { setCvId(e.target.value); setConsent(false); setAnalysis(null); }}><option value="">Chọn hồ sơ</option>{visibleCvs.map(c => <option value={c.id} key={c.id}>{c.candidate_name} · {c.position_applied || 'Chưa có vị trí'}</option>)}</select></label>
        <label className="block space-y-2 text-sm"><span>Đối chiếu JD</span><select disabled={busy} className={field} value={jdId} onChange={e => { setJdId(e.target.value); setAnalysis(null); }}><option value="">Đề xuất từ tối đa 10 JD mới nhất</option>{visibleJds.map(j => <option value={j.id} key={j.id}>{j.title}</option>)}</select></label>
        {!demo && <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><input disabled={busy} type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" />Tôi có quyền sử dụng hồ sơ này và đồng ý gửi nội dung CV/JD sang OpenAI để phân tích.</label>}
        <button disabled={busy || !cvId || (!demo && (!consent || configured !== true))} onClick={() => run('ats')} className={`${primary} w-full`}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}Chấm phù hợp & đề xuất</button>
        <button disabled={busy || !cvId || (!demo && (!consent || configured !== true))} onClick={() => run('summary')} className="w-full rounded-xl border border-line px-4 py-2.5 text-sm disabled:opacity-50">Chỉ tóm tắt CV</button>
        <p className="text-xs leading-relaxed text-muted-foreground">Điểm năng lực tham khảo: kỹ năng 40%, kinh nghiệm 30%, trách nhiệm 20%, ngành 10%. TA xác minh và quyết định; FDV không tự tuyển/loại.</p>
      </section>
      <section aria-live="polite" className="min-h-[380px] space-y-5 rounded-2xl border border-line bg-white p-6">
        {!analysis ? <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-muted-foreground"><FileSearch size={36} className="text-blue-400" /><h2 className="font-semibold text-foreground">Một góc nhìn TA, có bằng chứng</h2><p className="max-w-sm text-sm">Chọn CV để xem tóm tắt, thế mạnh, thông tin cần xác minh và mức phù hợp với JD.</p>{busy && <p className="text-sm">FDV đang phân tích…</p>}</div> : <>
          <div>{analysis.demo && <p className="mb-3 text-xs font-bold text-amber-800">DEMO · BÁO CÁO GIẢ LẬP — KHÔNG DÙNG ĐÁNH GIÁ ỨNG VIÊN THẬT</p>}<h2 className="mb-2 text-lg font-semibold">Tóm tắt hồ sơ</h2><p className="whitespace-pre-wrap text-sm leading-7">{analysis.summary}</p></div>
          <div className="grid gap-4 sm:grid-cols-2">{[['strengths', 'Thế mạnh'], ['gaps', 'Cần xác minh']].map(([key, label]) => <div key={key} className="rounded-xl bg-surface-2 p-4"><h3 className="mb-2 text-sm font-semibold">{label}</h3><ul className="list-disc space-y-2 pl-4 text-sm">{analysis[key]?.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>)}</div>
          {!!analysis.matches?.length && <div className="space-y-3"><h3 className="font-semibold">Phù hợp với vị trí</h3><p className="text-xs text-muted-foreground">Đã đối chiếu {analysis.compared}/{analysis.totalJds} JD đang dùng. Điểm không phải xác suất được tuyển.</p>{analysis.matches.map((m: any) => <article key={m.jd_id} className="rounded-xl border border-line p-4"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold">{m.title}</h4><span className="rounded-lg bg-blue-50 px-3 py-1 text-lg font-bold text-blue-700">{m.score}/100</span></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">{Object.entries(FDV_WEIGHTS).map(([key]) => <span key={key}>{({ skills: 'Kỹ năng', experience: 'Kinh nghiệm', responsibilities: 'Trách nhiệm', domain: 'Ngành' } as any)[key]}: {m[key]}</span>)}</div><details className="mt-3 text-sm"><summary className="cursor-pointer text-blue-600">Bằng chứng & điểm còn thiếu</summary><ul className="mt-2 list-disc space-y-1 pl-4">{m.evidence.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul><p className="mt-3 font-medium">Chưa xác minh</p><ul className="mt-2 list-disc space-y-1 pl-4">{m.missing.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></details></article>)}</div>}
          <div><h3 className="mb-2 font-semibold">Câu hỏi phỏng vấn đề xuất</h3><ul className="list-disc space-y-2 pl-4 text-sm">{analysis.interview_questions?.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
          {analysis.truncated && <p className="text-xs text-amber-700">Tài liệu dài: giới hạn 24.000 ký tự CV và 8.000 ký tự/JD. Vui lòng kiểm tra phần còn lại với tài liệu gốc.</p>}
        </>}
      </section>
    </div>}
    {tab === 'chat' && <section className="space-y-5 rounded-2xl border border-line bg-white p-6"><h2 className="text-lg font-semibold">Bạn muốn FDV hỗ trợ điều gì?</h2><div className="flex flex-wrap gap-2">{['Thiết kế bộ câu hỏi phỏng vấn Sales B2B', 'Kỹ năng cần có của một trưởng phòng kế toán', 'Xu hướng tuyển dụng ngành logistics mới nhất'].map(x => <button key={x} onClick={() => setMessage(x)} className="rounded-xl border border-line px-3 py-2 text-left text-xs">{x}</button>)}</div>
      <label className="block"><span className="sr-only">Câu hỏi cho FDV</span><textarea className={field} rows={4} maxLength={4000} value={message} onChange={e => setMessage(e.target.value)} placeholder="Hỏi về ngành, nghiệp vụ TA hoặc tra cứu thông tin cập nhật…" /></label>
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={web} onChange={e => setWeb(e.target.checked)} />Tra cứu web cập nhật, có nguồn</label><button className={primary} disabled={busy || !message.trim() || (!demo && configured !== true)} onClick={() => run(web ? 'web' : 'chat')}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Hỏi FDV</button></div>
      <p className="text-xs text-muted-foreground">Không nhập thông tin cá nhân/bí mật vào câu hỏi web. Chế độ hỏi đáp không tự đọc toàn bộ CV và không tạo lịch/task.</p>
      {answer && <div aria-live="polite" className="rounded-xl bg-surface-2 p-5">{answer.demo && <p className="mb-3 text-xs font-bold text-amber-800">DEMO · CÂU TRẢ LỜI GIẢ LẬP</p>}<p className="whitespace-pre-wrap text-sm leading-7">{answer.text}</p>{!!answer.sources?.length && <div className="mt-4 space-y-2 border-t border-line pt-4"><h3 className="text-sm font-semibold">Nguồn tra cứu</h3>{answer.sources.map((s: any, i: number) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="block break-words text-sm text-blue-600 underline">{s.title}</a>)}</div>}</div>}
    </section>}
    {tab === 'tasks' && <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]"><form className="space-y-4 rounded-2xl border border-line bg-white p-5" onSubmit={e => { e.preventDefault(); if (due) taskAction('POST', { title, dueAt: `${due}:00+07:00`, remindMinutes: Number(minutes) }); }}><h2 className="flex items-center gap-2 font-semibold"><Bell size={17} />Thêm công việc</h2><label className="block space-y-2 text-sm"><span>Công việc cần hoàn thành</span><input required maxLength={300} className={field} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Gửi kết quả PV cho ứng viên" /></label><label className="block space-y-2 text-sm"><span>Hạn hoàn thành · giờ Việt Nam</span><input required type="datetime-local" className={field} value={due} onChange={e => setDue(e.target.value)} /></label><label className="block space-y-2 text-sm"><span>Nhắc trước hạn</span><select className={field} value={minutes} onChange={e => setMinutes(e.target.value)}>{[[0, 'Đúng hạn'], [15, '15 phút'], [30, '30 phút'], [60, '1 giờ'], [1440, '1 ngày']].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><button disabled={busy} className={`${primary} w-full`}><Plus size={16} />Lưu công việc</button><p className="text-xs leading-relaxed text-muted-foreground">Nhắc qua thông báo ứng dụng và Telegram đã liên kết khi máy chủ chạy. Công việc này không tự đặt phòng/lịch phỏng vấn.</p><Link href="/nguon-nhan-luc/lich-phong-van" className="block text-sm text-blue-600">Mở lịch phỏng vấn →</Link></form>
      <section className="space-y-3 rounded-2xl border border-line bg-white p-5"><h2 className="font-semibold">Công việc của tôi <span className="text-sm text-muted-foreground">({tasks.filter(t => !t.done).length} chưa hoàn thành)</span></h2>{!tasks.length && <p className="py-10 text-center text-sm text-muted-foreground">Chưa có công việc. Tạo nhắc hạn đầu tiên bên cạnh.</p>}{tasks.map(t => <div key={t.id} className="flex items-start gap-3 rounded-xl border border-line p-4"><input aria-label={`Hoàn thành ${t.title}`} disabled={busy} type="checkbox" checked={t.done} onChange={e => taskAction('PATCH', { id: t.id, done: e.target.checked })} className="mt-1" /><div className="min-w-0 flex-1"><p className={`break-words text-sm font-medium ${t.done ? 'text-muted-foreground line-through' : ''}`}>{t.title}</p><p className={`mt-1 text-xs ${!t.done && new Date(t.due_at).getTime() < Date.now() ? 'text-red-600' : 'text-muted-foreground'}`}>{!t.done && new Date(t.due_at).getTime() < Date.now() ? 'Quá hạn · ' : ''}{new Date(t.due_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p></div><button disabled={busy || t.id.startsWith('fdv_itv_')} title={t.id.startsWith('fdv_itv_') ? 'Huỷ lịch tại trang Lịch PV để ngừng nhắc' : 'Xoá công việc'} aria-label={`Xoá ${t.title}`} onClick={() => setDeleting(t.id)} className="rounded-lg p-2 text-muted-foreground"><Trash2 size={16} /></button></div>)}{deleting && <div role="alertdialog" aria-label="Xác nhận xoá công việc" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm"><p>Xoá công việc này và ngừng nhắc hạn?</p><div className="mt-3 flex gap-3"><button onClick={() => setDeleting(null)} className="rounded-lg border border-line px-3 py-2">Huỷ</button><button disabled={busy} onClick={() => taskAction('DELETE', { id: deleting })} className="rounded-lg bg-red-600 px-3 py-2 text-white">Xoá công việc</button></div></div>}</section>
    </div>}
  </div>;
}
