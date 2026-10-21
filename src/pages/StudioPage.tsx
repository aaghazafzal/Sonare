import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Piano, SlidersHorizontal, SquarePen } from 'lucide-react';
import { TransportBar } from '../studio/Transport';
import { Arrangement } from '../studio/Arrangement';
import { ClipEditor } from '../studio/ClipEditor';
import { Mixer } from '../studio/Mixer';
import { useStudio, cloneClip, findClip, mapTrack, splitClip } from '../studio/store';
import { ensureGraph, mountStudio, seek, togglePlay } from '../studio/playback';
import { setSpaceSustain } from '../audio/input';
import { InstrumentStage } from '../components/instruments/InstrumentStage';
import { defaultView, displayName, type ViewKind } from '../lib/instruments';
import { Segmented } from '../components/ui';
import type { DockTab } from '../studio/store';

export function StudioPage() {
  const s = useStudio();
  const [dockH, setDockH] = useState(() => Math.round(window.innerHeight * 0.4));
  const resize = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    const st = useStudio.getState();
    if (!st.selectedTrackId && st.project.tracks[0]) st.setUi({ selectedTrackId: st.project.tracks[0].id });
    const unmount = mountStudio();
    ensureGraph();
    setSpaceSustain(false);
    return () => {
      unmount();
      setSpaceSustain(true);
    };
  }, []);

  // studio shortcuts (letters stay free for playing the selected track)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const st = useStudio.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) togglePlay();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (e.key === 'Home') {
        seek(0);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedClipId) {
        const f = findClip(st.project, st.selectedClipId);
        if (!f) return;
        e.preventDefault();
        st.edit((p) => mapTrack(p, f.track.id, (tr) => ({ ...tr, clips: tr.clips.filter((c) => c.id !== f.clip.id) })));
        st.setUi({ selectedClipId: null });
      } else if (mod && e.key.toLowerCase() === 'd' && st.selectedClipId) {
        e.preventDefault();
        const f = findClip(st.project, st.selectedClipId);
        if (!f) return;
        const c = cloneClip(f.clip, f.clip.start + f.clip.length);
        st.edit((p) => mapTrack(p, f.track.id, (tr) => ({ ...tr, clips: [...tr.clips, c] })));
        st.setUi({ selectedClipId: c.id });
      } else if (mod && e.key.toLowerCase() === 'e' && st.selectedClipId) {
        e.preventDefault();
        const f = findClip(st.project, st.selectedClipId);
        const parts = f && splitClip(f.clip, st.cursor, st.project.bpm);
        if (f && parts)
          st.edit((p) => mapTrack(p, f.track.id, (tr) => ({ ...tr, clips: tr.clips.flatMap((c) => (c.id === f.clip.id ? parts : [c])) })));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const track = s.project.tracks.find((t) => t.id === s.selectedTrackId);
  const [views, setViews] = useState<Record<string, ViewKind>>({});
  const view = track ? views[track.id] ?? defaultView(track.instrumentId) : 'keyboard';

  return (
    <div className="studio">
      <TransportBar />
      <div className="studio-main">
        <Arrangement />
      </div>
      <div className={`dock ${s.dockOpen ? '' : 'closed'}`} style={{ height: s.dockOpen ? dockH : undefined }}>
        <div
          className="dock-resize"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            resize.current = { y: e.clientY, h: dockH };
          }}
          onPointerMove={(e) => {
            if (!resize.current) return;
            const h = resize.current.h + (resize.current.y - e.clientY);
            setDockH(Math.max(180, Math.min(window.innerHeight - 220, h)));
          }}
          onPointerUp={() => (resize.current = null)}
        />
        <div className="dock-bar">
          <Segmented<DockTab>
            value={s.dock}
            onChange={(d) => s.setUi({ dock: d, dockOpen: true })}
            options={[
              { value: 'editor', label: <><SquarePen /> Editor</> },
              { value: 'mixer', label: <><SlidersHorizontal /> Mixer</> },
              { value: 'instrument', label: <><Piano /> Play</> },
            ]}
          />
          <span className="faint dock-hint">
            {s.dock === 'instrument' && track
              ? track.kind === 'audio'
                ? 'Audio tracks record from your microphone. Select an instrument or drum track to play it here.'
                : `Playing ${displayName(track.instrumentId)} — computer keys & MIDI play the selected track`
              : 'Space play/pause · Ctrl+Z undo · Ctrl+D duplicate · Ctrl+E split · Del delete'}
          </span>
          <div className="spacer" />
          <button className="btn icon ghost" onClick={() => s.setUi({ dockOpen: !s.dockOpen })} title={s.dockOpen ? 'Collapse' : 'Expand'}>
            {s.dockOpen ? <ChevronDown /> : <ChevronUp />}
          </button>
        </div>
        {s.dockOpen && (
          <div className="dock-body">
            {s.dock === 'editor' && <ClipEditor />}
            {s.dock === 'mixer' && <Mixer />}
            {s.dock === 'instrument' &&
              (track && track.kind !== 'audio' ? (
                <InstrumentStage
                  key={track.id}
                  instrumentId={track.instrumentId}
                  nativeView={defaultView(track.instrumentId)}
                  view={view}
                  onViewChange={(v) => setViews((m) => ({ ...m, [track.id]: v }))}
                  compact
                />
              ) : (
                <div className="empty">Select an instrument or drum track to play it with the mouse, computer keyboard or a MIDI device.</div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
