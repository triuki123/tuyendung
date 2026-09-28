import { getSoftware } from './softwareService';
import { getDomains } from './domainsService';
import { getEmailAccounts } from './emailAccountsService';

export interface DashboardStats {
  modules: {
    hardware: { count: number; label: string };
    domains: { count: number; label: string };
    emailAccounts: { count: number; label: string };
    software: { count: number; label: string };
  };
  summary: {
    totalAssets: number;
    warnings: number;
    recentActivity: number;
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Fetch data from all modules in parallel
    const [softwareData, domainsData, emailAccountsData] = await Promise.all([
      getSoftware(),
      getDomains(),
      getEmailAccounts(),
    ]);

    // Calculate statistics
    const softwareCount = Array.isArray(softwareData) ? softwareData.length : 0;
    const domainsCount = Array.isArray(domainsData) ? domainsData.length : 0;
    const emailAccountsCount = Array.isArray(emailAccountsData) ? emailAccountsData.length : 0;

    // Calculate warnings (expiring or expired items)
    const expiringDomains = Array.isArray(domainsData)
      ? domainsData.filter((d: any) => d.status === 'expiring' || d.status === 'expired').length
      : 0;

    const expiringSoftware = Array.isArray(softwareData)
      ? softwareData.filter((s: any) => s.status === 'expiring' || s.status === 'expired').length
      : 0;

    const totalWarnings = expiringDomains + expiringSoftware;

    // Calculate recent activity (items created in last 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let recentActivityCount = 0;

    // Count recent domains
    if (Array.isArray(domainsData)) {
      recentActivityCount += domainsData.filter((d: any) => {
        const createdAt = new Date(d.created_at);
        return createdAt >= sevenDaysAgo;
      }).length;
    }

    // Count recent software
    if (Array.isArray(softwareData)) {
      recentActivityCount += softwareData.filter((s: any) => {
        const createdAt = new Date(s.created_at);
        return createdAt >= sevenDaysAgo;
      }).length;
    }

    // Count recent email accounts
    if (Array.isArray(emailAccountsData)) {
      recentActivityCount += emailAccountsData.filter((e: any) => {
        const createdAt = new Date(e.created_at);
        return createdAt >= sevenDaysAgo;
      }).length;
    }

    const totalAssets = softwareCount + domainsCount + emailAccountsCount;

    return {
      modules: {
        hardware: { count: 245, label: 'Phần Cứng' },
        domains: { count: domainsCount, label: 'Tên Miền' },
        emailAccounts: { count: emailAccountsCount, label: 'Tài Khoản Email' },
        software: { count: softwareCount, label: 'Phần Mềm' },
      },
      summary: {
        totalAssets,
        warnings: totalWarnings,
        recentActivity: recentActivityCount,
      },
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    // Return default values on error
    return {
      modules: {
        hardware: { count: 245, label: 'Phần Cứng' },
        domains: { count: 0, label: 'Tên Miền' },
        emailAccounts: { count: 0, label: 'Tài Khoản Email' },
        software: { count: 0, label: 'Phần Mềm' },
      },
      summary: {
        totalAssets: 0,
        warnings: 0,
        recentActivity: 0,
      },
    };
  }
}
