import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const token = request.headers.get('x-setup-token');
    if (!process.env.SETUP_TOKEN || token !== process.env.SETUP_TOKEN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    console.log('Starting database setup...');

    // Create software table
    console.log('Creating software table...');
    let softwareError: string | null = null;
    try {
      await execute(`
        CREATE TABLE IF NOT EXISTS software (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          vendor TEXT NOT NULL,
          version TEXT DEFAULT '',
          licenseType TEXT DEFAULT 'subscription',
          totalLicenses INTEGER DEFAULT 0,
          usedLicenses INTEGER DEFAULT 0,
          unitCost DECIMAL(10,2) DEFAULT 0,
          renewalDate TEXT DEFAULT '',
          category TEXT DEFAULT 'productivity',
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
          notes TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
    } catch (err) {
      softwareError = err instanceof Error ? err.message : String(err);
      console.error('software table error:', softwareError);
    }

    // Create domains table
    console.log('Creating domains table...');
    let domainsError: string | null = null;
    try {
      await execute(`
        CREATE TABLE IF NOT EXISTS domains (
          id TEXT PRIMARY KEY,
          domain TEXT NOT NULL UNIQUE,
          registrar TEXT NOT NULL,
          registrationDate TEXT DEFAULT '',
          expirationDate TEXT DEFAULT '',
          renewalCost DECIMAL(10,2) DEFAULT 0,
          autoRenewal BOOLEAN DEFAULT FALSE,
          dnsProvider TEXT DEFAULT '',
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
          notes TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
    } catch (err) {
      domainsError = err instanceof Error ? err.message : String(err);
      console.error('domains table error:', domainsError);
    }

    // Create email_accounts table
    console.log('Creating email_accounts table...');
    let emailError: string | null = null;
    try {
      await execute(`
        CREATE TABLE IF NOT EXISTS email_accounts (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          provider TEXT NOT NULL,
          storageQuota DECIMAL(10,2) DEFAULT 0,
          usedStorage DECIMAL(10,2) DEFAULT 0,
          lastLogin TEXT DEFAULT '',
          twoFaEnabled BOOLEAN DEFAULT FALSE,
          createdDate TEXT DEFAULT '',
          expirationDate TEXT DEFAULT '',
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
          notes TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error('email_accounts table error:', emailError);
    }

    // Create indexes
    console.log('Creating indexes...');
    let indexError: string | null = null;
    try {
      await execute(`
        CREATE INDEX IF NOT EXISTS idx_software_status ON software(status);
        CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
        CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
        CREATE INDEX IF NOT EXISTS idx_email_accounts_status ON email_accounts(status);
        CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email);
      `);
    } catch (err) {
      indexError = err instanceof Error ? err.message : String(err);
      console.error('indexes error:', indexError);
    }

    console.log('Database setup complete!');

    return NextResponse.json({
      success: true,
      message: 'Database tables created successfully!',
      tables: {
        software: !softwareError,
        domains: !domainsError,
        email_accounts: !emailError,
        indexes: !indexError
      }
    });

  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to setup database'
      },
      { status: 500 }
    );
  }
}
