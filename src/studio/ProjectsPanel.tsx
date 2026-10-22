import { useEffect, useState } from 'react';
import { Check, Cloud, CloudOff, Copy, FilePlus2, FolderOpen, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useStudio, emptyProject } from './store';
import { useProjects, refreshProjects, openProject, startProject, duplicateProject, renameProject, deleteProject } from './projects';

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

/** "My projects": every project saved in this browser. */
export function ProjectsPanel({ onClose, onOpenFile }: { onClose: () => void; onOpenFile: () => void }) {
  const list = useProjects((s) => s.list);
  const currentId = useStudio((s) => s.project.id);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void refreshProjects();
  }, []);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="proj">
      <div className="row wrap">
        <button
          className="btn primary"
          onClick={() =>
            void run('new', async () => {
              await startProject(emptyProject());
              onClose();
            })
          }
        >
          <FilePlus2 /> New empty project
        </button>
        <button className="btn" onClick={onOpenFile}>
          <FolderOpen /> Open session file…
        </button>
      </div>

      <ul className="proj-list">
        {list.map((m) => {
          const current = m.id === currentId;
          return (
            <li key={m.id} className={current ? 'on' : ''}>
              {renaming === m.id ? (
                <input
                  className="input proj-rename"
                  autoFocus
                  defaultValue={m.name}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                  }}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    setRenaming(null);
                    if (name && name !== m.name) void run(m.id, () => renameProject(m.id, name));
                  }}
                />
              ) : (
                <button
                  className="proj-main"
                  onClick={() =>
                    current
                      ? onClose()
                      : void run(m.id, async () => {
                          await openProject(m.id);
                          onClose();
                        })
                  }
                >
                  <b>{m.name}</b>
                  <small className="faint">
                    {m.bpm} BPM · {m.channels} channels · {m.bars} bars · edited {ago(m.updatedAt)}
                  </small>
                </button>
              )}
              {busy === m.id && <Loader2 size={14} className="spin faint" />}
              {current && <span className="tag proj-open">Open</span>}
              <button className="btn sm icon ghost" onClick={() => setRenaming(m.id)} aria-label="Rename project" title="Rename">
                <Pencil />
              </button>
              <button className="btn sm icon ghost" onClick={() => void run(m.id, () => duplicateProject(m.id))} aria-label="Duplicate project" title="Duplicate">
                <Copy />
              </button>
              <button
                className="btn sm icon ghost danger-ghost"
                onClick={() => {
                  if (confirm(`Delete “${m.name}”? Its recordings are removed too. This can't be undone.`)) void run(m.id, () => deleteProject(m.id));
                }}
                aria-label="Delete project"
                title="Delete"
              >
                <Trash2 />
              </button>
            </li>
          );
        })}
        {!list.length && <li className="empty">No saved projects yet.</li>}
      </ul>
      <p className="faint proj-note">
        Projects save automatically in this browser. To back one up or move it to another device, use File → Save session file — your recordings go
        inside the file.
      </p>
    </div>
  );
}

/** Small "Saved" indicator for the toolbar. */
export function SaveStatus({ onClick }: { onClick: () => void }) {
  const status = useProjects((s) => s.status);
  const label = status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : 'Saved';
  return (
    <button className={`fl-save ${status}`} onClick={onClick} data-hint="Projects save automatically — click to see all your projects">
      {status === 'saving' ? <Loader2 className="spin" /> : status === 'error' ? <CloudOff /> : status === 'saved' ? <Check /> : <Cloud />}
      <span className="lbl">{label}</span>
    </button>
  );
}
