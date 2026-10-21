import * as Tone from 'tone';
import { create } from 'zustand';
import { ensureAudio, metronomeClick } from './engine';

/** Free-running click for practising on the Play page (the studio has its own, tied to the transport). */
interface MetronomeState {
  on: boolean;
  bpm: number;
  beats: number;
  beat: number;
}
export const useMetronome = create<MetronomeState>(() => ({ on: false, bpm: 90, beats: 4, beat: -1 }));

let clock: Tone.Clock | null = null;
let count = 0;

export async function toggleMetronome(on = !useMetronome.getState().on) {
  await ensureAudio();
  if (on) {
    count = 0;
    clock ??= new Tone.Clock((time) => {
      const { beats } = useMetronome.getState();
      const beat = count % beats;
      metronomeClick(time, beat === 0);
      count++;
      Tone.getDraw().schedule(() => useMetronome.setState({ beat }), time);
    }, useMetronome.getState().bpm / 60);
    clock.frequency.value = useMetronome.getState().bpm / 60;
    clock.start();
  } else {
    clock?.stop();
  }
  useMetronome.setState({ on, beat: -1 });
}

export function setMetronome(p: Partial<Pick<MetronomeState, 'bpm' | 'beats'>>) {
  useMetronome.setState(p);
  if (p.bpm && clock) clock.frequency.value = p.bpm / 60;
}
