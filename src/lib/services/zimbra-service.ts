import { callAdmin } from '@/lib/zimbra/soap-client';
import { ZimbraError } from '@/lib/zimbra/types';
import { getZimbraConfig } from '@/lib/zimbra/config';

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// Zimbra JSON SOAP returns entity attributes as `a: [{ n, _content }]`.
// Some responses also expose `_attrs: { name: value }`. Read both defensively.
function getAttr(entity: any, name: string): string | undefined {
  const fromAttrs = entity?._attrs?.[name];
  if (typeof fromAttrs === 'string') return fromAttrs;
  if (Array.isArray(fromAttrs)) return fromAttrs[0];
  const list: any[] = entity?.a ?? [];
  const hit = list.find((x) => x?.n === name);
  return hit?._content;
}

export function defaultPassword(canonicalEmail: string): string {
  const localpart = canonicalEmail.split('@')[0] ?? canonicalEmail;
  const { defaultPasswordSuffix } = getZimbraConfig();
  return capitalize(localpart) + defaultPasswordSuffix;
}

// RFC 4515: escape special chars in LDAP filter values
export function escapeLdap(s: string): string {
  return s
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}

export async function listDomains(): Promise<Array<{ id: string; name: string }>> {
  const res = await callAdmin<any>('GetAllDomains', {});
  const domains: any[] = res?.GetAllDomainsResponse?.domain ?? [];
  return domains.map((d) => ({ id: d.id as string, name: d.name as string }));
}

