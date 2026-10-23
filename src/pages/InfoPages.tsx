import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { SiteFooter, CONTACT_URL, UNIVORA_URL } from '../components/SiteFooter';
import { LogoMark } from '../components/Logo';
import { Keyboard } from '../components/instruments/Keyboard';
import { noteOff, noteOn, useLive } from '../audio/live';
import { useSettings } from '../theme/settings';

const UPDATED = '23 October 2026';

/* ------------------------------------------------------------ doc page */

type Section = { id: string; title: string; body: ReactNode };

/** A long-form page: title, a plain-language summary, a contents list that follows the scroll, and the sections. */
function DocPage({ title, summary, sections }: { title: string; summary: ReactNode; sections: Section[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(sections[0].id);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.scrollTop = 0;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setCurrent(top.target.id);
      },
      { root: el, rootMargin: '0px 0px -65% 0px' },
    );
    el.querySelectorAll('.doc-section').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [sections]);

  const jump = (id: string) => {
    root.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="home doc-page" ref={root}>
      <header className="doc-head">
        <a className="doc-back" href="#/home">
          <ArrowLeft size={15} /> Home
        </a>
        <h1>{title}</h1>
        <p className="doc-updated">Last updated {UPDATED}</p>
        <div className="doc-summary">{summary}</div>
      </header>
      <div className="doc-body">
        <nav className="doc-toc" aria-label="On this page">
          <span className="doc-toc-title">On this page</span>
          {sections.map((s) => (
            <button key={s.id} className={current === s.id ? 'on' : ''} onClick={() => jump(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
        <article className="doc-text">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="doc-section">
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </article>
      </div>
      <SiteFooter />
    </div>
  );
}

const Contact = ({ children = 'contact Univora support' }: { children?: ReactNode }) => (
  <a href={CONTACT_URL} target="_blank" rel="noreferrer">
    {children}
  </a>
);

/* -------------------------------------------------------------- privacy */

export function PrivacyPage() {
  return (
    <DocPage
      title="Privacy policy"
      summary={
        <>
          <p>
            <b>In short:</b> Sonare has no accounts, no ads and no tracking. Everything you make is saved in your own browser and never
            uploaded to us.
          </p>
        </>
      }
      sections={[
        {
          id: 'who',
          title: 'Who we are',
          body: (
            <p>
              Sonare is made and run by{' '}
              <a href={UNIVORA_URL} target="_blank" rel="noreferrer">
                Univora
              </a>
              . In this policy, “we” and “us” mean Univora.
            </p>
          ),
        },
        {
          id: 'what',
          title: 'What we collect',
          body: (
            <>
              <p>Nothing that identifies you. Sonare has no sign-up, no login and no contact forms, and it doesn’t ask for your name or email.</p>
              <p>
                There are no analytics scripts, advertising networks, social-media plugins or tracking pixels on the site, and the fonts are
                served from Sonare itself rather than from a font service.
              </p>
            </>
          ),
        },
        {
          id: 'device',
          title: 'What stays on your device',
          body: (
            <>
              <p>To remember your work between visits, Sonare stores these things in your browser’s own storage (local storage and IndexedDB):</p>
              <ul>
                <li>your settings — theme, colours, fonts, keyboard layout and instrument designs;</li>
                <li>your studio projects, including patterns, mixer settings and automation;</li>
                <li>audio you record or import into a project;</li>
                <li>your song-lesson scores and the instruments you used most recently.</li>
              </ul>
              <p>
                This data never leaves your device unless you choose to export it — for example by saving a session file or exporting a WAV,
                MP3 or MIDI file, which goes straight to your downloads folder.
              </p>
            </>
          ),
        },
        {
          id: 'mic',
          title: 'Microphone and MIDI',
          body: (
            <>
              <p>
                The browser asks for microphone access only when you press record in the studio. The sound is recorded in your browser and saved
                with your project; it is not streamed or sent anywhere.
              </p>
              <p>
                MIDI keyboards are only connected when you click <i>Connect</i>. Sonare reads the notes you play and nothing else.
              </p>
            </>
          ),
        },
        {
          id: 'offline',
          title: 'Offline use and caching',
          body: (
            <p>
              Sonare installs a service worker so it can open without a connection. It keeps a copy of the app and of each instrument sample
              you have played. These are ordinary program files, not personal data.
            </p>
          ),
        },
        {
          id: 'hosting',
          title: 'Hosting',
          body: (
            <p>
              The site is hosted on Vercel. Like any web server, Vercel processes the technical details needed to deliver the pages to you
              (such as your IP address and browser type) and may keep short-lived logs for security and reliability. Sonare doesn’t use those
              logs to identify or profile anyone. See Vercel’s own privacy policy for how they handle them.
            </p>
          ),
        },
        {
          id: 'delete',
          title: 'Deleting your data',
          body: (
            <>
              <p>Because everything is stored in your browser, you are in full control of it:</p>
              <ul>
                <li>delete a single project from <i>My projects</i> in the studio’s File menu;</li>
                <li>
                  reset your settings in <a href="#/settings?backup">Settings → Backup</a>;
                </li>
                <li>remove everything by clearing this site’s data in your browser settings, or by uninstalling the app.</li>
              </ul>
              <p>Clearing site data can’t be undone, so export any projects you want to keep first.</p>
            </>
          ),
        },
        {
          id: 'children',
          title: 'Children',
          body: <p>Sonare is suitable for all ages and collects no personal information from anyone, including children.</p>,
        },
        {
          id: 'changes',
          title: 'Changes and contact',
          body: (
            <p>
              If this policy changes, the new version will be posted here with a new date at the top. Questions or concerns? <Contact />.
              Anything you send to support is handled by Univora under the policies shown on univora.site.
            </p>
          ),
        },
      ]}
    />
  );
}

/* ---------------------------------------------------------------- terms */

export function TermsPage() {
  return (
    <DocPage
      title="Terms of use"
      summary={
        <p>
          <b>In short:</b> Sonare is free to use. The music you make is yours. Please use it fairly, and understand that it’s provided as is.
        </p>
      }
      sections={[
        {
          id: 'use',
          title: 'Using Sonare',
          body: (
            <>
              <p>
                Sonare is provided by{' '}
                <a href={UNIVORA_URL} target="_blank" rel="noreferrer">
                  Univora
                </a>{' '}
                (“we”, “us”). By using Sonare you agree to these terms. You can play, practise, compose and record with it for free, for
                personal or professional work, without creating an account.
              </p>
              <p>Sonare runs entirely in your browser. A recent version of Chrome, Edge, Firefox or Safari gives the best results.</p>
            </>
          ),
        },
        {
          id: 'yours',
          title: 'Your music',
          body: (
            <p>
              Everything you compose, arrange and record — your patterns, melodies, vocals and exported files — belongs to you. Sonare claims
              no rights over it and never sees it.
            </p>
          ),
        },
        {
          id: 'sounds',
          title: 'Instrument sounds',
          body: (
            <>
              <p>
                The instrument samples are provided so you can play and produce music inside Sonare, and they may be heard in the songs you
                export. They remain the work of their original authors and are not licensed for redistribution on their own.
              </p>
              <p>Please don’t extract, repackage or sell the sample files as a sound library.</p>
              <p>
                Planning a commercial release? You can <Contact>ask about the sound sources</Contact> first.
              </p>
            </>
          ),
        },
        {
          id: 'fair',
          title: 'Fair use of the service',
          body: (
            <>
              <p>Please don’t:</p>
              <ul>
                <li>try to disrupt, overload or break into the site or the servers it runs on;</li>
                <li>download the sample library in bulk with scripts or bots;</li>
                <li>copy Sonare’s code or design, or present Sonare or a copy of it as your own product.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'data',
          title: 'Keeping your work safe',
          body: (
            <p>
              Projects are saved in your browser. Clearing site data, using private browsing or changing device can lose them, so save a
              session file from the File menu for anything you want to keep. How data is handled is described in the{' '}
              <a href="#/privacy">privacy policy</a>.
            </p>
          ),
        },
        {
          id: 'warranty',
          title: 'No warranty',
          body: (
            <>
              <p>
                Sonare is provided “as is” and “as available”, without warranties of any kind. We do our best to keep it working, but we can’t
                promise it will always be available, error-free or suitable for a particular purpose.
              </p>
              <p>
                To the extent the law allows, Univora isn’t liable for any loss — including lost projects or recordings — that
                comes from using it.
              </p>
            </>
          ),
        },
        {
          id: 'changes',
          title: 'Changes and contact',
          body: (
            <p>
              These terms may be updated as Sonare grows; the date at the top shows the latest version, and continuing to use the site means
              you accept it. Questions? <Contact />.
            </p>
          ),
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------- 404 page */

/** Four notes down to a low one — tapping the keys on this page plays them. */
const LOST = [76, 74, 72, 64];

export function NotFoundPage() {
  const active = useLive((s) => s.active);
  const skin = useSettings((s) => s.skins.keyboard);
  const path = location.pathname !== '/' ? location.pathname : location.hash.replace(/^#/, '');
  return (
    <div className="home nf-page">
      <section className="nf">
        <LogoMark size={44} />
        <p className="nf-code">404</p>
        <h1>This page hit a wrong note</h1>
        <p className="nf-text">
          There’s nothing at <code>{path || '/'}</code>. It may have moved, or the link may be mistyped.
        </p>
        <div className="nf-actions">
          <a className="btn primary lg" href="/#/home">
            Go to the home page <ArrowRight />
          </a>
          <a className="btn lg" href="/#/play">
            Play an instrument
          </a>
        </div>
        <div className="nf-keys" title="These keys play">
          <Keyboard
            low={60}
            high={79}
            active={active}
            onDown={(m, v) => noteOn(m, v)}
            onUp={(m) => noteOff(m)}
            skin={skin}
            showCase={false}
            className="kb-flat"
            height={110}
            marked={Object.fromEntries(LOST.map((m) => [m, true]))}
          />
        </div>
        <p className="nf-hint">While you’re here — the marked keys play a little falling tune.</p>
      </section>
      <SiteFooter />
    </div>
  );
}
