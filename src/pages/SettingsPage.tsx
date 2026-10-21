import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Download, RotateCcw, Upload, Usb } from 'lucide-react';
import { useSettings, exportSettings, contrastRatio, type Texture, type LabelMode } from '../theme/settings';
import {
  COLOR_FIELDS,
  THEME_PRESETS,
  UI_FONTS,
  MONO_FONTS,
  KEYBOARD_SKINS,
  GUITAR_SKINS,
  DRUM_SKINS,
  WIND_SKINS,
  MALLET_SKINS,
  type ThemeColors,
  type SkinSet,
} from '../theme/presets';
import { ColorField, Range, Segmented, Toggle, Knob } from '../components/ui';
import { Keyboard } from '../components/instruments/Keyboard';
import { Fretboard } from '../components/instruments/Fretboard';
import { DrumKit } from '../components/instruments/DrumKit';
import { Flute } from '../components/instruments/Wind';
import { Mallets } from '../components/instruments/Mallets';
import { download } from '../studio/buffers';
import { enableMidi, useMidi, drumKeyLabels } from '../audio/input';
import { useLive, noteOn, noteOff, strike, liveStrip } from '../audio/live';
import { Voice, ensureAudio } from '../audio/engine';
import { displayName } from '../lib/instruments';
import { scaleNotes } from '../lib/notes';

type Tab = 'appearance' | 'type' | 'skins' | 'audio' | 'backup';

