import { LogoMark } from './Logo';
import { InstallButton } from './ui';

/** Sonare is a Univora product; questions, bug reports and requests go to Univora's support page. */
export const UNIVORA_URL = 'https://www.univora.site';
export const CONTACT_URL = `${UNIVORA_URL}/support`;

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Make music',
    links: [
      { label: 'Play an instrument', href: '#/play' },
      { label: 'Learn a song', href: '#/play?songs' },
      { label: 'Open the studio', href: '#/studio' },
    ],
  },
  {
    title: 'Make it yours',
    links: [
      { label: 'Themes and colours', href: '#/settings?appearance' },
      { label: 'Instrument designs', href: '#/settings?skins' },
      { label: 'MIDI and recording', href: '#/settings?audio' },
    ],
  },
  {
    title: 'About',
    links: [
      { label: 'Privacy', href: '#/privacy' },
      { label: 'Terms of use', href: '#/terms' },
      { label: 'Help and support', href: CONTACT_URL, external: true },
      { label: 'Univora', href: UNIVORA_URL, external: true },
    ],
  },
];

/** The footer shared by the home, privacy, terms and not-found pages. */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-foot-top">
        <div className="site-foot-brand">
          <a className="logo" href="#/home" aria-label="Sonare home">
            <LogoMark size={30} />
            <span>Sonare</span>
          </a>
          <p>Instruments, song lessons and a music studio that run in your browser. Free, with nothing to sign up for.</p>
          <p className="site-foot-by">
            A product of{' '}
            <a href={UNIVORA_URL} target="_blank" rel="noreferrer">
              Univora
            </a>
          </p>
          <InstallButton className="btn" />
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} className="site-foot-col" aria-label={c.title}>
            <h2>{c.title}</h2>
            {c.links.map((l) => (
              <a key={l.label} href={l.href} {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                {l.label}
              </a>
            ))}
          </nav>
        ))}
      </div>
      <div className="site-foot-bottom">
        <span>© {new Date().getFullYear()} Univora. Sonare is part of the Univora platform.</span>
        <span>Your projects and recordings stay in this browser.</span>
      </div>
    </footer>
  );
}
