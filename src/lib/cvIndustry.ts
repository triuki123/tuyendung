/** Classify the applied role, never unrelated skills, schools or past employers. */
const RULES: Array<{ industry: string; keywords: string[] }> = [
  { industry: 'Công nghệ thông tin', keywords: ['full stack', 'frontend', 'backend', 'developer', 'software', 'lap trinh', 'ky su phan mem', 'data engineer', 'data analyst', 'data scientist', 'business analyst', 'qa engineer', 'tester', 'devops', 'cyber security', 'an ninh mang', 'it support', 'helpdesk', 'cntt', 'ict', 'it', 'dev', 'fe', 'be', 'fs', 'sre', 'dba'] },
  { industry: 'Kế toán - Kiểm toán', keywords: ['ke toan truong', 'ke toan tong hop', 'ke toan', 'accountant', 'accounting', 'kiem toan', 'auditor', 'audit', 'cong no', 'gia thanh', 'tax accountant', 'ktth', 'ktqt', 'ktnb', 'acc', 'ap', 'ar'] },
  { industry: 'Tài chính - Ngân hàng', keywords: ['phan tich tai chinh', 'tai chinh', 'finance', 'ngan hang', 'banking', 'tin dung', 'credit', 'treasury', 'dau tu', 'investment', 'tcnh', 'fin'] },
  { industry: 'Kinh doanh - Bán hàng', keywords: ['sales engineer', 'business development', 'account manager', 'key account', 'sales admin', 'nhan vien kinh doanh', 'kinh doanh', 'ban hang', 'sales', 'tu van vien', 'nvkd', 'kd', 'bd', 'bdm', 'am', 'kam'] },
  { industry: 'Marketing - Truyền thông', keywords: ['marketing account manager', 'digital marketing', 'trade marketing', 'performance marketing', 'content creator', 'content marketing', 'social media', 'truyen thong', 'marketing', 'seo', 'brand', 'pr', 'copywriter', 'tiktok content', 'mkt', 'marcom', 'comms'] },
  { industry: 'Thương mại điện tử', keywords: ['e commerce', 'e commerces', 'e com', 'ecommerce', 'ecom', 'thuong mai dien tu', 'online marketplace', 'marketplace'] },
  { industry: 'Thiết kế sáng tạo', keywords: ['ui ux', 'ux ui', 'graphic designer', 'thiet ke do hoa', 'motion designer', 'video editor', '3d designer', 'designer', 'uiux', 'uxui', 'tkdh'] },
  { industry: 'Nhân sự - Hành chính', keywords: ['talent acquisition', 'hrbp', 'hr', 'human resource', 'human resources', 'recruitment', 'recruiter', 'tuyen dung', 'compensation benefits', 'c b', 'payroll', 'nhan su', 'hanh chinh', 'administrative assistant', 'executive assistant', 'hcns', 'ta', 'rpo'] },
  { industry: 'Vận hành - Kho vận', keywords: ['supply chain', 'xuat nhap khau', 'procurement', 'logistics', 'dieu phoi', 'kho van', 'warehouse', 'van hanh', 'purchasing', 'operations', 'ops', 'scm', 'xnk', 'wh'] },
  { industry: 'Kỹ thuật - Sản xuất', keywords: ['ky su dien', 'ky su co khi', 'quality control', 'quality assurance', 'bao tri', 'maintenance', 'mechanical', 'production', 'san xuat', 'ky thuat', 'qc', 'r d', 'me', 'ie', 'ee'] },
  { industry: 'Chăm sóc khách hàng', keywords: ['customer success', 'customer service', 'customer support', 'cham soc khach hang', 'call center', 'tong dai', 'cskh', 'customer care', 'csr', 'cs'] },
  { industry: 'Pháp lý - Tuân thủ', keywords: ['phap che', 'legal', 'luat su', 'lawyer', 'tuan thu', 'compliance', 'pl', 'pc'] },
  { industry: 'Giáo dục - Đào tạo', keywords: ['giao vien', 'giang vien', 'dao tao', 'trainer', 'training', 'academic', 'teacher', 'l d'] },
  { industry: 'Y tế - Dược phẩm', keywords: ['duoc si', 'bac si', 'dieu duong', 'y te', 'pharmaceutical', 'medical', 'nurse', 'pharmacist', 'yt'] },
];
export function normalizeCvRole(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function inferIndustryFromPosition(position?: string | null): string | null {
  const normalized = ` ${normalizeCvRole(position || '')} `;
  const scores = RULES.map(rule => ({ industry: rule.industry, score: Math.max(0, ...rule.keywords
    .filter(word => normalized.includes(` ${word} `)).map(word => word.split(' ').length)) })).sort((a, b) => b.score - a.score);
  return scores[0].score > 0 && scores[0].score !== scores[1].score ? scores[0].industry : null;
}

/** Classify a candidate when their language requirement identifies a dedicated project. */
export function inferIndustryFromCandidate(position?: string | null, languages?: string[] | string | null): string | null {
  const languageText = Array.isArray(languages) ? languages.join(' ') : languages || '';
  const normalized = normalizeCvRole(`${position || ''} ${languageText}`);
  if (/\b(?:tieng trung|tieng hoa|chinese|hsk)\b/.test(normalized)) return 'Dự Án Trung Quốc';
  return inferIndustryFromPosition(position);
}
