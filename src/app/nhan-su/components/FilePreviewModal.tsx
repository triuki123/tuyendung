'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle, Download } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface Props {
  apiUrl: string;       // URL API có auth (e.g. /api/hr-documents/xxx)
  mimeType: string | null;
  fileName: string;
  onClose: () => void;
  onDownload?: () => void;
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'pdf'; blobUrl: string }
  | { status: 'image'; blobUrl: string }
  | { status: 'word'; html: string }
  | { status: 'excel'; sheets: { name: string; rows: string[][] }[] }
  | { status: 'text'; content: string }
  | { status: 'unsupported' };

function getAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof window === 'undefined') return h;
  try {
    const stored = localStorage.getItem('assetflow_auth');
    if (stored) {
      const u = JSON.parse(stored);
      if (u.id) h['x-current-user-id'] = u.id;
      if (u.role) h['x-current-user-role'] = u.role;
    }
  } catch { /* noop */ }
  return h;
}

type PreviewKind = 'pdf' | 'image' | 'word' | 'excel' | 'text' | 'unsupported';

function detectKind(mime: string | null, name: string, bytes?: Uint8Array): PreviewKind {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const normalizedMime = (mime || '').toLowerCase().split(';')[0];
  const isPdfBytes = bytes?.[0] === 0x25 && bytes?.[1] === 0x50 && bytes?.[2] === 0x44 && bytes?.[3] === 0x46;
  const isZipBytes = bytes?.[0] === 0x50 && bytes?.[1] === 0x4b;

  // Some recruitment sites return PDF bytes as text/plain or octet-stream.
  // File extension and magic bytes are therefore more reliable than MIME alone.
  if (isPdfBytes) return 'pdf';
  if (isZipBytes && normalizedMime.includes('spreadsheet')) return 'excel';
  if (isZipBytes && normalizedMime.includes('wordprocessing')) return 'word';
  if (ext === 'pdf' || normalizedMime === 'application/pdf') return 'pdf';
  if (['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext) || normalizedMime.startsWith('image/')) return 'image';
  if (['doc','docx','odt'].includes(ext) || normalizedMime.includes('wordprocessingml') || normalizedMime.includes('msword') || normalizedMime.includes('opendocument.text')) return 'word';
  if (['xls','xlsx','csv','ods'].includes(ext) || normalizedMime.includes('spreadsheetml') || normalizedMime.includes('excel') || normalizedMime === 'text/csv' || normalizedMime.includes('opendocument.spreadsheet')) return 'excel';
  if (['txt','rtf','log','json','xml'].includes(ext) || normalizedMime.startsWith('text/') || normalizedMime === 'application/json' || normalizedMime === 'application/xml') return 'text';
  return 'unsupported';
}

function detectZippedOfficeKind(arrayBuffer: ArrayBuffer): 'word' | 'excel' | null {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  // ZIP central-directory file names are stored as plain bytes even when the
  // document payload is compressed, so these markers distinguish DOCX/XLSX.
  const searchable = new TextDecoder('latin1').decode(bytes);
  if (searchable.includes('word/document.xml')) return 'word';
  if (searchable.includes('xl/workbook.xml')) return 'excel';
  return null;
}

function imageMimeFromName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  };
  return ext ? types[ext] || null : null;
}

