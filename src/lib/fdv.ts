export const FDV_WEIGHTS = { skills: 40, experience: 30, responsibilities: 20, domain: 10 } as const;
export function fdvScore(criteria: Record<string, unknown>): number {
  return Math.round(Object.entries(FDV_WEIGHTS).reduce((total, [key, weight]) => {
    const value = criteria[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('Điểm AI không hợp lệ');
    return total + value * weight / 100;
  }, 0));
}
export function redactCv(text: string): string {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email đã ẩn]')
    .replace(/(?:\+84|0)(?:[\s().-]*\d){9,10}/g, '[điện thoại đã ẩn]');
}
const str = { type: 'string' };
const strings = { type: 'array', items: str };
export const FDV_ANALYSIS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: str, strengths: strings, gaps: strings, interview_questions: strings,
    matches: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: { jd_id: str, skills: { type: 'integer' }, experience: { type: 'integer' }, responsibilities: { type: 'integer' }, domain: { type: 'integer' }, evidence: strings, missing: strings },
      required: ['jd_id', 'skills', 'experience', 'responsibilities', 'domain', 'evidence', 'missing'],
    } },
  }, required: ['summary', 'strengths', 'gaps', 'interview_questions', 'matches'],
};
