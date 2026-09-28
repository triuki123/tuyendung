import * as XLSX from 'xlsx-js-style';
import type { RecruitmentDashboardData, DashBucket } from '@/lib/api/onboardingApi';

/**
 * Xuất báo cáo "Tình Hình Tuyển Dụng Nhân Sự" ra Excel (client-side, xlsx-js-style).
 * 4 sheet: Tổng quan · Cơ cấu lao động · Pipeline & Nguồn · Xu hướng theo tháng.
 * Khớp pattern laborReportWorkbook.ts (Biến Động Nhân Sự).
 */

const H = { font: { bold: true, sz: 12 }, fill: { fgColor: { rgb: 'E2E8F0' } } } as const;
const B = { font: { bold: true } } as const;

type Row = (string | number | { v: string | number; s?: object })[];

function sheetFromRows(rows: Row[], cols?: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows as any[][]);
  if (cols) ws['!cols'] = cols.map((wch) => ({ wch }));
  return ws;
}

function bucketRows(title: string, data: DashBucket[]): Row[] {
  if (!data?.length) return [];
  return [
    [{ v: title, s: B }],
    ...data.map((b): Row => [b.label, b.value]),
    [''],
  ];
}

export function exportRecruitmentWorkbook(d: RecruitmentDashboardData, companyName: string | null): void {
  const wb = XLSX.utils.book_new();
  const period = `${d.range.from} → ${d.range.to}`;
  const scope = companyName || 'Toàn hệ thống';

  // ── Sheet 1: Tổng quan ──
  const offer = d.applications?.offer12m;
  const overview: Row[] = [
    [{ v: 'BÁO CÁO TÌNH HÌNH TUYỂN DỤNG NHÂN SỰ', s: H }],
    ['Phạm vi', scope],
    ['Kỳ báo cáo', period],
    ['Xuất lúc', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })],
    [''],
    [{ v: 'CHỈ SỐ CHÍNH', s: B }],
    ['Tổng nhân sự (active)', d.workforce.headcount],
    ['Tuyển mới 30 ngày', d.workforce.newHires30d],
    ['Tuyển mới 90 ngày', d.workforce.newHires90d],
    ['Nghỉ việc trong kỳ', d.turnover.leavers12m],
    ['Tỷ lệ nghỉ việc trong kỳ (%)', d.turnover.turnoverRate],
    ['Nghỉ sớm < 90 ngày (trong kỳ)', d.quality.earlyAttrition90d],
    ['Tỷ lệ đậu thử việc (%)', d.quality.probationPassRate],
    [''],
    [{ v: 'YÊU CẦU TUYỂN DỤNG', s: B }],
    ['Đang tuyển', d.requisitions.open],
    ['Tạm dừng', d.requisitions.onHold],
    ['Đã lấp / mục tiêu (đơn đang mở)', `${d.requisitions.totalFilled}/${d.requisitions.totalTarget}`],
    ['Time-to-fill trung bình (ngày)', d.requisitions.avgTimeToFill],
    [''],
    [{ v: 'OFFER TRONG KỲ', s: B }],
    ['Đã gửi', offer?.offered ?? 0],
    ['Nhận (hired)', offer?.accepted ?? 0],
    ['Từ chối', offer?.declined ?? 0],
    ['Đang chờ', offer?.pending ?? 0],
    ['Tỷ lệ nhận offer (%)', offer?.acceptRate ?? 0],
    [''],
    [{ v: 'PHỎNG VẤN', s: B }],
    ['Lịch 7 ngày tới', d.interviews?.upcoming7d ?? 0],
    ['Đã phỏng vấn 30 ngày', d.interviews?.done30d ?? 0],
    ['Hủy 30 ngày', d.interviews?.cancelled30d ?? 0],
    ['Điểm scorecard TB (/5)', d.interviews?.avgOverall ?? 0],
    [''],
    [{ v: 'DỰ BÁO & KẾ HOẠCH', s: B }],
    ['Dự báo tuyển tháng tới (P50)', d.forecast.p50],
    ['Khoảng dự báo (P10–P90)', `${d.forecast.p10}–${d.forecast.p90}`],
    ...(d.hiringPlan || []).map((h): Row => [
      `Nhu cầu ${h.horizonMonths} tháng tới`,
      h.total,
      `(thiếu ${h.openRemaining} + nghỉ ${h.expectedAttrition} − gần chốt ${h.pipelineOffset}; HĐ đáo hạn ${h.contractRisk})`,
    ]),
    [''],
    [{ v: 'NHU CẦU THAY THẾ', s: B }],
    ['HĐ đáo hạn ≤ 90 ngày', d.replacement?.contractsExpiring90d ?? 0],
    ...(d.replacement?.contractsExpiringByWindow || []).map((w): Row => [`  ${w.label}`, w.value]),
    ['Đang làm thủ tục nghỉ việc', d.replacement?.offboardingInProgress ?? 0],
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromRows(overview, [36, 16, 52]), 'Tổng quan');

  // ── Sheet 2: Cơ cấu lao động ──
  const wf = d.workforce;
  const structure: Row[] = [
    [{ v: `CƠ CẤU LAO ĐỘNG — ${scope}`, s: H }],
    [''],
    ...bucketRows('Theo công ty', wf.byCompany),
    ...bucketRows('Theo phòng ban', wf.byDepartment),
    ...bucketRows('Theo bộ phận', wf.bySubDepartment),
    ...bucketRows('Theo loại hợp đồng', wf.byEmploymentType),
    ...bucketRows('Theo giới tính', wf.byGender),
    ...bucketRows('Theo độ tuổi', wf.byAge),
    ...bucketRows('Theo thâm niên', wf.byTenure),
  ];
  if (wf.unitsMissingHead?.length) {
    structure.push([{ v: 'Phòng ban khuyết Trưởng phòng', s: B }]);
    for (const u of wf.unitsMissingHead) structure.push([u.department, u.company]);
  }
  XLSX.utils.book_append_sheet(wb, sheetFromRows(structure, [34, 20]), 'Cơ cấu lao động');

  // ── Sheet 3: Pipeline & Nguồn ──
  const STAGE: Record<string, string> = {
    new: 'Mới', screening: 'Sàng lọc', interviewed: 'Phỏng vấn',
    offered: 'Đã offer', hired: 'Đã Onboard', rejected: 'Loại', pool: 'Lưu kho',
  };
  const vi = (b: DashBucket): DashBucket => ({ label: STAGE[b.label] || b.label, value: b.value });
  const pipeline: Row[] = [
    [{ v: 'PIPELINE & NGUỒN ỨNG VIÊN', s: H }],
    [''],
    ...bucketRows('Pipeline theo vị trí (lượt ứng tuyển)', (d.applications?.byStage || []).map(vi)),
    ...bucketRows('Thời gian TB ở mỗi giai đoạn (ngày)', (d.applications?.stageDurations || []).map(vi)),
    ...bucketRows('Kho CV theo giai đoạn (toàn hệ thống)', d.cvByStage.map(vi)),
    ...bucketRows('Nguồn ứng viên', d.cvBySource),
  ];
  if (d.requisitions.aging?.length) {
    pipeline.push([{ v: 'Vị trí tồn đọng (mở lâu nhất)', s: B }], ['Vị trí', 'Số ngày mở', 'Đã lấp/Mục tiêu', 'Phụ trách']);
    for (const a of d.requisitions.aging) {
      pipeline.push([a.title, a.days_open, `${a.filled_count}/${a.target_headcount}`, a.owner_name || 'Chưa giao']);
    }
  }
  XLSX.utils.book_append_sheet(wb, sheetFromRows(pipeline, [40, 14, 16, 22]), 'Pipeline & Nguồn');

  // ── Sheet 4: Xu hướng theo tháng ──
  const monthsSet = new Set<string>([
    ...d.hiresByMonth.map((x) => x.month),
    ...d.turnover.leaversByMonth.map((x) => x.month),
    ...(d.cohorts || []).map((x) => x.month),
  ]);
  const months = [...monthsSet].sort();
  const hires = new Map(d.hiresByMonth.map((x) => [x.month, x.value]));
  const leaves = new Map(d.turnover.leaversByMonth.map((x) => [x.month, x.value]));
  const cohorts = new Map((d.cohorts || []).map((x) => [x.month, x]));
  const trend: Row[] = [
    [{ v: `XU HƯỚNG THEO THÁNG — kỳ ${period}`, s: H }],
    [''],
    [{ v: 'Tháng', s: B }, { v: 'Vào làm', s: B }, { v: 'Nghỉ việc', s: B }, { v: 'Ròng', s: B }, { v: 'Còn làm đến nay', s: B }, { v: '% giữ chân lứa', s: B }],
    ...months.map((m): Row => {
      const hi = hires.get(m) || 0;
      const le = leaves.get(m) || 0;
      const co = cohorts.get(m);
      return [
        m, hi, le, hi - le,
        co ? co.still : '',
        co && co.hired > 0 ? Math.round((co.still / co.hired) * 100) : '',
      ];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromRows(trend, [12, 10, 10, 8, 16, 14]), 'Xu hướng');

  XLSX.writeFile(wb, `tinh-hinh-tuyen-dung_${d.range.from}_${d.range.to}.xlsx`);
}
