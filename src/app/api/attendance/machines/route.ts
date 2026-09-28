import { NextRequest, NextResponse } from 'next/server';
import * as machineService from '@/lib/services/machineService';
import { pollerManager } from '@/lib/zkteco/pollerManager';
import { checkUnitAccess } from '@/lib/api-permissions';

// Luôn động — tránh App Router/trình duyệt cache danh sách máy (sửa xong phải thấy ngay)
export const dynamic = 'force-dynamic';

// host hợp lệ: IPv4 hoặc tên miền (cho phép máy ở xa qua domain/DDNS)
const HOST_RE = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})$/;

/** Validate input máy. Trả về chuỗi lỗi hoặc null nếu hợp lệ. */
function validateMachine(host: string, port: number, connection_mode?: string): string | null {
  if (!HOST_RE.test(String(host).trim())) return 'Host phải là địa chỉ IP hoặc tên miền hợp lệ';
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 'Port phải trong khoảng 1–65535';
  if (connection_mode && !['pull', 'push'].includes(connection_mode)) return 'Chế độ kết nối không hợp lệ';
  return null;
}

/**
 * GET /api/attendance/machines
 * Lấy danh sách tất cả máy chấm công
 */
export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'cham-cong-machines', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const role = request.headers.get('x-current-user-role') || '';
    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const machines = await machineService.getAllMachines(
      role === 'super_admin' ? null : companyId
    );
    return NextResponse.json({
      success: true,
      data: machines,
    });
  } catch (err) {
    console.error('GET /api/attendance/machines error:', err);
    return NextResponse.json(
      { error: 'Lỗi khi lấy danh sách máy' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/attendance/machines
 * Tạo máy mới
 */
export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'cham-cong-machines', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const role = request.headers.get('x-current-user-role') || '';
    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const body = await request.json();
    const idRaw = body.id;
    const name = typeof body.name === 'string' ? body.name.trim() : body.name;
    const { host, port, machine_type, location, notes, connection_mode, comm_key, poll_interval_seconds } = body;

    // Chuẩn hóa & validate Mã máy: bỏ khoảng trắng/tab thừa, chỉ cho chữ-số-_-.
    const id = typeof idRaw === 'string' ? idRaw.trim() : idRaw;

    if (!id || !name || !host || !port) {
      return NextResponse.json(
        { error: 'Thiếu thông tin bắt buộc: id, name, host, port' },
        { status: 400 }
      );
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
      return NextResponse.json(
        { error: 'Mã máy chỉ được chứa chữ, số, dấu _ . - (không khoảng trắng/ký tự đặc biệt)' },
        { status: 400 }
      );
    }

    const portNum = parseInt(port, 10);
    const vErr = validateMachine(host, portNum, connection_mode);
    if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });

    // Check if machine already exists
    const existing = await machineService.getMachineById(id);
    if (existing) {
      return NextResponse.json(
        { error: 'Mã máy này đã tồn tại' },
        { status: 409 }
      );
    }

    const machine = await machineService.createMachine({
      id,
      company_id: role === 'super_admin' ? (body.company_id || companyId) : companyId,
      name,
      host: String(host).trim(),
      port: portNum,
      machine_type,
      location,
      notes,
      connection_mode,
      comm_key,
      poll_interval_seconds: poll_interval_seconds ? parseInt(poll_interval_seconds, 10) : undefined,
    });

    // Đồng bộ lại pollers (máy pull mới → bắt đầu poll ngay)
    pollerManager.reconcile().catch(() => {});

    return NextResponse.json({
      success: true,
      data: machine,
    });
  } catch (err) {
    console.error('POST /api/attendance/machines error:', err);
    return NextResponse.json(
      { error: 'Lỗi khi tạo máy' },
      { status: 500 }
    );
  }
}