function Section({ title, desc, children, aside }: { title: string; desc?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="set-section">
      <div className="set-section-head">
        <div>
          <h2>{title}</h2>
          {desc && <p className="muted">{desc}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-label">
        <span>{label}</span>
        {hint && <small className="faint">{hint}</small>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}

function PresetCard({ colors, name, note, on, onClick }: { colors: ThemeColors; name: string; note: string; on: boolean; onClick: () => void }) {
  return (
    <button className={`preset ${on ? 'on' : ''}`} onClick={onClick}>
      <div className="preset-swatch" style={{ background: colors.bg, borderColor: colors.border }}>
        <div className="ps-panel" style={{ background: colors.panel, borderColor: colors.border }}>
          <i style={{ background: colors.text, width: '58%' }} />
          <i style={{ background: colors.textMuted, width: '38%' }} />
          <div className="ps-chips">
            <b style={{ background: colors.primary }} />
            <b style={{ background: colors.secondary }} />
            <b style={{ background: colors.panelAlt, border: `1px solid ${colors.border}` }} />
          </div>
        </div>
      </div>
      <div className="preset-meta">
        <span>{name}</span>
        <small className="faint">{note}</small>
      </div>
      {on && <Check className="preset-check" size={14} />}
    </button>
  );
}

function ContrastBadge({ a, b, label }: { a: string; b: string; label: string }) {
  const r = contrastRatio(a, b);
  const ok = r >= 4.5;
  return (
    <span className={`contrast ${ok ? 'ok' : 'bad'}`} title={`${label}: ${r.toFixed(2)}:1 (4.5 recommended)`}>
      {ok ? <Check size={12} /> : <AlertTriangle size={12} />} {label} {r.toFixed(1)}:1
    </span>
  );
}

function Appearance() {
  const st = useSettings();
  const groups = useMemo(() => {
    const g: Record<string, typeof COLOR_FIELDS> = {};
    COLOR_FIELDS.forEach((f) => (g[f.group] ??= []).push(f));
    return g;
  }, []);
  return (
    <>
      <Section title="Theme" desc="Start from a preset, then fine-tune any colour below. Edits switch you to a custom theme.">
        <div className="presets">
          {THEME_PRESETS.map((p) => (
            <PresetCard key={p.id} colors={p.colors} name={p.name} note={p.note} on={st.presetId === p.id} onClick={() => st.applyPreset(p.id)} />
          ))}
          {st.presetId === 'custom' && <PresetCard colors={st.colors} name="Custom" note="Your edits" on onClick={() => undefined} />}
        </div>
      </Section>

      <Section
        title="Colours"
        desc="Every surface, text and accent colour used across the site."
        aside={
          <div className="row wrap">
            <ContrastBadge a={st.colors.text} b={st.colors.bg} label="Text" />
            <ContrastBadge a={st.colors.textMuted} b={st.colors.panel} label="Muted" />
            <ContrastBadge a={st.colors.onPrimary} b={st.colors.primary} label="On primary" />
          </div>
        }
      >
        <div className="color-groups">
          {Object.entries(groups).map(([g, fields]) => (
            <div key={g} className="color-group">
              <h4 className="eyebrow">{g}</h4>
              {fields.map((f) => (
                <ColorField key={f.key} label={f.label} hint={f.hint} value={st.colors[f.key]} onChange={(v) => st.setColor(f.key, v)} />
              ))}
            </div>
          ))}
          <div className="color-group preview-group">
            <h4 className="eyebrow">Preview</h4>
            <div className="ui-preview panel">
              <div className="row">
                <b>Session 04</b>
                <span className="tag">92 BPM</span>
                <div className="spacer" />
                <span className="mono muted">003.2.1</span>
              </div>
              <p className="muted">Muted text sits on panels. Faint text is used for hints.</p>
              <div className="row wrap">
                <button className="btn primary">Primary</button>
                <button className="btn on">Selected</button>
                <button className="btn">Default</button>
                <button className="btn rec on">Rec</button>
              </div>
              <div className="row">
                <Toggle on onChange={() => undefined} label="Example toggle" />
                <div className="grow">
                  <Range value={0.62} min={0} max={1} onChange={() => undefined} ariaLabel="Example slider" />
                </div>
              </div>
              <div className="ui-preview-well">
                <i style={{ left: '8%', width: '22%', background: 'var(--primary)' }} />
                <i style={{ left: '36%', width: '30%', background: 'var(--secondary)' }} />
                <i style={{ left: '72%', width: '16%', background: 'var(--highlight)' }} />
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Background">
        <SettingRow label="Texture" hint="A subtle surface behind panels">
          <Segmented<Texture>
            value={st.texture}
            onChange={(v) => st.update({ texture: v })}
            options={[
              { value: 'none', label: 'Flat' },
              { value: 'grain', label: 'Grain' },
              { value: 'weave', label: 'Weave' },
              { value: 'lines', label: 'Lines' },
            ]}
          />
        </SettingRow>
      </Section>
    </>
  );
}

function Typography() {
  const st = useSettings();
  return (
    <>
      <Section title="Interface font">
        <div className="font-grid">
          {UI_FONTS.map((f) => (
            <button key={f.id} className={`font-card ${st.uiFont === f.id ? 'on' : ''}`} onClick={() => st.update({ uiFont: f.id })} style={{ fontFamily: f.stack }}>
              <span className="font-sample">Aa</span>
              <span className="font-name">{f.label}</span>
              <span className="font-line">Grand piano · 92 BPM · Mix</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Numbers & code font" desc="Used for tempo, time, meters and values.">
        <div className="font-grid">
          {MONO_FONTS.map((f) => (
            <button key={f.id} className={`font-card ${st.monoFont === f.id ? 'on' : ''}`} onClick={() => st.update({ monoFont: f.id })} style={{ fontFamily: f.stack }}>
              <span className="font-sample">012</span>
              <span className="font-name">{f.label}</span>
              <span className="font-line">003.2.1 · −6.0 dB</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Layout">
        <SettingRow label="Interface scale" hint={`${Math.round(st.scale * 100)}%`}>
          <Range value={st.scale} min={0.85} max={1.25} step={0.01} onChange={(v) => st.update({ scale: v })} />
        </SettingRow>
        <SettingRow label="Corner radius" hint={`${st.radius}px`}>
          <Range value={st.radius} min={0} max={14} step={1} onChange={(v) => st.update({ radius: v })} />
        </SettingRow>
        <SettingRow label="Heading weight" hint={String(st.headingWeight)}>
          <Range value={st.headingWeight} min={400} max={800} step={50} onChange={(v) => st.update({ headingWeight: v })} />
        </SettingRow>
        <SettingRow label="Density">
          <Segmented
            value={st.density}
            onChange={(v) => st.update({ density: v })}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'regular', label: 'Regular' },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Reduce motion" hint="Turns off transitions and animations">
          <Toggle on={st.reduceMotion} onChange={(v) => st.update({ reduceMotion: v })} />
        </SettingRow>
      </Section>
    </>
  );
}

type SkinTab = keyof SkinSet;

let kitPreview: Voice | null = null;
function hitPreviewKit(midi: number) {
  void ensureAudio();
  kitPreview ??= new Voice(liveStrip.input, 'kit:standard-kit');
  kitPreview.noteOn(midi, 0.85);
}

function SkinPresets<T>({ list, current, onPick, swatch }: { list: { id: string; name: string; skin: T }[]; current: T; onPick: (s: T) => void; swatch: (s: T) => string[] }) {
  return (
    <div className="skin-presets">
      {list.map((p) => {
        const on = JSON.stringify(p.skin) === JSON.stringify(current);
        return (
          <button key={p.id} className={`skin-preset ${on ? 'on' : ''}`} onClick={() => onPick(p.skin)}>
            <span className="skin-dots">
              {swatch(p.skin).map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

function Skins() {
  const st = useSettings();
  const active = useLive((s) => s.active);
  const instrumentId = useLive((s) => s.instrumentId);
  const [tab, setTab] = useState<SkinTab>('keyboard');
  const [hit, setHit] = useState<Record<number, true>>({});
  const sk = st.skins;
  const dl = useMemo(() => drumKeyLabels(), []);

  return (
    <>
      <Segmented<SkinTab>
        value={tab}
        onChange={setTab}
        className="skin-tabs"
        options={[
          { value: 'keyboard', label: 'Keyboard' },
          { value: 'guitar', label: 'Guitar & strings' },
          { value: 'drums', label: 'Drums' },
          { value: 'wind', label: 'Flute & wind' },
          { value: 'mallets', label: 'Mallets' },
        ]}
      />

      {tab === 'keyboard' && (
        <Section title="Keyboard design" desc="Case, keys and pressed colour. The preview is playable.">
          <SkinPresets list={KEYBOARD_SKINS} current={sk.keyboard} onPick={(s) => st.setSkin('keyboard', s)} swatch={(s) => [s.caseColor, s.whiteKey, s.blackKey, s.pressed]} />
          <div className="skin-preview">
            <Keyboard low={48} high={72} active={active} onDown={(m, v) => noteOn(m, v)} onUp={noteOff} skin={sk.keyboard} labels={st.keyboardLabels} height={190} />
          </div>
          <div className="skin-fields">
            <ColorField label="Case" value={sk.keyboard.caseColor} onChange={(v) => st.setSkin('keyboard', { caseColor: v })} />
            <ColorField label="White keys" value={sk.keyboard.whiteKey} onChange={(v) => st.setSkin('keyboard', { whiteKey: v })} />
            <ColorField label="Black keys" value={sk.keyboard.blackKey} onChange={(v) => st.setSkin('keyboard', { blackKey: v })} />
            <ColorField label="Pressed" value={sk.keyboard.pressed} onChange={(v) => st.setSkin('keyboard', { pressed: v })} />
            <ColorField label="Labels" value={sk.keyboard.label} onChange={(v) => st.setSkin('keyboard', { label: v })} />
            <ColorField label="Key felt" value={sk.keyboard.felt} onChange={(v) => st.setSkin('keyboard', { felt: v })} />
          </div>
          <SettingRow label="Case finish">
            <Segmented
              value={sk.keyboard.caseFinish}
              onChange={(v) => st.setSkin('keyboard', { caseFinish: v })}
              options={[
                { value: 'gloss', label: 'Gloss' },
                { value: 'matte', label: 'Matte' },
                { value: 'wood', label: 'Wood' },
                { value: 'metal', label: 'Brushed' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Key depth" hint="How three-dimensional keys look">
            <Range value={sk.keyboard.keyDepth} min={0} max={1} onChange={(v) => st.setSkin('keyboard', { keyDepth: v })} />
          </SettingRow>
          <SettingRow label="Key labels">
            <Segmented<LabelMode>
              value={st.keyboardLabels}
              onChange={(v) => st.update({ keyboardLabels: v })}
              options={[
                { value: 'none', label: 'None' },
                { value: 'c', label: 'Octaves' },
                { value: 'all', label: 'All notes' },
                { value: 'keys', label: 'PC keys' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Overview strip" hint="88-key navigator above the keyboard">
            <Toggle on={st.showMinimap} onChange={(v) => st.update({ showMinimap: v })} />
          </SettingRow>
        </Section>
      )}

      {tab === 'guitar' && (
        <Section title="Guitar, bass & violin neck" desc="Fretboard wood, inlays, frets and strings.">
          <SkinPresets list={GUITAR_SKINS} current={sk.guitar} onPick={(s) => st.setSkin('guitar', s)} swatch={(s) => [s.wood, s.inlayColor, s.string, s.pressed]} />
          <div className="skin-preview">
            <Fretboard
              strings={[40, 45, 50, 55, 59, 64]}
              frets={st.guitarFrets}
              skin={sk.guitar}
              active={{}}
              held={{ '1:3': true, '3:2': true }}
              showLabels={st.guitarLabels}
              leftHanded={st.leftHanded}
              onDown={(s, f) => strike([40, 45, 50, 55, 59, 64][s] + f)}
              onUp={() => undefined}
            />
          </div>
          <div className="skin-fields">
            <ColorField label="Fretboard wood" value={sk.guitar.wood} onChange={(v) => st.setSkin('guitar', { wood: v })} />
            <ColorField label="Inlays" value={sk.guitar.inlayColor} onChange={(v) => st.setSkin('guitar', { inlayColor: v })} />
            <ColorField label="Frets" value={sk.guitar.fret} onChange={(v) => st.setSkin('guitar', { fret: v })} />
            <ColorField label="Strings" value={sk.guitar.string} onChange={(v) => st.setSkin('guitar', { string: v })} />
            <ColorField label="Nut" value={sk.guitar.nut} onChange={(v) => st.setSkin('guitar', { nut: v })} />
            <ColorField label="Binding" value={sk.guitar.binding} onChange={(v) => st.setSkin('guitar', { binding: v })} />
            <ColorField label="Finger dots" value={sk.guitar.pressed} onChange={(v) => st.setSkin('guitar', { pressed: v })} />
          </div>
          <SettingRow label="Inlay style">
            <Segmented
              value={sk.guitar.inlay}
              onChange={(v) => st.setSkin('guitar', { inlay: v })}
              options={[
                { value: 'dots', label: 'Dots' },
                { value: 'blocks', label: 'Blocks' },
                { value: 'none', label: 'None' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Wood grain">
            <Range value={sk.guitar.grain} min={0} max={1} onChange={(v) => st.setSkin('guitar', { grain: v })} />
          </SettingRow>
          <SettingRow label="Frets shown" hint={String(st.guitarFrets)}>
            <Range value={st.guitarFrets} min={12} max={22} step={1} onChange={(v) => st.update({ guitarFrets: v })} />
          </SettingRow>
          <SettingRow label="Note names on the neck">
            <Toggle on={st.guitarLabels} onChange={(v) => st.update({ guitarLabels: v })} />
          </SettingRow>
          <SettingRow label="Left-handed">
            <Toggle on={st.leftHanded} onChange={(v) => st.update({ leftHanded: v })} />
          </SettingRow>
        </Section>
      )}

      {tab === 'drums' && (
        <Section title="Drum kit" desc="Shell finish, heads, hardware and cymbals. The preview kit is playable.">
          <SkinPresets list={DRUM_SKINS} current={sk.drums} onPick={(s) => st.setSkin('drums', s)} swatch={(s) => [s.shell, s.head, s.cymbal, s.hardware]} />
          <div className="skin-preview dk-wrap">
            <DrumKit
              skin={sk.drums}
              active={hit}
              onDown={(m) => {
                hitPreviewKit(m);
                setHit({ [m]: true });
              }}
              onUp={() => setHit({})}
              keyLabels={dl}
            />
          </div>
          <div className="skin-fields">
            <ColorField label="Shell" value={sk.drums.shell} onChange={(v) => st.setSkin('drums', { shell: v })} />
            <ColorField label="Heads" value={sk.drums.head} onChange={(v) => st.setSkin('drums', { head: v })} />
            <ColorField label="Hardware" value={sk.drums.hardware} onChange={(v) => st.setSkin('drums', { hardware: v })} />
            <ColorField label="Cymbals" value={sk.drums.cymbal} onChange={(v) => st.setSkin('drums', { cymbal: v })} />
            <ColorField label="Pads" value={sk.drums.pad} onChange={(v) => st.setSkin('drums', { pad: v })} />
          </div>
          <SettingRow label="Shell finish">
            <Segmented
              value={sk.drums.finish}
              onChange={(v) => st.setSkin('drums', { finish: v })}
              options={[
                { value: 'gloss', label: 'Gloss' },
                { value: 'sparkle', label: 'Sparkle' },
                { value: 'wood', label: 'Wood' },
                { value: 'matte', label: 'Matte' },
              ]}
            />
          </SettingRow>
        </Section>
      )}

      {tab === 'wind' && (
        <Section title="Flute & wind" desc="Body material and key colour for flutes, recorders, saxes and pan flutes.">
          <SkinPresets list={WIND_SKINS} current={sk.wind} onPick={(s) => st.setSkin('wind', s)} swatch={(s) => [s.body, s.keys, s.pressed]} />
          <div className="skin-preview">
            <Flute notes={scaleNotes(2, 'major', 60, 8)} root={62} skin={sk.wind} active={active} onDown={(m) => noteOn(m)} onUp={noteOff} />
          </div>
          <div className="skin-fields">
            <ColorField label="Body" value={sk.wind.body} onChange={(v) => st.setSkin('wind', { body: v })} />
            <ColorField label="Keys & plate" value={sk.wind.keys} onChange={(v) => st.setSkin('wind', { keys: v })} />
            <ColorField label="Covered holes" value={sk.wind.pressed} onChange={(v) => st.setSkin('wind', { pressed: v })} />
          </div>
          <SettingRow label="Material">
            <Segmented
              value={sk.wind.finish}
              onChange={(v) => st.setSkin('wind', { finish: v })}
              options={[
                { value: 'metal', label: 'Metal' },
                { value: 'wood', label: 'Wood' },
              ]}
            />
          </SettingRow>
        </Section>
      )}

      {tab === 'mallets' && (
        <Section title="Mallets" desc="Marimba, xylophone, vibraphone and bells.">
          <SkinPresets list={MALLET_SKINS} current={sk.mallets} onPick={(s) => st.setSkin('mallets', s)} swatch={(s) => [s.bar, s.frame, s.resonator, s.pressed]} />
          <div className="skin-preview ml-wrap">
            <Mallets low={60} high={84} skin={sk.mallets} active={active} onDown={(m) => noteOn(m)} onUp={noteOff} showNames />
          </div>
          <div className="skin-fields">
            <ColorField label="Bars" value={sk.mallets.bar} onChange={(v) => st.setSkin('mallets', { bar: v })} />
            <ColorField label="Frame" value={sk.mallets.frame} onChange={(v) => st.setSkin('mallets', { frame: v })} />
            <ColorField label="Resonators" value={sk.mallets.resonator} onChange={(v) => st.setSkin('mallets', { resonator: v })} />
            <ColorField label="Struck bar" value={sk.mallets.pressed} onChange={(v) => st.setSkin('mallets', { pressed: v })} />
          </div>
          <SettingRow label="Bar material">
            <Segmented
              value={sk.mallets.finish}
              onChange={(v) => st.setSkin('mallets', { finish: v })}
              options={[
                { value: 'wood', label: 'Wood' },
                { value: 'metal', label: 'Metal' },
              ]}
            />
          </SettingRow>
        </Section>
      )}
      {tab !== 'drums' && <p className="faint set-note">Previews play the instrument selected on the Play page: {displayName(instrumentId)}.</p>}
    </>
  );
}

function AudioSettings() {
  const st = useSettings();
  const midi = useMidi();
  return (
    <>
      <Section title="MIDI">
        <SettingRow label="MIDI keyboard" hint="Notes, velocity and the sustain pedal (CC64) are supported">
          {midi.enabled ? (
            <span className="row muted">
              <Usb size={14} /> {midi.devices.join(', ') || 'Enabled — plug in a device'}
            </span>
          ) : (
            <button className="btn" disabled={!midi.supported} onClick={() => void enableMidi()}>
              <Usb /> {midi.supported ? 'Connect' : 'Not supported in this browser'}
            </button>
          )}
        </SettingRow>
      </Section>
      <Section title="Computer keyboard">
        <SettingRow label="Key layout" hint="Real = piano-shaped rows, Full = five octaves with Shift, Classic = two tracker rows. Edit Custom from the Big piano settings.">
          <Segmented
            value={st.keymap}
            onChange={(v) => st.update({ keymap: v })}
            options={[
              { value: 'real', label: 'Real' },
              { value: 'full', label: 'Full' },
              { value: 'classic', label: 'Classic' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Play page layout" hint="Big piano = full-width keyboard with key hints; Workspace = instrument list and all controls">
          <Segmented
            value={st.playLayout}
            onChange={(v) => st.update({ playLayout: v })}
            options={[
              { value: 'big', label: 'Big piano' },
              { value: 'workspace', label: 'Workspace' },
            ]}
          />
        </SettingRow>
      </Section>
      <Section title="Recording">
        <SettingRow label="Latency correction" hint="Shift vocal takes earlier (+) or later (−) if they sound out of time">
          <div className="row">
            <Knob value={st.recordOffsetMs} min={-150} max={250} defaultValue={0} onChange={(v) => st.update({ recordOffsetMs: Math.round(v) })} format={(v) => `${Math.round(v)} ms`} />
          </div>
        </SettingRow>
        <SettingRow label="Hear the microphone while recording" hint="Only with headphones, otherwise it will feed back">
          <Toggle on={st.inputMonitoring} onChange={(v) => st.update({ inputMonitoring: v })} />
        </SettingRow>
      </Section>
      <Section title="Shortcuts">
        <table className="shortcuts">
          <tbody>
            {[
              ['Q … P, Z … /', 'White keys (Real layout); the row above plays the black keys'],
              ['1 … M + Shift', 'Five octaves (Full layout); Shift plays the black key'],
              ['← →', 'Octave down / up'],
              ['↑ ↓', 'Velocity up / down'],
              ['Space', 'Sustain (Play page) · Play / pause (Studio)'],
              ['X C F G R I', 'Kick, snare, hi-hat, open hat, crash, ride (drum kits)'],
              ['Ctrl Z / Ctrl Shift Z', 'Undo / redo in the studio'],
              ['Ctrl D', 'Duplicate selected clip or notes'],
              ['Ctrl E', 'Split clip at the cursor'],
              ['Del', 'Delete selected clip or notes'],
              ['Shift-drag', 'Select several notes in the editor'],
              ['Alt-drag', 'Copy a clip on the timeline'],
            ].map(([k, d]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td className="muted">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function Backup() {
  const st = useSettings();
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Section title="Backup & reset" desc="Your theme, fonts and instrument designs are saved in this browser. Export them to move to another device.">
      <div className="row wrap">
        <button className="btn" onClick={() => download(new Blob([exportSettings()], { type: 'application/json' }), 'sonare-theme.json')}>
          <Download /> Export theme
        </button>
        <button className="btn" onClick={() => ref.current?.click()}>
          <Upload /> Import theme
        </button>
        <button
          className="btn"
          onClick={() => {
            if (confirm('Reset every appearance setting to the defaults?')) {
              st.reset();
              setMsg('Settings reset.');
            }
          }}
        >
          <RotateCcw /> Reset to defaults
        </button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      <input
        ref={ref}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setMsg(st.importJson(await f.text()) ? 'Theme imported.' : 'That file is not a Sonare theme.');
        }}
      />
    </Section>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('appearance');
  const nav: { id: Tab; label: string; desc: string }[] = [
    { id: 'appearance', label: 'Theme & colours', desc: 'Presets and every colour' },
    { id: 'type', label: 'Fonts & layout', desc: 'Typeface, scale, radius' },
    { id: 'skins', label: 'Instrument designs', desc: 'Keyboard, guitar, drums…' },
    { id: 'audio', label: 'Audio & input', desc: 'MIDI, recording, keys' },
    { id: 'backup', label: 'Backup', desc: 'Export, import, reset' },
  ];
  return (
    <div className="settings">
      <nav className="set-nav">
        <h1>Settings</h1>
        {nav.map((n) => (
          <button key={n.id} className={`set-nav-item ${tab === n.id ? 'on' : ''}`} onClick={() => setTab(n.id)}>
            <span>{n.label}</span>
            <small>{n.desc}</small>
          </button>
        ))}
      </nav>
      <div className="set-body">
        {tab === 'appearance' && <Appearance />}
        {tab === 'type' && <Typography />}
        {tab === 'skins' && <Skins />}
        {tab === 'audio' && <AudioSettings />}
        {tab === 'backup' && <Backup />}
      </div>
    </div>
  );
}
