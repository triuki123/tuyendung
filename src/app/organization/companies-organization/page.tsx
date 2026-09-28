import PermissionGate from '@/components/PermissionGate';
import OrganizationStructureManagement from '../components/OrganizationStructureManagement';
import OrgBackLink from '../components/OrgBackLink';

export default function CompaniesOrganizationPage() {
  return (
    <PermissionGate unitId="org-companies" backHref="/organization" backLabel="Quản Lý Tổ Chức">
      <OrgBackLink />
      <OrganizationStructureManagement />
    </PermissionGate>
  );
}
