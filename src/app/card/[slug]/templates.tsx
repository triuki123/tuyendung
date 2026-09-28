import { Phone, Mail, TrendingUp, Layers, FolderGit2, Users2, Quote, Sparkles, Briefcase, GraduationCap, BadgeCheck, Globe, MapPin } from 'lucide-react';
import type { PublicProfile } from '@/lib/services/ecardService';
import SaveContactButton from './SaveContactButton';
import Reveal from './Reveal';
import CountUp from './CountUp';
import MobileActionBar from './MobileActionBar';

/** Tiêu đề section: icon + chữ + gạch gradient nhấn (premium). */
function SectionTitle({ Icon, title, t }: { Icon: any; title: string; t: Tok }) {
  return (
    <div className="mb-4">
      <h2 className={`flex items-center gap-2 text-sm font-700 uppercase tracking-wider ${t.serif ? 'font-serif' : ''}`} style={{ color: t.muted }}>
        <Icon size={15} style={{ color: t.accent }} /> {title}
      </h2>
      <div className="mt-2 h-[3px] w-10 rounded-full" style={{ background: t.grad }} />
    </div>
  );
}

export const THEME_ACCENTS: Record<string, { solid: string; grad: string }> = {
  indigo: { solid: '#4f46e5', grad: 'linear-gradient(135deg,#6366f1,#4f46e5 55%,#4338ca)' },
  sky: { solid: '#0284c7', grad: 'linear-gradient(135deg,#38bdf8,#0ea5e9 55%,#0369a1)' },
  emerald: { solid: '#059669', grad: 'linear-gradient(135deg,#34d399,#10b981 55%,#047857)' },
  teal: { solid: '#0d9488', grad: 'linear-gradient(135deg,#2dd4bf,#14b8a6 55%,#0f766e)' },
  rose: { solid: '#e11d48', grad: 'linear-gradient(135deg,#fb7185,#f43f5e 55%,#be123c)' },
  amber: { solid: '#d97706', grad: 'linear-gradient(135deg,#fbbf24,#f59e0b 55%,#b45309)' },
  orange: { solid: '#ea580c', grad: 'linear-gradient(135deg,#fb923c,#f97316 55%,#c2410c)' },
  violet: { solid: '#7c3aed', grad: 'linear-gradient(135deg,#a78bfa,#8b5cf6 55%,#6d28d9)' },
  fuchsia: { solid: '#c026d3', grad: 'linear-gradient(135deg,#e879f9,#d946ef 55%,#a21caf)' },
  slate: { solid: '#0f172a', grad: 'linear-gradient(135deg,#334155,#1e293b 55%,#0f172a)' },
};

const SOCIAL_ORDER = ['website', 'linkedin', 'facebook', 'twitter', 'instagram', 'youtube', 'zalo', 'telegram'];
const DEFAULT_ORDER = ['bio', 'highlights', 'expertise', 'projects', 'clients', 'locations', 'testimonials', 'experiences', 'education', 'certifications'];

interface Tok {
  accent: string; grad: string;
  text: string; muted: string; cardBg: string; cardBorder: string; chipBg: string; serif?: boolean;
  /** Màu nền ĐẶC của khung chứa (cho vòng viền avatar cắt sạch, không dùng rgba trong suốt). */
  surface: string;
}

