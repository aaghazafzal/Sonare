/**
 * The Sonare mark: four white keys and two amber black keys on a rounded tile. The same geometry is drawn
 * into public/favicon.svg and the PNG icons by scripts/make-images.py — change it in all three together.
 * `themed` follows the current theme colours; otherwise the brand colours are fixed.
 */
export const LOGO_COLORS = { tile: '#202125', edge: '#3c3e45', white: '#ebe7df', black: '#e3a043' };

export function LogoMark({ size = 26, themed = true, className }: { size?: number; themed?: boolean; className?: string }) {
  const c = themed
    ? { tile: 'var(--panel-alt)', edge: 'var(--border-strong)', white: 'var(--text)', black: 'var(--primary)' }
    : LOGO_COLORS;
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} className={className} aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="6" fill={c.tile} stroke={c.edge} />
      <g fill={c.white}>
        <rect x="6" y="6" width="3.4" height="16" rx="1" />
        <rect x="10.6" y="6" width="3.4" height="16" rx="1" />
        <rect x="15.2" y="6" width="3.4" height="16" rx="1" />
        <rect x="19.8" y="6" width="3.4" height="16" rx="1" />
      </g>
      <g fill={c.black}>
        <rect x="8.6" y="6" width="2.8" height="9.5" rx="0.8" />
        <rect x="17.8" y="6" width="2.8" height="9.5" rx="0.8" />
      </g>
    </svg>
  );
}

/** Mark plus name, for headers and footers. */
export function Logo({ size = 26, href = '#/home' }: { size?: number; href?: string }) {
  return (
    <a className="logo" href={href} aria-label="Sonare home">
      <LogoMark size={size} />
      <span>Sonare</span>
    </a>
  );
}
