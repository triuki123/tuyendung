'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, ClipboardCheck, Plus, X } from 'lucide-react';
import {
  listRequisitionCandidateScorecards, addRequisitionCandidateScorecard,
  type Scorecard, type ScorecardCriterion,
} from '@/lib/api/requisitionApi';
import { RECOMMENDATIONS, RECOMMENDATION_MAP, SCORECARD_CRITERIA, StarRating } from '@/app/nguon-nhan-luc/kho-ung-vien/components/candidateShared';
import { fmtDateTime } from '@/lib/api/onboardingApi';
import { useToast } from '@/context/ToastContext';

const labelCls = 'text-2xs font-600 text-muted-foreground uppercase tracking-wider';

/** Scorecard phỏng vấn có cấu trúc — nhiều vòng/người chấm, tổng hợp khuyến nghị + điểm. */
export default function ScorecardSection({ reqId, appId }: { reqId: string; appId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<Scorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await listRequisitionCandidateScorecards(reqId, appId)); }
    catch { /* silent */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reqId, appId]);

  // Tổng hợp: điểm trung bình + đếm khuyến nghị.
  const rated = items.filter((s) => s.overall != null);
  const avg = rated.length ? (rated.reduce((a, s) => a + (s.overall || 0), 0) / rated.length) : null;

  return (
    <div className="space-y-2 border-t border-line-subtle pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-700 text-foreground flex items-center gap-1.5"><ClipboardCheck className="h-4 w-4 text-sky-400" /> Scorecard phỏng vấn{items.length > 0 ? ` (${items.length})` : ''}</h3>
        <button onClick={() => setAdding((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-2xs font-600 transition-colors ${adding ? 'border-indigo-500/40 text-indigo-300 bg-indigo-500/10' : 'border-line text-muted-foreground hover:text-indigo-300 hover:border-indigo-500/40'}`}>
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />} Chấm điểm
        </button>
      </div>

      {avg != null && (
        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
          <span>Điểm TB: <b className="text-amber-300">{avg.toFixed(1)}/5</b> · {rated.length} lượt chấm</span>
        </div>
      )}

      {adding && <ScorecardForm reqId={reqId} appId={appId} onSaved={async () => { setAdding(false); await load(); toast.success('Đã lưu scorecard'); }} onError={(m) => toast.error(m)} />}

      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="text-2xs text-muted-foreground/70">Chưa có scorecard. Bấm <span className="text-indigo-300">Chấm điểm</span> để đánh giá phỏng vấn.</p>
      ) : items.map((s) => {
        const rec = s.recommendation ? RECOMMENDATION_MAP[s.recommendation] : null;
        return (
          <div key={s.id} className="rounded-lg border border-line-subtle bg-white/[0.02] px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xs font-600 text-indigo-300">{s.round_label}</span>
              {s.overall != null && <span className="inline-flex items-center gap-0.5 text-2xs text-amber-300 font-600">★ {s.overall}/5</span>}
              {rec && <span className={`rounded-full border px-1.5 py-0.5 text-2xs font-600 ${rec.color}`}>{rec.label}</span>}
              <span className="text-2xs text-muted-foreground ml-auto">{s.interviewer_name || '—'} · {fmtDateTime(s.created_at)}</span>
            </div>
            {s.criteria.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1">
                {s.criteria.map((c, i) => (
                  <span key={i} className="text-2xs text-muted-foreground bg-hover rounded px-1.5 py-0.5">{c.name}: <b className="text-foreground">{c.rating ?? '–'}</b></span>
                ))}
              </div>
            )}
            {s.summary && <p className="text-xs text-foreground whitespace-pre-wrap">{s.summary}</p>}
          </div>
        );
      })}
    </div>
  );
}

function ScorecardForm({ reqId, appId, onSaved, onError }: {
  reqId: string; appId: string; onSaved: () => void | Promise<void>; onError: (m: string) => void;
}) {
  const [round, setRound] = useState('Vòng 1');
  const [overall, setOverall] = useState<number | null>(null);
  const [recommendation, setRecommendation] = useState('');
  const [summary, setSummary] = useState('');
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    const criteria: ScorecardCriterion[] = SCORECARD_CRITERIA
      .map((name) => ({ name, rating: ratings[name] ?? null }))
      .filter((c) => c.rating != null);
    if (criteria.length === 0 && overall == null && !recommendation && !summary.trim()) {
      onError('Nhập điểm/khuyến nghị hoặc tiêu chí'); return;
    }
    setSaving(true);
    try {
      await addRequisitionCandidateScorecard(reqId, appId, {
        round_label: round, overall, recommendation: recommendation || null, criteria, summary: summary.trim() || undefined,
      });
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Không lưu được scorecard');
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Vòng</label>
          <input value={round} onChange={(e) => setRound(e.target.value)} placeholder="Vòng 1"
            className="mt-1 w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none" />
        </div>
        <div>
          <label className={labelCls}>Điểm tổng</label>
          <div className="mt-1 h-8 flex items-center"><StarRating value={overall} onChange={setOverall} /></div>
        </div>
      </div>

      <div>
        <label className={labelCls}>Tiêu chí</label>
        <div className="mt-1 space-y-1.5">
          {SCORECARD_CRITERIA.map((name) => (
            <div key={name} className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{name}</span>
              <StarRating value={ratings[name] ?? null} onChange={(v) => setRatings((p) => ({ ...p, [name]: v }))} size={13} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Khuyến nghị</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {RECOMMENDATIONS.map((r) => (
            <button key={r.code} onClick={() => setRecommendation(recommendation === r.code ? '' : r.code)}
              className={`rounded-full border px-2 py-0.5 text-2xs font-600 transition-colors ${recommendation === r.code ? r.color : 'border-line text-muted-foreground hover:bg-hover'}`}>{r.label}</button>
          ))}
        </div>
      </div>

      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Nhận xét tổng quan..."
        className="w-full px-2.5 py-1.5 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none resize-none" />

      <div className="flex justify-end">
        <button onClick={submit} disabled={saving}
          className="btn-indigo rounded-lg px-3 py-1.5 text-xs font-600 flex items-center gap-1 disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />} Lưu scorecard
        </button>
      </div>
    </div>
  );
}
