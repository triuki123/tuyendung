import PermissionGate from '@/components/PermissionGate';
import OrgBackLink from '../components/OrgBackLink';
import InactiveCompaniesClient from '../components/InactiveCompaniesClient';

export default function InactiveCompaniesPage() {
  return (
    <PermissionGate unitId="org-companies" backHref="/organization" backLabel="Quản Lý Tổ Chức">
      <OrgBackLink />
      <InactiveCompaniesClient />
    </PermissionGate>
  );
}
