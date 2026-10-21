import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Grid3x3, Music2, Piano, SlidersHorizontal } from 'lucide-react';
import { Toolbar } from '../studio/Toolbar';
import { Playlist } from '../studio/Playlist';
import { ChannelRack } from '../studio/ChannelRack';
import { PianoRollPanel } from '../studio/PianoRoll';
import { Browser } from '../studio/Browser';
import { Mixer } from '../studio/Mixer';
import { InstrumentSelect, installHints } from '../studio/common';
import { useStudio, mapTrack, cloneItem, channelKind, type DockTab } from '../studio/store';
import { ensureGraph, mountStudio, seek, togglePlay } from '../studio/playback';
import { setSpaceSustain } from '../audio/input';
import { InstrumentStage } from '../components/instruments/InstrumentStage';
import { defaultView, displayName, type ViewKind } from '../lib/instruments';
import { Segmented, Sheet } from '../components/ui';
import { useMobile, useMobileStore } from '../lib/useMobile';

export function StudioPage() {
  const s = useStudio();
  const mobile = useMobile();
  const rootRef = useRef<HTMLDivElement>(null);
  const [dockH, setDockH] = useState(() => Math.round(window.innerHeight * (useMobileStore.getState().mode ? 0.5 : 0.44)));
  const resize = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    const st = useStudio.getState();
    if (!st.project.tracks.some((t) => t.id === st.selectedTrackId) && st.project.tracks[0]) st.setUi({ selectedTrackId: st.project.tracks[0].id });
    // on phones the browser is a sheet; don't pop it open on arrival
    if (useMobileStore.getState().mode) st.setUi({ browserOpen: false });
    const unmount = mountStudio();
    ensureGraph();
    setSpaceSustain(false);
    const stopHints = rootRef.current ? installHints(rootRef.current) : undefined;
    return () => {
      unmount();
      setSpaceSustain(true);
      stopHints?.();
    };
  }, []);

  // FL-style shortcuts (letters stay free for playing the selected channel)
  useEffect(() => {
    const toggleDock = (d: DockTab) => {
      const st = useStudio.getState();
      st.setUi(st.dock === d && st.dockOpen ? { dockOpen: false } : { dock: d, dockOpen: true });
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const st = useStudio.getState();
      const mod = e.ctrlKey || e.metaKey;
      const item = st.project.playlist.find((x) => x.id === st.selectedItemId);
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) togglePlay();
      } else if (e.key === 'F5') {
        e.preventDefault();
        st.setUi({ dockOpen: false });
      } else if (e.key === 'F6') {
        e.preventDefault();
        toggleDock('rack');
      } else if (e.key === 'F7') {
        e.preventDefault();
        toggleDock('roll');
      } else if (e.key === 'F8') {
        e.preventDefault();
        st.setUi({ browserOpen: !st.browserOpen });
      } else if (e.key === 'F9') {
        e.preventDefault();
        toggleDock('mixer');
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (e.key === 'Home') {
        seek(0);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && item) {
        e.preventDefault();
        st.edit((p) => ({ ...p, playlist: p.playlist.filter((x) => x.id !== item.id) }));
        st.setUi({ selectedItemId: null });
      } else if (mod && e.key.toLowerCase() === 'd' && item) {
        e.preventDefault();
        const c = cloneItem(item, item.start + item.length);
        st.edit((p) => ({ ...p, playlist: [...p.playlist, c] }));
        st.setUi({ selectedItemId: c.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const track = s.project.tracks.find((t) => t.id === s.selectedTrackId);
  const [views, setViews] = useState<Record<string, ViewKind>>({});
  const view = track ? views[track.id] ?? defaultView(track.instrumentId) : 'keyboard';
  const showDockInstrument = s.dock === 'instrument' && !!track && track.kind !== 'audio';

  return (
    <div className="studio fl" ref={rootRef}>
      <Toolbar />
      <div className="fl-body">
        {s.browserOpen && !mobile && <Browser />}
        <div className="fl-main">
          <div className="fl-playlist">
            <Playlist />
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
                setDockH(Math.max(180, Math.min(window.innerHeight - 200, h)));
              }}
              onPointerUp={() => (resize.current = null)}
              data-hint="Drag to resize"
            />
            <div className={`dock-bar ${mobile && showDockInstrument ? 'has-picker' : ''}`}>
              <Segmented<DockTab>
                value={s.dock}
                onChange={(d) => s.setUi({ dock: d, dockOpen: true })}
                options={[
                  { value: 'rack', title: 'Channel rack (F6)', label: <><Grid3x3 /> Channel rack</> },
                  { value: 'roll', title: 'Piano roll (F7)', label: <><Music2 /> Piano roll</> },
                  { value: 'mixer', title: 'Mixer (F9)', label: <><SlidersHorizontal /> Mixer</> },
                  { value: 'instrument', title: 'Play the selected channel', label: <><Piano /> Play</> },
                ]}
              />
              {showDockInstrument && track && (
                <InstrumentSelect
                  value={track.instrumentId}
                  onChange={(id) =>
                    s.edit((p) =>
                      mapTrack(p, track.id, (tr) => ({
                        ...tr,
                        instrumentId: id,
                        kind: channelKind(id),
                        name: tr.name === displayName(tr.instrumentId) ? displayName(id) : tr.name,
                      })),
                    )
                  }
                />
              )}
              <span className="faint dock-hint">
                {track ? (
                  <>
                    Selected: <b style={{ color: track.color }}>{track.name}</b>
                    {track.kind !== 'audio' ? ' — your computer keys and MIDI keyboard play it' : ' — arm it to record from the microphone'}
                  </>
                ) : (
                  'Select a channel in the channel rack'
                )}
              </span>
              <div className="spacer" />
              <button className="btn icon ghost" onClick={() => s.setUi({ dockOpen: !s.dockOpen })} title={s.dockOpen ? 'Collapse' : 'Expand'}>
                {s.dockOpen ? <ChevronDown /> : <ChevronUp />}
              </button>
            </div>
            {s.dockOpen && (
              <div className="dock-body">
                {s.dock === 'rack' && <ChannelRack />}
                {s.dock === 'roll' && <PianoRollPanel />}
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
                    <div className="empty">Select an instrument or drum channel to play it with the mouse, computer keyboard or a MIDI device.</div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {mobile && (
        <Sheet open={s.browserOpen} onClose={() => s.setUi({ browserOpen: false })} title="Browser" tall>
          <Browser />
        </Sheet>
      )}
    </div>
  );
}