/** Shared authenticated viewer; embedding it does not open another modal. */
export function FilePreviewContent({ apiUrl, mimeType, fileName, onDownload }: Omit<Props, 'onClose'>) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' });
  const [activeSheet, setActiveSheet] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let blobUrl = '';
    const controller = new AbortController();
    const publish = (next: PreviewState) => { if (!controller.signal.aborted) setState(next); };

    async function load() {
      setState({ status: 'loading' });
      setActiveSheet(0);
      try {
        const res = await fetch(apiUrl, { headers: getAuthHeaders(), credentials: 'same-origin', signal: controller.signal });
        if (!res.ok) throw new Error('Không thể tải tệp');

        const arrayBuffer = await res.arrayBuffer();
        if (controller.signal.aborted) return;
        // The response sniffs stored bytes, so it is more reliable than old
        // metadata created by recruitment-site imports.
        const headerMime = res.headers.get('content-type') || mimeType;
        const zippedOfficeKind = detectZippedOfficeKind(arrayBuffer);
        const kind = zippedOfficeKind || detectKind(headerMime, fileName, new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 8)));

        if (kind === 'pdf' || kind === 'image') {
          const previewMime = kind === 'pdf'
            ? 'application/pdf'
            : (imageMimeFromName(fileName) || mimeType || res.headers.get('content-type') || 'application/octet-stream');
          const blob = new Blob([arrayBuffer], { type: previewMime });
          blobUrl = URL.createObjectURL(blob);
          publish({ status: kind, blobUrl });
        } else if (kind === 'word') {
          const mammoth = await import('mammoth');
          if (controller.signal.aborted) return;
          const result = await mammoth.convertToHtml({ arrayBuffer });
          publish({ status: 'word', html: result.value });
        } else if (kind === 'excel') {
          const XLSX = await import('xlsx');
          if (controller.signal.aborted) return;
          const wb = XLSX.read(arrayBuffer, { type: 'array' });
          const sheets = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
            return { name, rows };
          });
          publish({ status: 'excel', sheets });
        } else if (kind === 'text') {
          publish({ status: 'text', content: new TextDecoder('utf-8').decode(arrayBuffer) });
        } else {
          publish({ status: 'unsupported' });
        }
      } catch (err: any) {
        publish({ status: 'error', message: err.message || 'Lỗi không xác định' });
      }
    }

    // React's development probe mounts and immediately cleans up effects.
    // Defer one tick so that probe does not download the same large file twice.
    const start = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(start); controller.abort(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [apiUrl, mimeType, fileName, attempt]);

  return (
      <div className="file-preview-content h-full min-h-0 overflow-hidden" data-preview-status={state.status}>
        {state.status === 'loading' && (
          <div className="flex flex-col gap-3 items-center justify-center h-full" role="status">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
            <p className="text-sm text-muted-foreground">Đang tải nội dung…</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400 px-4 text-center" role="alert">
            <AlertCircle className="h-10 w-10" />
            <p className="text-sm">{state.message}</p>
            <button type="button" className="btn-indigo rounded-xl px-4 py-2 text-sm" onClick={() => setAttempt(value => value + 1)}>Thử tải lại</button>
            {onDownload && <button type="button" className="text-sm text-muted-foreground" onClick={onDownload}>Tải tệp về máy</button>}
          </div>
        )}

        {state.status === 'unsupported' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <p className="text-sm">Định dạng này không hỗ trợ xem trước</p>
            {onDownload && (
              <button onClick={onDownload}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white flex items-center gap-2">
                <Download className="h-4 w-4" /> Tải về để mở
              </button>
            )}
          </div>
        )}

        {state.status === 'pdf' && (
          <iframe
            src={`${state.blobUrl}#view=FitH&navpanes=0`}
            className="w-full h-full border-0"
            title={fileName}
          />
        )}

        {state.status === 'image' && (
          <div className="flex items-center justify-center h-full p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.blobUrl} alt={fileName}
              className="max-w-full max-h-full object-contain rounded-xl" />
          </div>
        )}

        {state.status === 'word' && (
          <iframe className="w-full h-full border-0" title={fileName} sandbox=""
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>body{margin:0;padding:24px;background:#f5f5f7;color:#1d1d1f;font:15px/1.6 -apple-system,BlinkMacSystemFont,Arial,sans-serif;overflow-wrap:anywhere}main{max-width:760px;margin:auto;background:white;padding:32px;box-shadow:0 2px 12px #0000000a}img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}h1,h2,h3{line-height:1.3}a{color:#007aff}@media(max-width:500px){body{padding:12px}main{padding:20px}}</style></head><body><main>${state.html}</main></body></html>`} />
        )}

        {state.status === 'excel' && (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Sheet tabs */}
            {state.sheets.length > 1 && (
              <div className="flex gap-1 px-4 pt-3 border-b border-line overflow-x-auto shrink-0">
                {state.sheets.map((s, i) => (
                  <button key={i} onClick={() => setActiveSheet(i)}
                    className={`px-3 py-1.5 text-xs rounded-t-lg border border-line border-b-0 whitespace-nowrap ${i === activeSheet ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-auto p-4">
              {state.sheets[activeSheet]?.rows.length ? (
                <table className="text-xs border-collapse min-w-max">
                  <tbody>
                    {state.sheets[activeSheet].rows.map((row, ri) => (
                      <tr key={ri} className={ri === 0 ? 'bg-indigo-900/40' : ri % 2 === 0 ? 'bg-white/3' : ''}>
                        {row.map((cell, ci) => (
                          ri === 0
                            ? <th key={ci} className="border border-white/15 px-3 py-1.5 text-left font-600 text-foreground whitespace-nowrap">{String(cell)}</th>
                            : <td key={ci} className="border border-line px-3 py-1.5 text-muted-foreground whitespace-nowrap">{String(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">Sheet trống</p>
              )}
            </div>
          </div>
        )}

        {state.status === 'text' && (
          <div className="h-full overflow-auto p-6 sm:p-10">
            <pre className="max-w-5xl min-h-full mx-auto whitespace-pre-wrap break-words rounded-lg bg-white p-6 text-sm leading-relaxed text-slate-900">
              {state.content}
            </pre>
          </div>
        )}
      </div>
  );
}

export default function FilePreviewModal({ apiUrl, mimeType, fileName, onClose, onDownload }: Props) {
  useEscapeKey(onClose);
  return <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)' }}>
    <div className="flex items-center gap-3 px-4 py-3 border-b border-line shrink-0" style={{ background: 'var(--card)' }}>
      <p className="flex-1 text-sm font-600 text-foreground truncate">{fileName}</p>
      {onDownload && <button onClick={onDownload} aria-label="Tải tệp về máy" className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><Download className="h-4 w-4" /></button>}
      <button onClick={onClose} aria-label="Đóng xem trước" className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
    </div>
    <div className="flex-1 min-h-0 overflow-hidden"><FilePreviewContent key={`${apiUrl}:${mimeType}:${fileName}`} apiUrl={apiUrl} mimeType={mimeType} fileName={fileName} onDownload={onDownload} /></div>
  </div>;
}
