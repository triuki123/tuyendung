import { notFound } from 'next/navigation';
import { getPublicProfileBySlug, incrementView, type PublicProfile } from '@/lib/services/ecardService';
import { getPublicCompanyProfileBySlug, incrementCompanyView } from '@/lib/services/companyEcardService';
import ProfileTemplate from './templates';

export const dynamic = 'force-dynamic';

/** Resolve slug: hồ sơ cá nhân trước, không có thì hồ sơ doanh nghiệp. */
async function resolveProfile(slug: string): Promise<{ profile: PublicProfile; company: boolean } | null> {
  const person = await getPublicProfileBySlug(slug);
  if (person) return { profile: person, company: false };
  const company = await getPublicCompanyProfileBySlug(slug);
  if (company) return { profile: company, company: true };
  return null;
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const r = await resolveProfile(params.slug);
  if (!r) return { title: 'Hồ sơ năng lực' };
  const p = r.profile;
  return {
    title: `${p.name}${p.job_title ? ` — ${p.job_title}` : ''}`,
    description: p.headline || p.bio || `Hồ sơ năng lực ${r.company ? 'doanh nghiệp' : ''} ${p.name}`.trim(),
  };
}

export default async function CardPage({ params }: { params: { slug: string } }) {
  const r = await resolveProfile(params.slug);
  if (!r) notFound();
  if (r.company) await incrementCompanyView(params.slug).catch(() => {});
  else await incrementView(params.slug).catch(() => {});
  return <ProfileTemplate profile={r.profile} />;
}
