import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Loader2, Minus, Plus, Search, Send, Square, Play as PlayIcon } from 'lucide-react';
import * as Tone from 'tone';
import { useLive, onLiveNote, liveVoice } from '../audio/live';
import { useLoading, ensureAudio } from '../audio/engine';
import { groupedInstruments, isKitId, displayName } from '../lib/instruments';
import { useStudio, uid, addChannel, newPattern, setChannelNotes, freeLane, ensureLanes } from '../studio/store';
import type { Note, PatternItem } from '../studio/types';

export function InstrumentBrowser({ value, onPick, inSheet = false }: { value: string; onPick: (id: string) => void; inSheet?: boolean }) {
  const [q, setQ] = useState('');
  const pending = useLoading((s) => s.pending);
  const groups = useMemo(() => groupedInstruments(), []);
  const filtered = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())) }))
    .filter((g) => g.items.length);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: inSheet ? 'center' : 'nearest' });
  }, []);

  return (
    <aside className={`browser ${inSheet ? 'in-sheet' : ''}`}>
      <div className="browser-search">
        <Search size={14} />
        <input
          className="input"
          placeholder="Search 112 instruments"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="Search instruments"
        />
      </div>
      <div className="browser-list">
        {filtered.map((g) => (
          <section key={g.family}>
            <h4 className="eyebrow">{g.label}</h4>
            {g.items.map((i) => (
              <button
                key={i.id}
                ref={i.id === value ? activeRef : undefined}
                className={`browser-item ${i.id === value ? 'on' : ''}`}
                onClick={() => onPick(i.id)}
              >
                <span>{i.name}</span>
                {pending[i.id] ? <Loader2 size={13} className="spin faint" /> : null}
              </button>
            ))}
          </section>
        ))}
        {!filtered.length && <div className="empty">No instrument matches “{q}”.</div>}
      </div>
    </aside>
  );
}

export function Stepper({ label, value, min, max, onChange, format }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="stepper">
      <span className="field-label">{label}</span>
      <div className="stepper-box">
        <button className="btn sm icon ghost" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label} down`}>
          <Minus />
        </button>
        <span className="mono">{format ? format(value) : value}</span>
        <button className="btn sm icon ghost" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`${label} up`}>
          <Plus />
        </button>
      </div>
    </div>
  );
}

/** Quick take recorder: capture what you play here and drop it into the studio as a new track. */
export function TakeRecorder({ onSent }: { onSent: () => void }) {
  const instrumentId = useLive((s) => s.instrumentId);
  const [rec, setRec] = useState(false);
  const [notes, setNotes] = useState<{ pitch: number; t: number; dur: number; vel: number }[]>([]);
  const t0 = useRef(0);
  const pending = useRef(new Map<number, { t: number; vel: number }>());
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!rec) return;
    return onLiveNote((e) => {
      const t = performance.now() / 1000 - t0.current;
      if (e.type === 'on') pending.current.set(e.midi, { t, vel: e.vel });
      else {
        const p = pending.current.get(e.midi);
        if (!p) return;
        pending.current.delete(e.midi);
        setNotes((ns) => [...ns, { pitch: e.midi, t: p.t, dur: Math.max(0.05, t - p.t), vel: p.vel }]);
      }
    });
  }, [rec]);

  const start = () => {
    setNotes([]);
    pending.current.clear();
    t0.current = performance.now() / 1000;
    setRec(true);
  };
  const stopRec = () => setRec(false);

  const playBack = async () => {
    await ensureAudio();
    if (!notes.length) return;
    const first = notes[0].t;
    const now = Tone.now() + 0.05;
    notes.forEach((n) => liveVoice.play(n.pitch, n.dur, now + n.t - first, n.vel));
    setPlaying(true);
    const len = Math.max(...notes.map((n) => n.t + n.dur)) - first;
    setTimeout(() => setPlaying(false), len * 1000 + 300);
  };

  const send = () => {
    const st = useStudio.getState();
    const bpm = st.project.bpm;
    const first = notes[0]?.t ?? 0;
    const conv: Note[] = notes.map((n) => ({
      id: uid(),
      pitch: n.pitch,
      start: Math.round(((n.t - first) * bpm) / 60 / 0.0625) * 0.0625,
      dur: Math.max(0.0625, (n.dur * bpm) / 60),
      vel: n.vel,
    }));
    const bpb = st.project.beatsPerBar;
    const len = Math.max(bpb, Math.ceil(Math.max(...conv.map((n) => n.start + n.dur)) / bpb) * bpb);
    let channelId = '';
    let itemId = '';
    st.edit((p) => {
      // new channel + a pattern holding the take, placed on the first free playlist track
      const [withCh, ch] = addChannel(p, isKitId(instrumentId) ? 'drums' : 'instrument', instrumentId, `${displayName(instrumentId)} take`);
      const [withPat, pat] = newPattern(withCh, `${displayName(instrumentId)} take`, len);
      const filled = setChannelNotes(withPat, pat.id, ch.id, () => conv);
      const start = Math.floor(st.cursor / bpb) * bpb;
      const lane = freeLane(filled, start, start + len);
      const item: PatternItem = { id: uid(), kind: 'pattern', patternId: pat.id, lane, start, length: len };
      channelId = ch.id;
      itemId = item.id;
      return ensureLanes({ ...filled, playlist: [...filled.playlist, item], mode: 'song' }, lane);
    });
    st.setUi({ selectedTrackId: channelId, selectedItemId: itemId, dock: 'roll', dockOpen: true });
    setNotes([]);
    onSent();
  };

  return (
    <div className="take">
      <span className="field-label">Take</span>
      <div className="row">
        {!rec ? (
          <button className="btn rec" onClick={start} title="Record what you play">
            <Circle fill="currentColor" /> Rec
          </button>
        ) : (
          <button className="btn rec on" onClick={stopRec}>
            <Square /> Stop
          </button>
        )}
        <button className="btn" disabled={!notes.length || rec || playing} onClick={playBack}>
          <PlayIcon /> Play
        </button>
        <button className="btn" disabled={!notes.length || rec} onClick={send} title="Add as a new track in the studio">
          <Send /> To studio
        </button>
        <span className="mono faint take-count">{notes.length ? `${notes.length} notes` : rec ? 'listening…' : ''}</span>
      </div>
    </div>
  );
}
