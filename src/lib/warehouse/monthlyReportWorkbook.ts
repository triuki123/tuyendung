import * as XLSX from 'xlsx-js-style';

/**
 * Workbook báo cáo của 1 kho theo KHOẢNG NGÀY bất kỳ (server-side, trả Buffer) — 3 sheet:
 * 1. Tổng Hợp: mỗi công nhân 1 hàng (công, giờ, nghỉ có báo, quên out, SL từng SP, ứng lương)
 * 2. Bảng Công Chi Tiết: ma trận công nhân × ngày, ô = giờ làm; P = nghỉ có báo; ? = quên check-out
 * 3. Sản Lượng Chi Tiết: mỗi sản phẩm 1 khối ma trận công nhân × ngày
 * Báo cáo tháng = khoảng [ngày 1, ngày cuối tháng]. Kỳ công tùy chỉnh = from..to bất kỳ.
 */

export interface ReportData {
  warehouseName: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  rangeLabel: string; // vd "Tháng 07/2026" hoặc "26/06 → 25/07/2026"
  workers: { id: string; full_name: string; cccd: string; status: string }[];
  attendance: { worker_id: string; work_date: string; check_out_at: string | null; check_in_at: string | null; hours: number | null }[];
  leaveDays: { worker_id: string; day: string }[];
  outputDetail: { worker_id: string; product_name: string; unit: string; day: string; quantity: number }[];
  advances: { worker_id: string; total: number }[];
  /** Chi tiết TỪNG ĐỢT vào-ra (sheet 4) — kho chế độ nhiều đợt/ngày */
  sessions?: {
    full_name: string; day: string; session_no: number | null;
    check_in_at: string | null; check_out_at: string | null; hours: number | null;
    check_in_method: string | null; check_out_method: string | null; declared_status: string | null;
    outputs: { product: string; unit: string; quantity: number; status: string }[] | null;
  }[];
}

const border = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
};

