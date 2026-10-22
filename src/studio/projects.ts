import { get, set, del } from 'idb-keyval';
import { create } from 'zustand';
import { useStudio, normalizeProject, songEnd, uid, emptyProject } from './store';
import { collectGarbage, readAudioBlob, writeAudioBlob, download } from './buffers';
import type { Project } from './types';

/** Every project is kept in IndexedDB; the open one also lives in the studio store. */
export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  bpm: number;
  channels: number;
  bars: number;
}

interface ProjectsState {
  list: ProjectMeta[];
  status: 'idle' | 'saving' | 'saved' | 'error';
  savedAt: number | null;
}
export const useProjects = create<ProjectsState>(() => ({ list: [], status: 'idle', savedAt: null }));

const INDEX = 'projects:index';
const key = (id: string) => `project:${id}`;

const metaOf = (p: Project): ProjectMeta => ({
  id: p.id,
  name: p.name || 'Untitled session',
  updatedAt: Date.now(),
  bpm: p.bpm,
  channels: p.tracks.length,
  bars: Math.ceil(songEnd(p) / p.beatsPerBar),
});

async function readIndex(): Promise<ProjectMeta[]> {
  return (await get<ProjectMeta[]>(INDEX)) ?? [];
}
async function writeIndex(list: ProjectMeta[]) {
  const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  await set(INDEX, sorted);
  useProjects.setState({ list: sorted });
}

export async function refreshProjects() {
  useProjects.setState({ list: (await readIndex()).sort((a, b) => b.updatedAt - a.updatedAt) });
}

export async function saveProject(p: Project) {
  useProjects.setState({ status: 'saving' });
  try {
    await set(key(p.id), p);
    const list = (await readIndex()).filter((m) => m.id !== p.id);
    await writeIndex([metaOf(p), ...list]);
    useProjects.setState({ status: 'saved', savedAt: Date.now() });
  } catch {
    useProjects.setState({ status: 'error' });
  }
}

/** Save what's open, then switch to another stored project. */
export async function openProject(id: string) {
  const s = useStudio.getState();
  await saveProject(s.project);
  const p = await get<Project>(key(id));
  if (p) s.loadProject(normalizeProject(p));
}

/** Save what's open, then start a fresh project (template, file …). */
export async function startProject(p: Project) {
  await saveProject(useStudio.getState().project);
  useStudio.getState().loadProject(p);
  await saveProject(useStudio.getState().project);
}

export async function duplicateProject(id: string) {
  const p = id === useStudio.getState().project.id ? useStudio.getState().project : await get<Project>(key(id));
  if (!p) return;
  const copy: Project = { ...p, id: uid(), name: `${p.name} copy` };
  await saveProject(copy);
}

export async function renameProject(id: string, name: string) {
  const s = useStudio.getState();
  if (id === s.project.id) {
    s.edit((pr) => ({ ...pr, name }), false);
    return;
  }
  const p = await get<Project>(key(id));
  if (p) await saveProject({ ...p, name });
}

export async function deleteProject(id: string) {
  const s = useStudio.getState();
  await del(key(id));
  await writeIndex((await readIndex()).filter((m) => m.id !== id));
  if (id === s.project.id) {
    // keep something open: the most recent remaining project, or a fresh one
    const next = useProjects.getState().list[0];
    const p = next ? await get<Project>(key(next.id)) : null;
    if (p) s.loadProject(normalizeProject(p));
    else s.loadProject(emptyProject());
  }
  // drop recordings no remaining project uses
  const used = new Set<string>();
  const all = [useStudio.getState().project, ...(await Promise.all((await readIndex()).map((m) => get<Project>(key(m.id)))))];
  for (const p of all) for (const it of p?.playlist ?? []) if (it.kind === 'audio') used.add(it.bufferId);
  await collectGarbage(used);
}

/* -------------------------------------------------------------- autosave */

let timer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

export function installAutosave() {
  if (installed) return;
  installed = true;
  // ask the browser not to evict stored projects and recordings
  void navigator.storage?.persist?.();
  void refreshProjects().then(() => saveProject(useStudio.getState().project));
  useStudio.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    useProjects.setState({ status: 'saving' });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveProject(useStudio.getState().project), 1200);
  });
  window.addEventListener('beforeunload', () => {
    if (timer) void saveProject(useStudio.getState().project);
  });
}

/* --------------------------------------------------------- session files */

interface SessionFile {
  format: 'sonare-session';
  version: 2;
  project: Project;
  audio: Record<string, { type: string; data: string }>;
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** A single .sonare.json with the project and every recording it uses. */
export async function exportSessionFile(p: Project) {
  const audio: SessionFile['audio'] = {};
  for (const it of p.playlist) {
    if (it.kind !== 'audio' || audio[it.bufferId]) continue;
    const blob = await readAudioBlob(it.bufferId);
    if (blob) audio[it.bufferId] = { type: blob.type || 'audio/wav', data: await toBase64(blob) };
  }
  const file: SessionFile = { format: 'sonare-session', version: 2, project: p, audio };
  download(new Blob([JSON.stringify(file)], { type: 'application/json' }), `${(p.name || 'session').replace(/[^\w-]+/g, '_')}.sonare.json`);
}

/** Opens a session file (with or without recordings) as a new project. */
export async function importSessionFile(text: string) {
  const data = JSON.parse(text);
  const raw = data?.format === 'sonare-session' ? data.project : data;
  if (!raw || !Array.isArray(raw.tracks)) throw new Error('not a session');
  if (data?.format === 'sonare-session' && data.audio) {
    for (const [id, a] of Object.entries(data.audio as SessionFile['audio'])) {
      const blob = await (await fetch(`data:${a.type};base64,${a.data}`)).blob();
      await writeAudioBlob(id, blob);
    }
  }
  const p = normalizeProject(raw);
  // a fresh id so opening a file never overwrites a stored project
  await startProject({ ...p, id: uid() });
}
