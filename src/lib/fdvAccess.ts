import { NextRequest } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
export function canFdv(request: NextRequest, unit = 'hr-requisitions') {
  return !!request.headers.get('x-current-user-id') && (['super_admin', 'admin', 'manager'].includes(request.headers.get('x-current-user-role') || '') || checkUnitAccess(request, unit, 'view'));
}
