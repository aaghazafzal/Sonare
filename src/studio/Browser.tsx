import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Drum, FileAudio, FolderOpen, LayoutTemplate, Music, Piano, Search, X } from 'lucide-react';
import { useStudio, applyPreset, addChannel, channelKind, freeLane, fromTemplate, TEMPLATE_LIST } from './store';
import { importAudioFile } from './playback';
import { startProject } from './projects';
import { PRESETS, PRESET_CATEGORIES } from './presets';
import { DRAG_MIME, type DragPayload } from './common';
import { groupedInstruments } from '../lib/instruments';

function Folder({ icon, label, open, onToggle, children, count }: { icon: React.ReactNode; label: string; open: boolean; onToggle: () => void; children: React.ReactNode; count?: number }) {
  return (
    <div className={`br-folder ${open ? 'open' : ''}`}>
      <button className="br-folder-head" onClick={onToggle}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {icon}
        <span>{label}</span>
        {count !== undefined && <span className="br-count">{count}</span>}
      </button>
      {open && <div className="br-folder-body">{children}</div>}
    </div>
  );
}

const startDrag = (e: React.DragEvent, payload: DragPayload) => {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
};

/** FL-style browser: templates, ready-made patterns, instruments and audio import. Click or drag. */
export function Browser({ onClose }: { onClose?: () => void }) {
  const s = useStudio();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ templates: false, drums: true, chords: true, bass: false, melody: false, instruments: false, audio: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => groupedInstruments(), []);
  const ql = q.trim().toLowerCase();
  const match = (t: string) => !ql || t.toLowerCase().includes(ql);
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const isOpen = (k: string) => !!ql || !!open[k];

  const addPreset = (id: string) => {
    const pre = PRESETS.find((x) => x.id === id);
    if (!pre) return;
    let res: ReturnType<typeof applyPreset> | null = null;
    s.edit((pr) => {
      const start = Math.floor(s.cursor / pr.beatsPerBar) * pr.beatsPerBar;
      const lane = freeLane(pr, start, start + pre.bars * pr.beatsPerBar);
      res = applyPreset(pr, pre, { channelId: s.selectedTrackId, place: { lane, start } });
      return { ...res.project, mode: 'song' };
    });
    const r = res as ReturnType<typeof applyPreset> | null;
    if (r) s.setUi({ selectedTrackId: r.channel.id, selectedItemId: r.item?.id ?? null });
  };

  const addInstrument = (id: string) => {
    let nid = '';
    s.edit((pr) => {
      const [next, ch] = addChannel(pr, channelKind(id), id);
      nid = ch.id;
      return next;
    });
    s.setUi({ selectedTrackId: nid, dock: 'rack', dockOpen: true });
  };

  return (
    <aside className="br">
      <div className="br-head">
        <span className="pl-title">Browser</span>
        <div className="spacer" />
        {onClose && (
          <button className="btn sm icon ghost" onClick={onClose} aria-label="Close browser">
            <X />
          </button>
        )}
      </div>
      <div className="br-search">
        <Search size={13} />
        <input className="input" placeholder="Search sounds & patterns" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div className="br-tree">
        <Folder icon={<LayoutTemplate size={14} />} label="Templates" open={isOpen('templates')} onToggle={() => toggle('templates')} count={TEMPLATE_LIST.length}>
          {TEMPLATE_LIST.filter((t) => match(t.name)).map((t) => (
            <button
              key={t.id}
              className="br-item"
              onClick={() => {
                void startProject(fromTemplate(t.id));
              }}
              data-hint={`${t.hint} — opens as a new project; the current one stays in My projects`}
            >
              <span>{t.name}</span>
              <small>{t.hint}</small>
            </button>
          ))}
        </Folder>

        {PRESET_CATEGORIES.map((cat) => {
          const items = PRESETS.filter((x) => x.category === cat.id && match(x.name));
          if (ql && !items.length) return null;
          return (
            <Folder
              key={cat.id}
              icon={cat.id === 'drums' ? <Drum size={14} /> : <Music size={14} />}
              label={cat.label}
              open={isOpen(cat.id)}
              onToggle={() => toggle(cat.id)}
              count={items.length}
            >
              {items.map((x) => (
                <button
                  key={x.id}
                  className="br-item"
                  draggable
                  onDragStart={(e) => startDrag(e, { type: 'preset', id: x.id })}
                  onClick={() => addPreset(x.id)}
                  data-hint={`${x.hint} · click to add at the play cursor, or drag onto the playlist / channel rack`}
                >
                  <span>{x.name}</span>
                  <small>
                    {x.bars} bar{x.bars > 1 ? 's' : ''}
                  </small>
                </button>
              ))}
            </Folder>
          );
        })}

        <Folder icon={<Piano size={14} />} label="Instruments" open={isOpen('instruments')} onToggle={() => toggle('instruments')}>
          {groups.map((g) => {
            const items = g.items.filter((i) => match(i.name));
            if (!items.length) return null;
            return (
              <div key={g.family} className="br-sub">
                <div className="br-sub-label">{g.label}</div>
                {items.map((i) => (
                  <button
                    key={i.id}
                    className="br-item compact"
                    draggable
                    onDragStart={(e) => startDrag(e, { type: 'instrument', id: i.id })}
                    onClick={() => addInstrument(i.id)}
                    data-hint={`${i.name} — click to add as a new channel, or drag onto the channel rack`}
                  >
                    <span>{i.name}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </Folder>

        <Folder icon={<FileAudio size={14} />} label="Audio" open={isOpen('audio')} onToggle={() => toggle('audio')}>
          <button className="br-item" onClick={() => fileRef.current?.click()} data-hint="Bring in a WAV / MP3 / OGG — it lands on the playlist at the play cursor">
            <span>
              <FolderOpen size={13} /> Import audio file…
            </span>
            <small>vocals, loops, samples</small>
          </button>
        </Folder>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importAudioFile(f, { start: Math.floor(s.cursor / 4) * 4 });
        }}
      />
    </aside>
  );
}
