'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Server, AlertCircle, CheckCircle, AlertTriangle, Mail } from 'lucide-react';
import DomainsTab from './DomainsTab';
import AccountsTab from './AccountsTab';
import GroupsTab from './GroupsTab';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

function Toast({ message, type }: ToastState) {
  const styles = {
    success: { bg: 'bg-emerald-900/90 border-emerald-700', text: 'text-emerald-300', Icon: CheckCircle },
    error: { bg: 'bg-red-900/90 border-red-700', text: 'text-red-300', Icon: AlertCircle },
    warning: { bg: 'bg-yellow-900/90 border-yellow-700', text: 'text-yellow-300', Icon: AlertTriangle },
    info: { bg: 'bg-blue-900/90 border-blue-700', text: 'text-blue-300', Icon: Mail },
  }[type];

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${styles.bg}`}>
      <styles.Icon size={18} className={styles.text} />
      <span className={`text-sm font-medium ${styles.text}`}>{message}</span>
    </div>
  );
}

type TabId = 'domains' | 'accounts' | 'groups';

const TABS: { id: TabId; label: string }[] = [
  { id: 'domains', label: 'Domains' },
  { id: 'accounts', label: 'Tài Khoản' },
  { id: 'groups', label: 'Nhóm (DL)' },
];

export default function ZimbraClient() {
  const [activeTab, setActiveTab] = useState<TabId>('domains');
  const [initialized, setInitialized] = useState<Set<TabId>>(new Set(['domains']));
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('assetflow_auth');
      const user = JSON.parse(stored || '{}');
      setIsAdmin(user.role === 'super_admin' || user.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setInitialized((prev) => new Set([...prev, tab]));
  };

  const showToast = useCallback((message: string, type: ToastState['type'] = 'info') => {
    setToast({ message, type });
  }, []);

  const getHeaders = useCallback((): Record<string, string> => {
    try {
      const stored = localStorage.getItem('assetflow_auth');
      const u = JSON.parse(stored || '{}');
      return { 'Content-Type': 'application/json', 'x-current-user-id': u.id || '' };
    } catch {
      return { 'Content-Type': 'application/json' };
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {toast && (
          <div className="fixed bottom-4 right-4 z-50">
            <Toast message={toast.message} type={toast.type} />
          </div>
        )}

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 flex items-center justify-center">
            <Server size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Zimbra Mail</h1>
            <p className="text-ink-muted text-sm">Quản lý tài khoản và nhóm email Zimbra</p>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 mb-6 bg-hover rounded-xl p-1 w-full md:w-fit overflow-x-auto border border-line">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-ink-muted hover:text-white hover:bg-hover'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-hover border border-line rounded-xl p-4 md:p-6">
          {initialized.has('domains') && (
            <div className={activeTab === 'domains' ? '' : 'hidden'}>
              <DomainsTab isActive={activeTab === 'domains'} isAdmin={isAdmin} getHeaders={getHeaders} />
            </div>
          )}
          {initialized.has('accounts') && (
            <div className={activeTab === 'accounts' ? '' : 'hidden'}>
              <AccountsTab isActive={activeTab === 'accounts'} isAdmin={isAdmin} getHeaders={getHeaders} onToast={showToast} />
            </div>
          )}
          {initialized.has('groups') && (
            <div className={activeTab === 'groups' ? '' : 'hidden'}>
              <GroupsTab isActive={activeTab === 'groups'} isAdmin={isAdmin} getHeaders={getHeaders} onToast={showToast} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
