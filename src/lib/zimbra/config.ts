import type { ZimbraConfig } from './types';

export function getZimbraConfig(): ZimbraConfig {
  const adminUrl = process.env.ZIMBRA_ADMIN_URL;
  const adminUser = process.env.ZIMBRA_ADMIN_USER;
  const adminPassword = process.env.ZIMBRA_ADMIN_PASSWORD;

  if (!adminUrl) throw new Error('Missing required env var: ZIMBRA_ADMIN_URL');
  if (!adminUser) throw new Error('Missing required env var: ZIMBRA_ADMIN_USER');
  if (!adminPassword) throw new Error('Missing required env var: ZIMBRA_ADMIN_PASSWORD');

  const rejectUnauthorized = (process.env.ZIMBRA_TLS_REJECT_UNAUTHORIZED ?? 'true') !== 'false';

  return {
    adminUrl,
    adminUser,
    adminPassword,
    rejectUnauthorized,
    caCert: process.env.ZIMBRA_CA_CERT,
    defaultPasswordSuffix: process.env.ZIMBRA_DEFAULT_PASSWORD_SUFFIX ?? '@123',
  };
}
