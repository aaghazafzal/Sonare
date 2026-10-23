import { LogoMark } from './Logo';
import { InstallButton } from './ui';

export const CONTACT_URL = 'https://github.com/aaghazafzal/Sonare/issues';

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
      { label: 'Report a problem', href: CONTACT_URL, external: true },
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
        <span>© {new Date().getFullYear()} Sonare</span>
        <span>Your projects and recordings stay in this browser.</span>
      </div>
    </footer>
  );
}