export async function searchAccounts(opts: {
  domain?: string;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ accounts: Array<{ id: string; name: string; displayName?: string; status?: string; description?: string }>; more: boolean }> {
  const limit = Math.min(opts.limit ?? 25, 500);
  const offset = opts.offset ?? 0;

  let filter = '(objectClass=zimbraAccount)';
  if (opts.domain) {
    filter += `(zimbraMailDeliveryAddress=*@${escapeLdap(opts.domain)})`;
  }
  if (opts.query) {
    const q = escapeLdap(opts.query);
    filter += `(|(mail=*${q}*)(displayName=*${q}*))`;
  }
  if (opts.domain || opts.query) {
    filter = `(&${filter})`;
  }

  const res = await callAdmin<any>('SearchDirectory', {
    query: filter,
    types: 'accounts',
    attrs: 'displayName,cn,zimbraAccountStatus,description',
    limit,
    offset,
  });

  const accounts: any[] = res?.SearchDirectoryResponse?.account ?? [];
  const more =
    res?.SearchDirectoryResponse?.more === true ||
    res?.SearchDirectoryResponse?.more === '1' ||
    res?.SearchDirectoryResponse?.more === 1;

  return {
    accounts: accounts.map((a) => ({
      id: a.id as string,
      name: a.name as string,
      displayName: getAttr(a, 'displayName') ?? getAttr(a, 'cn'),
      status: getAttr(a, 'zimbraAccountStatus'),
      description: getAttr(a, 'description'),
    })),
    more,
  };
}

export async function createAccount(opts: {
  email: string;
  password?: string;
  displayName?: string;
}): Promise<{ id: string; name: string }> {
  const password = opts.password ?? defaultPassword(opts.email);

  const attrs = opts.displayName
    ? [{ n: 'displayName', _content: opts.displayName }]
    : [];

  try {
    const res = await callAdmin<any>('CreateAccount', {
      name: opts.email,
      password,
      a: attrs,
    });
    const acct = res?.CreateAccountResponse?.account?.[0];
    if (!acct?.id) throw new ZimbraError('UNEXPECTED_RESPONSE', 'CreateAccount returned no account');
    return { id: acct.id as string, name: acct.name as string };
  } catch (err) {
    if (err instanceof ZimbraError && err.code === 'account.ACCOUNT_EXISTS') {
      throw new ZimbraError('ACCOUNT_EXISTS', `Account already exists: ${opts.email}`);
    }
    throw err;
  }
}

export async function updateAccount(opts: {
  id: string;
  displayName?: string;
  newEmail?: string;
  status?: string;
  description?: string;
}): Promise<{ id: string; name: string; displayName?: string; status?: string; description?: string }> {
  try {
    if (opts.newEmail) {
      await callAdmin('RenameAccount', { id: opts.id, newName: opts.newEmail });
    }
    const modAttrs: Array<{ n: string; _content: string }> = [];
    if (opts.displayName !== undefined) {
      modAttrs.push({ n: 'displayName', _content: opts.displayName });
    }
    if (opts.description !== undefined) {
      modAttrs.push({ n: 'description', _content: opts.description });
    }
    if (opts.status) {
      modAttrs.push({ n: 'zimbraAccountStatus', _content: opts.status });
    }
    if (modAttrs.length > 0) {
      await callAdmin('ModifyAccount', { id: opts.id, a: modAttrs });
    }
  } catch (err) {
    if (err instanceof ZimbraError && err.code === 'account.ACCOUNT_EXISTS') {
      throw new ZimbraError('ACCOUNT_EXISTS', `Account already exists: ${opts.newEmail}`);
    }
    throw err;
  }

  const res = await callAdmin<any>('GetAccount', {
    account: { by: 'id', _content: opts.id },
  });
  const acct = res?.GetAccountResponse?.account?.[0];
  return {
    id: acct?.id ?? opts.id,
    name: acct?.name ?? opts.newEmail ?? '',
    displayName: getAttr(acct, 'displayName'),
    status: getAttr(acct, 'zimbraAccountStatus'),
    description: getAttr(acct, 'description'),
  };
}

export async function resetPassword(
  email: string
): Promise<{ email: string; newPassword: string }> {
  const getRes = await callAdmin<any>('GetAccount', {
    account: { by: 'name', _content: email },
  });

  const acct = getRes?.GetAccountResponse?.account?.[0];
  if (!acct?.id) throw new ZimbraError('ACCOUNT_NOT_FOUND', `No account found for: ${email}`);
  const canonicalName: string = acct.name ?? email;
  const accountId: string = acct.id;

  const newPassword = defaultPassword(canonicalName);

  await callAdmin('SetPassword', { id: accountId, newPassword });

  return { email: canonicalName, newPassword };
}

export async function listGroups(): Promise<
  Array<{ id: string; name: string; displayName?: string; memberCount?: number }>
> {
  const res = await callAdmin<any>('GetAllDistributionLists', {});
  const lists: any[] = res?.GetAllDistributionListsResponse?.dl ?? [];
  return lists.map((dl) => ({
    id: dl.id as string,
    name: dl.name as string,
    displayName: getAttr(dl, 'displayName'),
  }));
}

export async function createGroup(opts: {
  email: string;
  displayName?: string;
}): Promise<{ id: string; name: string }> {
  const attrs = opts.displayName
    ? [{ n: 'displayName', _content: opts.displayName }]
    : [];
  try {
    const res = await callAdmin<any>('CreateDistributionList', {
      name: opts.email,
      a: attrs,
    });
    const dl = res?.CreateDistributionListResponse?.dl?.[0];
    if (!dl?.id) throw new ZimbraError('UNEXPECTED_RESPONSE', 'CreateDistributionList returned no dl');
    return { id: dl.id as string, name: dl.name as string };
  } catch (err) {
    if (err instanceof ZimbraError && err.code === 'account.DISTRIBUTION_LIST_EXISTS') {
      throw new ZimbraError('GROUP_EXISTS', `Group already exists: ${opts.email}`);
    }
    throw err;
  }
}

export async function addGroupMember(dlId: string, email: string): Promise<void> {
  await callAdmin('AddDistributionListMember', {
    id: dlId,
    dlm: [{ _content: email }],
  });
}

export async function removeGroupMember(dlId: string, email: string): Promise<void> {
  await callAdmin('RemoveDistributionListMember', {
    id: dlId,
    dlm: [{ _content: email }],
  });
}

export async function listGroupMembers(dlId: string): Promise<string[]> {
  const res = await callAdmin<any>('GetDistributionList', {
    dl: { by: 'id', _content: dlId },
  });
  const dl = res?.GetDistributionListResponse?.dl?.[0];
  const members: any[] = dl?.dlm ?? [];
  return members
    .map((m) => (typeof m === 'string' ? m : m._content))
    .filter(Boolean);
}
