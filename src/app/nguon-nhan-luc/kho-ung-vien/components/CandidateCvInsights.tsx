'use client';

import { useEffect, useRef, useState } from 'react';
import { Languages, Loader2, Sparkles } from 'lucide-react';
import { authHeaders } from '@/lib/api/onboardingApi';

type Insights = { translation: string; summary: string; suggestions: { role: string; evidence: string; jd_id: string | null; gaps: string }[]; verification: string[]; truncated: boolean; compared: number; totalJds: number };

export default function CandidateCvInsights({ cvId }: { cvId: string }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Insights | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function analyze() {
    if (!consent || busy) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/hr/fdv', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ mode: 'translate', cvId, consent: true }), signal: abort.signal });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Không đọc được CV bằng AI');
      if (!abort.signal.aborted) setResult(json.data);
    } catch (failure) { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'Không xử lý được CV'); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <section aria-label="Đọc CV tiếng Việt và gợi ý vị trí" className="max-h-[45%] shrink-0 overflow-y-auto border-b border-line bg-blue-50/40 p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-700"><Languages className="h-4 w-4 text-blue-600" />Đọc CV bằng tiếng Việt</h3><p className="mt-1 text-xs text-muted-foreground">Bản dịch riêng và gợi ý vị trí từ kinh nghiệm thực tế. Giữ nguyên CV gốc bên dưới.</p></div><button disabled={!consent || busy} onClick={analyze} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-600 text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{busy ? 'Đang dịch và phân tích…' : 'Dịch CV & gợi ý vị trí'}</button></div>
    <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" disabled={busy} checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 accent-blue-600" />Tôi đồng ý gửi nội dung CV sang OpenAI để dịch và phân tích (cần API credit).</label>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {result && <div className="space-y-3"><p className="text-xs text-amber-800">AI hỗ trợ tham khảo, cần đối chiếu bản gốc; không tự thay đổi thông tin hoặc trạng thái ứng viên.{result.truncated ? ' CV dài: chỉ phân tích và dịch phần nội dung đầu được cung cấp, không phải toàn bộ tệp.' : ''}</p><details open className="rounded-xl border border-line bg-white p-3"><summary className="cursor-pointer text-sm font-700">Bản dịch tiếng Việt</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{result.translation}</p></details><details open className="rounded-xl border border-line bg-white p-3"><summary className="cursor-pointer text-sm font-700">Kinh nghiệm thực tế & vị trí phù hợp</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{result.summary}</p><p className="mt-2 text-xs text-muted-foreground">Đối chiếu {result.compared}/{result.totalJds} JD đang dùng. Vị trí ngoài danh sách chỉ là định hướng nghề nghiệp.</p><div className="mt-3 space-y-3">{result.suggestions.map((suggestion, index) => <article key={index} className="rounded-xl bg-slate-50 p-3"><h4 className="text-sm font-700">{suggestion.role}</h4><span className="text-xs text-blue-600">{suggestion.jd_id ? 'Có JD trên hệ thống' : 'Gợi ý nghề nghiệp — chưa đối chiếu JD'}</span><p className="mt-2 text-sm"><span className="font-600">Căn cứ CV: </span>{suggestion.evidence}</p><p className="mt-2 text-xs text-muted-foreground">Cần xác minh / khoảng thiếu: {suggestion.gaps}</p></article>)}</div>{result.verification.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{result.verification.map((item, index) => <li key={index}>{item}</li>)}</ul>}</details></div>}
  </section>;
}
