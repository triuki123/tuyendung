export interface ZimbraConfig {
  adminUrl: string;
  adminUser: string;
  adminPassword: string;
  rejectUnauthorized: boolean;
  caCert?: string;
  defaultPasswordSuffix: string;
}

export interface ZimbraDomain {
  id: string;
  name: string;
}

export interface ZimbraAccount {
  id: string;
  name: string;       // email address
  displayName?: string;
  status?: string;
}

export interface ZimbraDistributionList {
  id: string;
  name: string;
  memberCount?: number;
}

export class ZimbraError extends Error {
  constructor(public code: string, public reason: string) {
    super(`Zimbra error [${code}]: ${reason}`);
    this.name = 'ZimbraError';
  }
}
