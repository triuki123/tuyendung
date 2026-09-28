import { NextRequest, NextResponse } from 'next/server';
import { ZKTecoClient } from '@/lib/zkteco/zkClient';

/**
 * Test ZKTeco connection
 * GET /api/zkteco/test
 */
export async function GET(request: NextRequest) {
  const machineIp = request.nextUrl.searchParams.get('ip') || process.env.ZKTECO_MACHINE_IP || '115.79.205.119';
  const machinePort = parseInt(
    request.nextUrl.searchParams.get('port') || process.env.ZKTECO_MACHINE_PORT || '1111',
    10
  );

  try {
    console.log(`[API] Testing ZKTeco connection to ${machineIp}:${machinePort}`);

    const zkClient = new ZKTecoClient(machineIp, machinePort);

    // Test connect
    await zkClient.connect();

    // Get users
    const users = await zkClient.getUsers();

    // Get attendance
    const records = await zkClient.getAttendanceRecords();

    await zkClient.disconnect();

    return NextResponse.json({
      success: true,
      message: `Connected to ZKTeco machine at ${machineIp}:${machinePort}`,
      users: users.length,
      attendanceRecords: records.length,
      details: {
        usersCount: users.length,
        recordsCount: records.length,
        sampleUsers: users.slice(0, 3),
        sampleRecords: records.slice(0, 3),
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[API] ZKTeco test failed:`, err);

    return NextResponse.json(
      {
        success: false,
        error: `Failed to connect to ZKTeco machine: ${errorMsg}`,
        machine: `${machineIp}:${machinePort}`,
      },
      { status: 500 }
    );
  }
}