function headCell(v: string | number) {
  return {
    v, t: 's' as const,
    s: {
      fill: { fgColor: { rgb: '1F2A44' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border,
    },
  };
}

function cell(v: string | number, opts: { bold?: boolean; num?: boolean; center?: boolean; fill?: string } = {}) {
  return {
    v, t: opts.num ? ('n' as const) : ('s' as const),
    s: {
      font: { bold: !!opts.bold, sz: 10 },
      alignment: { horizontal: opts.num ? 'right' : opts.center ? 'center' : 'left', vertical: 'center' },
      border,
      ...(opts.fill ? { fill: { fgColor: { rgb: opts.fill } } } : {}),
    },
  };
}

function titleCell(v: string) {
  return { v, t: 's' as const, s: { font: { bold: true, sz: 12 } } };
}

/** Danh sách ngày YYYY-MM-DD từ from → to (bao gồm 2 đầu) */
function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  while (cur <= end) {
    const d = new Date(cur);
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
    cur += 86400000;
    if (out.length > 400) break; // chặn khoảng ngày quá dài
  }
  return out;
}

function isSunday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

export function buildReportWorkbook(data: ReportData): Buffer {
  const { warehouseName, from, to, rangeLabel } = data;
  const dates = datesInRange(from, to);
  const spanMonths = from.slice(0, 7) !== to.slice(0, 7);
  const dayLabel = (dateStr: string) => {
    const [, m, d] = dateStr.split('-');
    return spanMonths ? `${Number(d)}/${Number(m)}` : `${Number(d)}`;
  };
  const wb = XLSX.utils.book_new();

  // Index dữ liệu theo ngày đầy đủ (YYYY-MM-DD)
  const attByWorkerDay = new Map<string, any>();
  for (const a of data.attendance) attByWorkerDay.set(`${a.worker_id}|${a.work_date}`, a);
  const leaveSet = new Set(data.leaveDays.map((l) => `${l.worker_id}|${l.day}`));
  const advanceBy = new Map(data.advances.map((a) => [a.worker_id, Number(a.total)]));
  const products = new Map<string, { unit: string; byWorkerDay: Map<string, number> }>();
  for (const o of data.outputDetail) {
    if (!products.has(o.product_name)) products.set(o.product_name, { unit: o.unit, byWorkerDay: new Map() });
    const p = products.get(o.product_name)!;
    const key = `${o.worker_id}|${o.day}`;
    p.byWorkerDay.set(key, (p.byWorkerDay.get(key) || 0) + Number(o.quantity));
  }
  const activeWorkers = data.workers.filter((w) =>
    w.status === 'active' ||
    data.attendance.some((a) => a.worker_id === w.id) ||
    data.outputDetail.some((o) => o.worker_id === w.id)
  );

  // ===== Sheet 1: Tổng Hợp =====
  const productNames = Array.from(products.keys());
  const s1: any[][] = [
    [titleCell(`TỔNG HỢP ${rangeLabel.toUpperCase()} — ${warehouseName.toUpperCase()}`)],
    [],
    [
      headCell('STT'), headCell('Họ tên'), headCell('CCCD'), headCell('Trạng thái'),
      headCell('Ngày công'), headCell('Tổng giờ'), headCell('Nghỉ có báo'), headCell('Quên check-out'),
      ...productNames.map((p) => headCell(`${p} (${products.get(p)!.unit})`)),
      headCell('Ứng lương đã duyệt (đ)'),
    ],
  ];
  activeWorkers.forEach((w, i) => {
    let days = 0, hours = 0, missing = 0, leaves = 0;
    for (const d of dates) {
      const a = attByWorkerDay.get(`${w.id}|${d}`);
      if (a?.check_in_at) {
        days++;
        if (a.hours != null) hours += Number(a.hours);
        if (!a.check_out_at) missing++;
      } else if (leaveSet.has(`${w.id}|${d}`)) {
        leaves++;
      }
    }
    s1.push([
      cell(i + 1, { num: true }),
      cell(w.full_name),
      cell(w.cccd),
      cell(w.status === 'active' ? 'Đang làm' : 'Đã nghỉ'),
      cell(days, { num: true }),
      cell(Math.round(hours * 10) / 10, { num: true }),
      cell(leaves, { num: true }),
      cell(missing, { num: true }),
      ...productNames.map((p) => {
        let total = 0;
        for (const d of dates) total += products.get(p)!.byWorkerDay.get(`${w.id}|${d}`) || 0;
        return cell(total, { num: true });
      }),
      cell(advanceBy.get(w.id) || 0, { num: true }),
    ]);
  });
  const ws1 = XLSX.utils.aoa_to_sheet(s1);
  ws1['!cols'] = [{ wch: 4 }, { wch: 26 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 11 }, { wch: 13 },
    ...productNames.map(() => ({ wch: 14 })), { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Tổng Hợp');

  // ===== Sheet 2: Bảng Công Chi Tiết =====
  const dayHeads = dates.map((d) => headCell(dayLabel(d)));
  const s2: any[][] = [
    [titleCell(`BẢNG CÔNG CHI TIẾT ${rangeLabel.toUpperCase()} — ${warehouseName.toUpperCase()}`)],
    [{ v: 'Ô = số giờ làm · P = nghỉ có báo · ? = quên check-out (giờ chưa chốt)', t: 's', s: { font: { italic: true, sz: 9 } } }],
    [headCell('Họ tên'), ...dayHeads, headCell('Công'), headCell('Giờ')],
  ];
  for (const w of activeWorkers) {
    let days = 0, hours = 0;
    const row: any[] = [cell(w.full_name)];
    for (const d of dates) {
      const fill = isSunday(d) ? 'F1F5F9' : undefined;
      const a = attByWorkerDay.get(`${w.id}|${d}`);
      if (a?.check_in_at) {
        days++;
        if (!a.check_out_at) {
          row.push(cell('?', { center: true, fill: 'FDE68A' }));
        } else {
          const h = Number(a.hours || 0);
          hours += h;
          row.push(cell(h, { num: true, fill }));
        }
      } else if (leaveSet.has(`${w.id}|${d}`)) {
        row.push(cell('P', { center: true, fill: 'BFDBFE' }));
      } else {
        row.push(cell('', { fill }));
      }
    }
    row.push(cell(days, { num: true, bold: true }), cell(Math.round(hours * 10) / 10, { num: true, bold: true }));
    s2.push(row);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(s2);
  ws2['!cols'] = [{ wch: 24 }, ...dates.map(() => ({ wch: spanMonths ? 5.5 : 4.5 })), { wch: 6 }, { wch: 7 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Bảng Công Chi Tiết');

  // ===== Sheet 3: Sản Lượng Chi Tiết =====
  const s3: any[][] = [[titleCell(`SẢN LƯỢNG CHI TIẾT ${rangeLabel.toUpperCase()} — ${warehouseName.toUpperCase()}`)], []];
  if (products.size === 0) s3.push([cell('Chưa có sản lượng trong khoảng này')]);
  for (const [pname, p] of products) {
    s3.push([titleCell(`${pname} (${p.unit})`)]);
    s3.push([headCell('Họ tên'), ...dayHeads, headCell('Tổng')]);
    for (const w of activeWorkers) {
      let total = 0;
      const row: any[] = [cell(w.full_name)];
      for (const d of dates) {
        const q = p.byWorkerDay.get(`${w.id}|${d}`);
        if (q) { total += q; row.push(cell(q, { num: true })); }
        else row.push(cell('', { fill: isSunday(d) ? 'F1F5F9' : undefined }));
      }
      if (total > 0) { row.push(cell(total, { num: true, bold: true })); s3.push(row); }
    }
    s3.push([]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet(s3);
  ws3['!cols'] = [{ wch: 24 }, ...dates.map(() => ({ wch: spanMonths ? 5.5 : 5 })), { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Sản Lượng Chi Tiết');

  // ===== Sheet 4: Chi Tiết Đợt (chế độ nhiều đợt/ngày) =====
  // Mỗi dòng = 1 đợt vào-ra: giờ vào, giờ ra, số giờ, phương thức, trạng thái giờ tự khai,
  // sản lượng tự khai của đợt. Kho chế độ theo ca cũng hiện (mỗi ngày 1 đợt).
  if (data.sessions && data.sessions.length > 0) {
    const fmtT = (ts: string | null) =>
      ts ? new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
    const methodLabel = (m: string | null) =>
      m === 'qr' ? 'QR cổng' : m === 'declared' ? 'Tự khai' : m === 'manual' ? 'Sửa tay' : m === 'gps' ? 'GPS' : '—';
    const declaredLabel = (st: string | null) =>
      st === 'pending' ? 'Chờ duyệt' : st === 'rejected' ? 'Từ chối' : st === 'approved' ? 'Đã duyệt' : '';

    const s4: any[][] = [
      [titleCell(`CHI TIẾT ĐỢT VÀO-RA ${rangeLabel.toUpperCase()} — ${warehouseName.toUpperCase()}`)],
      [],
      [headCell('Ngày'), headCell('Họ tên'), headCell('Đợt'), headCell('Giờ vào'), headCell('Giờ ra'),
       headCell('Số giờ'), headCell('PT vào'), headCell('PT ra'), headCell('Giờ tự khai'), headCell('Sản lượng đợt')],
    ];
    for (const r of data.sessions) {
      const notCounted = r.declared_status === 'pending' || r.declared_status === 'rejected';
      const outputsText = Array.isArray(r.outputs)
        ? r.outputs.map((o: any) =>
            `${o.product}: ${Number(o.quantity)} ${o.unit}${o.status === 'pending' ? ' (chờ duyệt)' : ''}`
          ).join('; ')
        : '';
      const [, m, d] = String(r.day).split('-');
      s4.push([
        cell(`${d}/${m}`, { center: true }),
        cell(r.full_name),
        cell(r.session_no ?? 1, { num: true }),
        cell(fmtT(r.check_in_at), { center: true }),
        cell(fmtT(r.check_out_at), { center: true }),
        // Giờ chờ duyệt/từ chối không tính — tô nền vàng nhạt để nhận ra
        cell(r.hours != null ? Number(r.hours) : '', { num: r.hours != null, fill: notCounted ? 'FEF3C7' : undefined }),
        cell(methodLabel(r.check_in_method), { center: true }),
        cell(methodLabel(r.check_out_method), { center: true }),
        cell(declaredLabel(r.declared_status), { center: true, fill: notCounted ? 'FEF3C7' : undefined }),
        cell(outputsText),
      ]);
    }
    const ws4 = XLSX.utils.aoa_to_sheet(s4);
    ws4['!cols'] = [{ wch: 7 }, { wch: 24 }, { wch: 5 }, { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 44 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Chi Tiết Đợt');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
