import * as Tone from 'tone';
import type { Automatable, Strip, Voice } from '../audio/engine';
import { currentPattern, songEnd } from './store';
import { autoValue } from './automation';
import type { AudioItem, AutomationItem, Pattern, Project } from './types';

type Transport = ReturnType<typeof Tone.getTransport>;

/** Where scheduled events go: the live transport or an offline render. */
export interface ScheduleTarget {
  transport: Transport;
  voice(channelId: string): Voice | null | undefined;
  strip(channelId: string): Strip | undefined;
  masterVolume: Automatable;
  /** a player for an audio clip, connected to its channel (null = skip) */
  player(item: AudioItem): Tone.Player | null;
}

/* ------------------------------------------------------------- automation */

function scheduleAutomation(it: AutomationItem, tgt: ScheduleTarget, bpm: number) {
  const target =
    it.target.channelId === 'master'
      ? it.target.param === 'volume'
        ? tgt.masterVolume
        : null
      : tgt.strip(it.target.channelId)?.param(it.target.param) ?? null;
  if (!target) return;
  const pts = [...it.points].sort((a, b) => a.t - b.t).filter((x) => x.t <= it.length);
  if (!pts.length) return;
  const PPQ = tgt.transport.PPQ;
  const at = (beats: number) => `${Math.round(beats * PPQ)}i`;
  const map = (v: number) => autoValue(it.target.param, v);
  tgt.transport.schedule((time) => {
    target.cancelScheduledValues(time);
    target.setValueAtTime(map(pts[0].v), time);
  }, at(it.start + Math.max(0, pts[0].t)));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seconds = ((b.t - a.t) * 60) / bpm;
    tgt.transport.schedule((time) => {
      target.setValueAtTime(map(a.v), time);
      target.linearRampToValueAtTime(map(b.v), time + seconds);
    }, at(it.start + a.t));
  }
}

/* ------------------------------------------------------------- notes */

/** Swing pushes every off-beat 16th later by up to a third of a 16th. */
const swung = (start: number, swing: number) => {
  const sixteenth = Math.round(start * 4);
  return Math.abs(start * 4 - sixteenth) < 0.01 && sixteenth % 2 === 1 ? start + swing * (0.25 / 3) : start;
};

/** Schedule a pattern at `at` for `length` beats, repeating it when the placement is longer. */
function schedulePattern(pat: Pattern, at: number, length: number, tgt: ScheduleTarget) {
  if (pat.length <= 0) return;
  const PPQ = tgt.transport.PPQ;
  for (let rep = 0; rep < length; rep += pat.length) {
    for (const [channelId, notes] of Object.entries(pat.notes)) {
      const voice = tgt.voice(channelId);
      if (!voice) continue;
      for (const note of notes) {
        if (note.start < 0 || note.start >= pat.length) continue;
        const t = rep + swung(note.start, pat.swing);
        if (t >= length) continue;
        const dur = Math.min(note.dur, pat.length - note.start, length - t);
        // seconds from the target's own transport (offline renders run beside the live one)
        tgt.transport.schedule((time) => {
          voice.play(note.pitch, (dur * 60) / tgt.transport.bpm.value, time, note.vel);
        }, `${Math.round((at + t) * PPQ)}i`);
      }
    }
  }
}

/** Schedule everything for playback: the looping pattern (PAT) or the whole playlist (SONG). */
export function scheduleProject(p: Project, tgt: ScheduleTarget, mode: Project['mode'] = p.mode) {
  if (mode === 'pattern') {
    const pat = currentPattern(p);
    schedulePattern(pat, 0, pat.length, tgt);
    return;
  }
  const byId = new Map(p.patterns.map((x) => [x.id, x]));
  for (const it of p.playlist) {
    if (p.lanes[it.lane]?.mute) continue;
    if (it.kind === 'pattern') {
      const pat = byId.get(it.patternId);
      if (pat) schedulePattern(pat, it.start, it.length, tgt);
    } else if (it.kind === 'audio') {
      const player = tgt.player(it);
      if (!player) continue;
      player.volume.value = Tone.gainToDb(it.gain);
      const startSec = (it.start * 60) / p.bpm;
      const durSec = Math.min((it.length * 60) / p.bpm, (player.buffer.duration || Infinity) - it.offset);
      if (durSec > 0) player.sync().start(startSec, it.offset, durSec);
    } else scheduleAutomation(it, tgt, p.bpm);
  }
}

export const songSeconds = (p: Project) => (songEnd(p) * 60) / p.bpm;