function initialsOf(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function orderedIds(p: PublicProfile) {
  const o = (Array.isArray(p.section_order) && p.section_order.length ? p.section_order : DEFAULT_ORDER).filter((id) => DEFAULT_ORDER.includes(id));
  for (const id of DEFAULT_ORDER) if (!o.includes(id)) o.push(id);
  return o;
}
const vis = (p: PublicProfile, key: string, has: boolean) => has && (p.visibility as any)?.[key] !== false;

const SEC_META: Record<string, { title: string; Icon: any }> = {
  bio: { title: 'Giới thiệu', Icon: Sparkles },
  highlights: { title: 'Điểm nổi bật', Icon: TrendingUp },
  expertise: { title: 'Lĩnh vực chuyên môn', Icon: Layers },
  projects: { title: 'Dự án tiêu biểu', Icon: FolderGit2 },
  clients: { title: 'Khách hàng & Đối tác', Icon: Users2 },
  locations: { title: 'Trụ sở & Chi nhánh', Icon: MapPin },
  testimonials: { title: 'Khách hàng nói gì', Icon: Quote },
  experiences: { title: 'Kinh nghiệm', Icon: Briefcase },
  education: { title: 'Học vấn', Icon: GraduationCap },
  certifications: { title: 'Chứng chỉ', Icon: BadgeCheck },
};

/** Nội dung từng section (styled theo token). Trả null nếu ẩn/rỗng. */
function sectionNode(id: string, p: PublicProfile, t: Tok): React.ReactNode {
  switch (id) {
    case 'bio':
      return vis(p, 'bio', !!p.bio?.trim())
        ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed" style={{ color: t.text }}>{p.bio}</p> : null;
    case 'highlights': {
      const a = (p as any).highlights as any[];
      return vis(p, 'highlights', Array.isArray(a) && a.length > 0) ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {a.map((h, i) => (
            <div key={i} className="group relative overflow-hidden rounded-2xl p-5 text-center transition-transform duration-300 hover:-translate-y-1"
              style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
              <div aria-hidden className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full opacity-[0.15] blur-xl transition-opacity group-hover:opacity-25" style={{ background: t.accent }} />
              <CountUp value={h.value || ''} className="block text-3xl sm:text-4xl font-800 tracking-tight" style={{ color: t.accent }} />
              <div className="mt-1 text-xs font-600" style={{ color: t.muted }}>{h.label}</div>
            </div>
          ))}
        </div>
      ) : null;
    }
    case 'expertise': {
      const a = (p as any).expertise as any[];
      return vis(p, 'expertise', Array.isArray(a) && a.length > 0) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {a.map((x, i) => (
            <div key={i} className="rounded-2xl p-4 transition-transform duration-300 hover:-translate-y-0.5" style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
              <p className="text-sm font-700" style={{ color: t.text }}>{x.name}</p>
              {x.desc && <p className="mt-1 text-[13px] leading-relaxed" style={{ color: t.muted }}>{x.desc}</p>}
            </div>
          ))}
        </div>
      ) : null;
    }
    case 'projects': {
      const a = (p as any).projects as any[];
      return vis(p, 'projects', Array.isArray(a) && a.length > 0) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {a.map((pr, i) => (
            <div key={i} className="overflow-hidden rounded-2xl transition-transform duration-300 hover:-translate-y-1" style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
              {pr.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pr.image} alt={pr.name || ''} className="h-40 w-full object-cover" />
              )}
              <div className="p-4">
                <p className="text-sm font-700" style={{ color: t.text }}>
                  {pr.url ? <a href={pr.url} target="_blank" rel="noopener noreferrer" style={{ color: t.accent }} className="hover:underline">{pr.name}</a> : pr.name}
                </p>
                {pr.desc && <p className="mt-1 text-[13px] leading-relaxed" style={{ color: t.muted }}>{pr.desc}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : null;
    }
    case 'clients': {
      const a = (p as any).clients as any[];
      return vis(p, 'clients', Array.isArray(a) && a.length > 0) ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {a.map((c, i) => (
            <div key={i} className="flex flex-col items-center justify-center gap-2.5 rounded-2xl p-4 text-center transition-transform hover:-translate-y-0.5"
              style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
              {c.logo ? (
                <div className="flex h-24 w-full items-center justify-center rounded-xl bg-white px-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.logo} alt={c.name || ''} className="max-h-16 max-w-full object-contain" />
                </div>
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl text-2xl font-800" style={{ background: `${t.accent}18`, color: t.accent }}>
                  {initialsOf(c.name || '?')}
                </div>
              )}
              <span className="text-xs font-600 leading-snug" style={{ color: t.text }}>{c.name}</span>
            </div>
          ))}
        </div>
      ) : null;
    }
    case 'locations': {
      const a = (p as any).locations as any[];
      return vis(p, 'locations', Array.isArray(a) && a.length > 0) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {a.map((loc, i) => (
            <div key={i} className="flex gap-3 rounded-2xl p-4" style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${t.accent}18`, color: t.accent }}>
                <MapPin size={17} />
              </div>
              <div className="min-w-0">
                {loc.label && <p className="text-sm font-700" style={{ color: t.text }}>{loc.label}</p>}
                {loc.address && <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: t.muted }}>{loc.address}</p>}
                {loc.phone && (
                  <a href={`tel:${String(loc.phone).replace(/\s/g, '')}`} className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-600 hover:underline" style={{ color: t.accent }}>
                    <Phone size={13} /> {loc.phone}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null;
    }
    case 'testimonials': {
      const a = (p as any).testimonials as any[];
      return vis(p, 'testimonials', Array.isArray(a) && a.length > 0) ? (
        <div className="grid grid-cols-1 gap-4">
          {a.map((ts, i) => (
            <blockquote key={i} className="relative overflow-hidden rounded-2xl p-5 transition-transform duration-300 hover:-translate-y-0.5" style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
              <Quote aria-hidden size={64} className="pointer-events-none absolute -right-2 -top-3 opacity-[0.06]" style={{ color: t.accent }} />
              <Quote size={20} style={{ color: t.accent }} />
              <p className="mt-2 text-[15px] italic leading-relaxed" style={{ color: t.text }}>“{ts.quote}”</p>
              {(ts.author || ts.role) && <p className="mt-2 text-xs font-600" style={{ color: t.muted }}>— {[ts.author, ts.role].filter(Boolean).join(', ')}</p>}
            </blockquote>
          ))}
        </div>
      ) : null;
    }
    case 'experiences': {
      const a = p.experiences as any[];
      return vis(p, 'experiences', Array.isArray(a) && a.length > 0) ? (
        <div className="space-y-4">
          {a.map((x, i) => (
            <div key={i} className="border-l-2 pl-4" style={{ borderColor: `${t.accent}55` }}>
              <p className="text-sm font-700" style={{ color: t.text }}>{x.title}</p>
              {(x.org || x.period) && <p className="text-xs" style={{ color: t.muted }}>{[x.org, x.period].filter(Boolean).join(' · ')}</p>}
              {x.desc && <p className="mt-1 text-sm" style={{ color: t.muted }}>{x.desc}</p>}
            </div>
          ))}
        </div>
      ) : null;
    }
    case 'education': {
      const a = p.education as any[];
      return vis(p, 'education', Array.isArray(a) && a.length > 0) ? (
        <div className="space-y-2">
          {a.map((x, i) => (
            <div key={i}><p className="text-sm font-600" style={{ color: t.text }}>{[x.degree, x.school].filter(Boolean).join(' — ')}</p>
              {x.period && <p className="text-xs" style={{ color: t.muted }}>{x.period}</p>}</div>
          ))}
        </div>
      ) : null;
    }
    case 'certifications': {
      const a = p.certifications as any[];
      return vis(p, 'certifications', Array.isArray(a) && a.length > 0) ? (
        <div className="space-y-2">
          {a.map((x, i) => (
            <div key={i}><p className="text-sm font-600" style={{ color: t.text }}>{x.name}</p>
              {(x.issuer || x.year) && <p className="text-xs" style={{ color: t.muted }}>{[x.issuer, x.year].filter(Boolean).join(' · ')}</p>}</div>
          ))}
        </div>
      ) : null;
    }
    default: return null;
  }
}

function Header({ p, t, variant }: { p: PublicProfile; t: Tok; variant: string }) {
  const unit = [p.job_title, p.sub_dept_name, p.dept_name].filter(Boolean).join(' · ');
  const socials = SOCIAL_ORDER.filter((k) => (p.socials as any)?.[k]).map((k) => [k, (p.socials as any)[k]] as [string, string]);
  const minimal = variant === 'editorial';
  const isCompany = p.kind === 'company'; // hồ sơ doanh nghiệp: hero = logo, ẩn liên hệ cá nhân
  return (
    <div>
      {!minimal && (
        <div className="relative h-44 sm:h-60" style={{ background: t.grad }}>
          {p.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `center ${p.cover_position ?? 50}%` }} />
          )}
          {/* Fade dưới → hòa vào nền, làm avatar/tên nổi bật (premium). */}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-28" style={{ background: `linear-gradient(to top, ${t.surface}, ${t.surface}00)` }} />
        </div>
      )}
      <div className={`px-6 ${minimal ? 'pt-10' : ''}`}>
        {/* Chỉ avatar chồng lên bìa; logo tách xuống hàng tên cho thoáng. */}
        <div className={`relative z-10 ${minimal ? '' : '-mt-16'} mb-3 flex`}>
          {/* Avatar viền gradient + quầng sáng nhẹ (premium). */}
          <div className="rounded-full p-[3px]" style={{ background: t.grad, boxShadow: `0 12px 30px ${t.accent}44` }}>
            {p.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar} alt={p.name} className={`h-32 w-32 rounded-full ${isCompany ? 'object-contain p-3' : 'object-cover'}`} style={{ boxShadow: `0 0 0 4px ${t.surface}`, background: '#fff' }} />
            ) : (
              <div className="flex h-32 w-32 items-center justify-center rounded-full text-4xl font-800 text-white" style={{ background: t.grad, boxShadow: `0 0 0 4px ${t.surface}` }}>{initialsOf(p.name)}</div>
            )}
          </div>
        </div>
        <div className="flex items-start justify-between gap-4">
          <h1 className={`text-3xl sm:text-4xl font-800 ${t.serif ? 'font-serif' : ''}`} style={{ color: t.text, letterSpacing: '-.02em' }}>{p.name}</h1>
          {p.company_logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.company_logo} alt={p.company_name || ''} className="mt-1 h-12 sm:h-14 max-w-[150px] shrink-0 object-contain" />
          )}
        </div>
        {p.headline && <p className="mt-2 text-base leading-relaxed" style={{ color: t.muted }}>{p.headline}</p>}
        {(unit || p.company_name) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {unit && <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-700" style={{ background: `${t.accent}14`, color: t.accent }}>{unit}</span>}
            {p.company_name && <span className="text-sm font-600" style={{ color: t.muted }}>{p.company_name}</span>}
          </div>
        )}
        {Array.isArray(p.skills) && p.skills.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {p.skills.map((s, i) => (
              <span key={i} className="rounded-full px-3 py-1 text-xs font-600" style={{ background: t.chipBg, color: t.text, border: `1px solid ${t.cardBorder}` }}>{s}</span>
            ))}
          </div>
        )}

        {!isCompany && (
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {p.phone && <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-600 active:scale-95 transition" style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, color: t.text }}><Phone size={16} style={{ color: t.accent }} /> Gọi</a>}
          {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-600 active:scale-95 transition" style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, color: t.text }}><Mail size={16} style={{ color: t.accent }} /> Email</a>}
          <SaveContactButton name={p.name} email={p.email} phone={p.phone} position={p.job_title} company={p.company_name} department={p.dept_name} accent={t.accent} />
        </div>
        )}
        {socials.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {socials.map(([k, v]) => {
              const href = /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, '')}`;
              return <a key={k} href={href} target="_blank" rel="noopener noreferrer" title={k === 'website' ? 'Website' : k}>
                {k === 'website' ? (
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: t.accent }}>
                    <Globe className="h-4 w-4" />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/signature-icons/social-${k}.png`} alt={k} className="h-8 w-8 rounded-lg" />
                )}</a>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StackedTemplate({ p, t, variant, pageBg }: { p: PublicProfile; t: Tok; variant: string; pageBg: string }) {
  const ids = orderedIds(p);
  let idx = 0;
  return (
    <div className="min-h-screen w-full" style={{ background: pageBg, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto w-full max-w-2xl overflow-hidden sm:my-8 sm:rounded-3xl shadow-2xl" style={{ background: t.surface }}>
        <Header p={p} t={t} variant={variant} />
        <div className="px-6 pb-8 pt-2">
          {ids.map((id) => {
            const node = sectionNode(id, p, t);
            if (!node) return null;
            const { title, Icon } = SEC_META[id];
            const delay = Math.min(idx++ * 60, 240);
            return (
              <Reveal key={id} delay={delay}>
                <section className="pt-7">
                  <SectionTitle Icon={Icon} title={title} t={t} />
                  {node}
                </section>
              </Reveal>
            );
          })}
        </div>
        <div className="px-6 py-5 text-center" style={{ borderTop: `1px solid ${t.cardBorder}` }}>
          <p className="text-xs" style={{ color: t.muted }}>Hồ sơ năng lực · <span className="font-700">FADO GROUP</span></p>
        </div>
      </div>
      {/* Chừa chỗ cho thanh CTA nổi trên mobile */}
      <div className="h-20 sm:hidden" />
      {p.kind !== 'company' && (
        <MobileActionBar name={p.name} email={p.email} phone={p.phone} position={p.job_title} company={p.company_name} department={p.dept_name}
          accent={t.accent} grad={t.grad} surface={t.surface} text={t.text} border={t.cardBorder} />
      )}
    </div>
  );
}

function BentoTemplate({ p, t }: { p: PublicProfile; t: Tok }) {
  const ids = orderedIds(p);
  return (
    <div className="min-h-screen w-full" style={{ background: '#0b0f1a', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
        <Reveal>
          <div className="rounded-3xl p-6 sm:p-8" style={{ background: t.grad }}>
            <div className="flex items-center gap-4">
              {p.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar} alt={p.name} className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white/30" />
              ) : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 text-2xl font-800 text-white">{initialsOf(p.name)}</div>}
              <div className="min-w-0">
                <h1 className="text-2xl font-800 text-white">{p.name}</h1>
                {[p.job_title, p.dept_name].filter(Boolean).length > 0 && <p className="text-sm text-white/85">{[p.job_title, p.sub_dept_name, p.dept_name].filter(Boolean).join(' · ')}</p>}
                {p.company_name && <p className="text-sm text-white/70">{p.company_name}</p>}
              </div>
            </div>
            {p.headline && <p className="mt-4 text-white/90">{p.headline}</p>}
            <div className="mt-5 flex flex-wrap gap-2.5">
              {p.phone && <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-600 text-white"><Phone size={15} /> Gọi</a>}
              {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-600 text-white"><Mail size={15} /> Email</a>}
              <SaveContactButton name={p.name} email={p.email} phone={p.phone} position={p.job_title} company={p.company_name} department={p.dept_name} accent="#ffffff" />
            </div>
          </div>
        </Reveal>

        <div className="mt-4 grid grid-cols-1 gap-4">
          {ids.map((id) => {
            const node = sectionNode(id, p, t);
            if (!node) return null;
            const { title, Icon } = SEC_META[id];
            return (
              <Reveal key={id}>
                <div className="rounded-3xl p-5 sm:p-6 transition-transform duration-300 hover:-translate-y-0.5" style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
                  <SectionTitle Icon={Icon} title={title} t={t} />
                  {node}
                </div>
              </Reveal>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs text-white/40">Hồ sơ năng lực · <span className="font-700 text-white/60">FADO GROUP</span></p>
        <div className="h-20 sm:hidden" />
      </div>
      {p.kind !== 'company' && (
        <MobileActionBar name={p.name} email={p.email} phone={p.phone} position={p.job_title} company={p.company_name} department={p.dept_name}
          accent={t.accent} grad={t.grad} surface={t.surface} text={t.text} border={t.cardBorder} />
      )}
    </div>
  );
}

/** Điểm vào: chọn template theo p.template. */
export default function ProfileTemplate({ profile }: { profile: PublicProfile }) {
  const acc = THEME_ACCENTS[profile.theme || 'indigo'] || THEME_ACCENTS.indigo;
  const template = profile.template || 'aurora';

  if (template === 'executive') {
    const t: Tok = { accent: acc.solid, grad: acc.grad, text: '#f1f5f9', muted: '#94a3b8', cardBg: 'rgba(255,255,255,0.05)', cardBorder: 'rgba(255,255,255,0.10)', chipBg: 'rgba(255,255,255,0.08)', serif: true, surface: '#0f1420' };
    return <StackedTemplate p={profile} t={t} variant="executive" pageBg="#0b0f1a" />;
  }
  if (template === 'editorial') {
    const t: Tok = { accent: acc.solid, grad: acc.grad, text: '#111827', muted: '#6b7280', cardBg: '#ffffff', cardBorder: '#e5e7eb', chipBg: '#f3f4f6', surface: '#ffffff' };
    return <StackedTemplate p={profile} t={t} variant="editorial" pageBg="#ffffff" />;
  }
  if (template === 'bento') {
    const t: Tok = { accent: acc.solid, grad: acc.grad, text: '#e2e8f0', muted: '#94a3b8', cardBg: 'rgba(255,255,255,0.05)', cardBorder: 'rgba(255,255,255,0.10)', chipBg: 'rgba(255,255,255,0.08)', surface: '#0b0f1a' };
    return <BentoTemplate p={profile} t={t} />;
  }
  // aurora (mặc định)
  const t: Tok = { accent: acc.solid, grad: acc.grad, text: '#0f172a', muted: '#64748b', cardBg: '#ffffff', cardBorder: '#eef0f4', chipBg: '#f1f5f9', surface: '#ffffff' };
  return <StackedTemplate p={profile} t={t} variant="aurora" pageBg="linear-gradient(180deg,#f8fafc,#eef2ff)" />;
}
