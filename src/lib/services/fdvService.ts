import { query } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';

export async function callFdv(input: string, instructions: string, schema?: object, web = false) {
  if (!process.env.OPENAI_API_KEY) throw new Error('Chưa cấu hình OPENAI_API_KEY trên máy chủ.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_FDV_MODEL || 'gpt-4.1-mini', store: false,
      instructions, input, max_output_tokens: 6000,
      ...(schema ? { text: { format: { type: 'json_schema', name: 'fdv_analysis', strict: true, schema } } } : {}),
      ...(web ? { tools: [{ type: 'web_search' }], tool_choice: 'required' } : {}),
    }),
  });
  if (!response.ok) {
    // Do not log requests, keys or provider responses containing personal data.
    const provider = await response.json().catch(() => ({}));
    const quota = ['insufficient_quota', 'credit_balance_exhausted'].includes(provider.error?.code) || provider.error?.type === 'insufficient_quota';
    throw new Error(response.status === 429 ? quota ? 'OpenAI đã hết credit/quota. Vui lòng bổ sung credit API để dịch hoặc phân tích CV.' : 'OpenAI đang giới hạn lượt gọi. Vui lòng thử lại sau.' : `OpenAI không xử lý được yêu cầu (HTTP ${response.status}). Kiểm tra model và cấu hình API.`);
  }
  const result = await response.json();
  if (result.status !== 'completed') throw new Error('AI chưa hoàn tất câu trả lời. Hãy thu hẹp yêu cầu và thử lại.');
  const chunks = (result.output || []).filter((o: any) => o.type === 'message').flatMap((o: any) => o.content || []);
  const text = chunks.filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('\n');
  if (!text) throw new Error('AI không trả về nội dung phù hợp.');
  const sources = chunks.flatMap((c: any) => c.annotations || []).filter((a: any) => a.type === 'url_citation' && /^https?:\/\//.test(a.url)).map((a: any) => ({ title: a.title || a.url, url: a.url }));
  if (web && !sources.length) throw new Error('Tra cứu chưa có nguồn kiểm chứng. Vui lòng thử lại hoặc thu hẹp câu hỏi.');
  return { text, sources };
}

let reminderTimer: ReturnType<typeof setInterval> | undefined;
let running = false;
export async function drainFdvReminders() {
  if (running) return;
  running = true;
  try {
    // Keep interview reminders in sync with edits/cancellations without changing
    // interview workflow. Assigned interviewers, creator and recruiter only.
    await query(`INSERT INTO fdv_tasks (id, user_id, title, due_at, remind_at, interview_id)
      SELECT 'fdv_itv_' || s.id || '_' || recipients.uid, recipients.uid,
        'Phỏng vấn · ' || COALESCE(r.title, 'Tuyển dụng') || ' · ' || s.round_label,
        s.scheduled_at, s.scheduled_at - INTERVAL '30 minutes', s.id
      FROM hr_interview_schedules s LEFT JOIN requisitions r ON r.id = s.requisition_id
      CROSS JOIN LATERAL (SELECT DISTINCT uid FROM unnest(
        COALESCE(s.interviewer_ids, '{}'::text[]) || ARRAY[s.created_by::text, r.owner_id::text]
      ) uid WHERE uid IS NOT NULL AND uid <> '') recipients
      WHERE s.status = 'scheduled' AND s.scheduled_at > NOW()
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title,
        due_at = EXCLUDED.due_at, remind_at = EXCLUDED.remind_at,
        reminded_at = CASE WHEN fdv_tasks.due_at IS DISTINCT FROM EXCLUDED.due_at THEN NULL ELSE fdv_tasks.reminded_at END,
        done = CASE WHEN fdv_tasks.due_at IS DISTINCT FROM EXCLUDED.due_at THEN FALSE ELSE fdv_tasks.done END`);
    await query(`UPDATE fdv_tasks t SET done = TRUE WHERE t.interview_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hr_interview_schedules s WHERE s.id = t.interview_id AND s.status = 'scheduled'
        AND t.user_id = ANY(COALESCE(s.interviewer_ids, '{}'::text[]) || ARRAY[s.created_by::text,
          (SELECT r.owner_id::text FROM requisitions r WHERE r.id = s.requisition_id)]))`);
    // Atomic claim prevents concurrent workers selecting the same pending task.
    const tasks = await query<{ id: string; user_id: string; title: string; due_at: string }>(
      `UPDATE fdv_tasks SET reminded_at = NOW() WHERE id IN (
        SELECT id FROM fdv_tasks WHERE done = FALSE AND reminded_at IS NULL AND remind_at <= NOW()
        ORDER BY remind_at LIMIT 30 FOR UPDATE SKIP LOCKED
      ) RETURNING id, user_id, title, due_at`);
    for (const task of tasks) {
      try {
        const body = `Công việc: ${task.title.replace(/[_*\[\]]/g, '')}\nHạn: ${new Date(task.due_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
        const result = await notify('fdv.reminder', { body }, { recipients: [task.user_id], relatedId: task.id });
        if (!result.sent) throw new Error('Notification not persisted');
      } catch {
        await query('UPDATE fdv_tasks SET reminded_at = NULL WHERE id = $1 AND done = FALSE', [task.id]);
      }
    }
  } catch (error) {
    console.error('[FDV reminders]', error instanceof Error ? error.message : 'unknown');
  } finally { running = false; }
}
export function startFdvReminders() {
  if (reminderTimer) return;
  reminderTimer = setInterval(() => { void drainFdvReminders(); }, 60000);
  reminderTimer.unref();
  void drainFdvReminders();
}
