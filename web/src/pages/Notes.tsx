import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/* ────────────────────────────── Types ────────────────────────────── */

interface NoteRow {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  content: string;
  content_html: string;
  is_done: boolean;
  is_pinned: boolean;
  tags: string[];
  has_checklist: boolean;
  has_table: boolean;
  has_image: boolean;
  created_at: string;
  updated_at: string;
}

interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  note_count: number;
}

/* ────────────────────────────── Helpers ────────────────────────────── */

/**
 * Extract plain text from HTML by stripping tags via regex.
 * This is only used for preview/search text from editor output (trusted content).
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const oneDay = 86400000;

  if (diff < oneDay && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 7 * oneDay) {
    return d.toLocaleDateString('en-IN', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debounced = useCallback((...args: any[]) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delay);
  }, [delay]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return debounced as T;
}

/* ────────────────────────────── Main Component ────────────────────────────── */

export default function Notes() {
  const qc = useQueryClient();

  // State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [showMoveMenu, setShowMoveMenu] = useState(false);

  // Queries
  const { data: folders = [] } = useQuery({
    queryKey: ['notes', 'folders'],
    queryFn: () => api<FolderRow[]>('/notes/folders/list'),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['notes', 'list', selectedFolderId, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedFolderId && selectedFolderId !== '__pinned__') {
        params.set('folder_id', selectedFolderId);
      }
      if (search) params.set('search', search);
      const qs = params.toString();
      return api<NoteRow[]>(`/notes${qs ? `?${qs}` : ''}`);
    },
  });

  const { data: selectedNote } = useQuery({
    queryKey: ['notes', 'detail', selectedNoteId],
    queryFn: () => api<NoteRow>(`/notes/${selectedNoteId}`),
    enabled: !!selectedNoteId,
  });

  // Mutations
  const createNoteMut = useMutation({
    mutationFn: (body: Partial<NoteRow>) =>
      api<NoteRow>('/notes', { method: 'POST', body }),
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      setSelectedNoteId(note.id);
    },
  });

  const updateNoteMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<NoteRow>) =>
      api<NoteRow>(`/notes/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', 'list'] });
    },
  });

  const deleteNoteMut = useMutation({
    mutationFn: (id: string) => api(`/notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      setSelectedNoteId(null);
    },
  });

  const pinNoteMut = useMutation({
    mutationFn: (id: string) => api(`/notes/${id}/pin`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const moveNoteMut = useMutation({
    mutationFn: ({ id, folder_id }: { id: string; folder_id: string | null }) =>
      api(`/notes/${id}/move`, { method: 'PATCH', body: { folder_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      setShowMoveMenu(false);
    },
  });

  const createFolderMut = useMutation({
    mutationFn: (name: string) =>
      api<FolderRow>('/notes/folders', { method: 'POST', body: { name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', 'folders'] });
      setNewFolderName('');
      setShowNewFolder(false);
    },
  });

  const deleteFolderMut = useMutation({
    mutationFn: (id: string) => api(`/notes/folders/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      if (selectedFolderId === deletedId) {
        setSelectedFolderId(null);
      }
    },
  });

  // Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      Placeholder.configure({ placeholder: 'Start writing...' }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none outline-none min-h-[300px] px-1 py-2',
      },
    },
    onUpdate: ({ editor: ed }) => {
      debouncedSave(ed.getHTML());
    },
  });

  // Auto-save (debounced)
  const debouncedSave = useDebounce((html: string) => {
    if (!selectedNoteId) return;
    const plainText = stripHtmlTags(html);
    const hasChecklist = html.includes('data-type="taskList"') || html.includes('data-checked');
    const hasTable = html.includes('<table');
    const hasImage = html.includes('<img');

    updateNoteMut.mutate({
      id: selectedNoteId,
      content: plainText,
      content_html: html,
      has_checklist: hasChecklist,
      has_table: hasTable,
      has_image: hasImage,
    });
  }, 1000);

  // Sync editor content when selected note changes
  useEffect(() => {
    if (selectedNote && editor) {
      const currentContent = editor.getHTML();
      if (currentContent !== selectedNote.content_html) {
        editor.commands.setContent(selectedNote.content_html || '');
      }
      setEditingTitle(selectedNote.title || '');
    }
  }, [selectedNote, editor]);

  // Save title with debounce
  const debouncedTitleSave = useDebounce((title: string) => {
    if (!selectedNoteId) return;
    updateNoteMut.mutate({ id: selectedNoteId, title });
  }, 1000);

  const handleTitleChange = (value: string) => {
    setEditingTitle(value);
    debouncedTitleSave(value);
  };

  // Actions
  const handleCreateNote = () => {
    createNoteMut.mutate({
      title: 'Untitled Note',
      content: '',
      content_html: '',
      folder_id: selectedFolderId === '__pinned__' ? null : selectedFolderId,
      tags: [],
      is_pinned: false,
      has_checklist: false,
      has_table: false,
      has_image: false,
    });
  };

  const handleQuickNote = () => {
    createNoteMut.mutate({
      title: '',
      content: '',
      content_html: '',
      folder_id: null,
      tags: [],
      is_pinned: false,
      has_checklist: false,
      has_table: false,
      has_image: false,
    });
  };

  const handleDeleteNote = () => {
    if (!selectedNoteId) return;
    if (confirm('Delete this note permanently?')) {
      deleteNoteMut.mutate(selectedNoteId);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim() && selectedNoteId && selectedNote) {
      e.preventDefault();
      const newTags = [...(selectedNote.tags || []), tagInput.trim()];
      updateNoteMut.mutate({ id: selectedNoteId, tags: newTags });
      qc.invalidateQueries({ queryKey: ['notes', 'detail', selectedNoteId] });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    if (!selectedNoteId || !selectedNote) return;
    const newTags = (selectedNote.tags || []).filter((t) => t !== tag);
    updateNoteMut.mutate({ id: selectedNoteId, tags: newTags });
    qc.invalidateQueries({ queryKey: ['notes', 'detail', selectedNoteId] });
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolderMut.mutate(newFolderName.trim());
  };

  // Filter notes for pinned view
  const displayedNotes = selectedFolderId === '__pinned__'
    ? notes.filter((n) => n.is_pinned)
    : notes;

  // Sort notes: pinned first, then by updated_at
  const sortedNotes = [...displayedNotes].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const totalNoteCount = notes.length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Panel: Folders */}
      <div className="w-[200px] shrink-0 border-r border-line bg-bg-soft/80 flex flex-col">
        <div className="p-3 border-b border-line">
          <button
            onClick={handleQuickNote}
            className="w-full px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent/90 transition-colors"
          >
            Quick Note
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 no-scrollbar">
          {/* All Notes */}
          <button
            onClick={() => setSelectedFolderId(null)}
            className={cn(
              'w-full text-left px-3 py-1.5 text-xs flex items-center justify-between rounded-md mx-1 transition-colors',
              selectedFolderId === null
                ? 'bg-accent/15 text-accent font-medium'
                : 'text-ink-muted hover:bg-line/40 hover:text-ink',
            )}
            style={{ width: 'calc(100% - 8px)' }}
          >
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              All Notes
            </span>
            <span className="text-2xs text-ink-dim">{totalNoteCount}</span>
          </button>

          {/* Pinned filter */}
          <button
            onClick={() => setSelectedFolderId('__pinned__')}
            className={cn(
              'w-full text-left px-3 py-1.5 text-xs flex items-center justify-between rounded-md mx-1 transition-colors',
              selectedFolderId === '__pinned__'
                ? 'bg-accent/15 text-accent font-medium'
                : 'text-ink-muted hover:bg-line/40 hover:text-ink',
            )}
            style={{ width: 'calc(100% - 8px)' }}
          >
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Pinned
            </span>
            <span className="text-2xs text-ink-dim">
              {notes.filter((n) => n.is_pinned).length}
            </span>
          </button>

          {/* Divider */}
          <div className="border-t border-line/60 my-2 mx-3" />

          {/* Folders */}
          {folders.map((folder) => (
            <div key={folder.id} className="group flex items-center mx-1" style={{ width: 'calc(100% - 8px)' }}>
              <button
                onClick={() => setSelectedFolderId(folder.id)}
                className={cn(
                  'flex-1 text-left px-3 py-1.5 text-xs flex items-center justify-between rounded-md transition-colors',
                  selectedFolderId === folder.id
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-ink-muted hover:bg-line/40 hover:text-ink',
                )}
              >
                <span className="flex items-center gap-2 truncate">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="truncate">{folder.name}</span>
                </span>
                <span className="text-2xs text-ink-dim">{folder.note_count ?? 0}</span>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete folder "${folder.name}"?`)) {
                    deleteFolderMut.mutate(folder.id);
                  }
                }}
                className="hidden group-hover:block p-1 text-ink-dim hover:text-loss text-xs"
                title="Delete folder"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </nav>

        {/* New Folder */}
        <div className="p-2 border-t border-line">
          {showNewFolder ? (
            <form onSubmit={handleCreateFolder} className="flex gap-1">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }}
                placeholder="Folder name"
                className="flex-1 px-2 py-1 text-xs rounded border border-line bg-bg-lift focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
                className="px-2 py-1 text-xs text-ink-muted hover:text-ink rounded border border-line"
              >
                ✕
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowNewFolder(true)}
              className="w-full px-3 py-1.5 text-xs text-ink-muted hover:text-ink hover:bg-line/40 rounded-md flex items-center gap-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Folder
            </button>
          )}
        </div>
      </div>

      {/* Middle Panel: Note List */}
      <div className="w-[280px] shrink-0 border-r border-line bg-bg/95 flex flex-col">
        {/* Top bar */}
        <div className="p-3 border-b border-line space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateNote}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent/90 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
            <span className="text-2xs text-ink-dim ml-auto">
              {sortedNotes.length} note{sortedNotes.length !== 1 ? 's' : ''}
            </span>
          </div>
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-line bg-bg-lift focus:outline-none focus:ring-1 focus:ring-accent/50 placeholder:text-ink-dim"
            />
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {sortedNotes.length === 0 ? (
            <div className="p-4 text-center text-xs text-ink-dim">
              {search ? 'No notes match your search.' : 'No notes yet.'}
            </div>
          ) : (
            sortedNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => setSelectedNoteId(note.id)}
                className={cn(
                  'px-3 py-2.5 border-b border-line/50 cursor-pointer transition-colors group',
                  selectedNoteId === note.id
                    ? 'bg-accent/10 border-l-2 border-l-accent'
                    : 'hover:bg-line/30',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {note.is_pinned && <span className="text-xs leading-none">📌</span>}
                      <h4 className="text-xs font-medium truncate">
                        {note.title || 'Untitled'}
                      </h4>
                    </div>
                    <p className="text-2xs text-ink-muted mt-0.5 line-clamp-2">
                      {note.content || 'No content'}
                    </p>
                    <span className="text-2xs text-ink-dim mt-1 block">
                      {formatDate(note.updated_at)}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      pinNoteMut.mutate(note.id);
                    }}
                    className={cn(
                      'p-1 rounded shrink-0 transition-colors',
                      note.is_pinned
                        ? 'text-accent'
                        : 'text-ink-dim opacity-0 group-hover:opacity-100 hover:text-accent',
                    )}
                    title={note.is_pinned ? 'Unpin' : 'Pin'}
                  >
                    <svg className="w-3.5 h-3.5" fill={note.is_pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel: Editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-bg-lift/50">
        {selectedNote ? (
          <>
            {/* Title + actions bar */}
            <div className="px-5 pt-4 pb-2 border-b border-line/60 flex items-center gap-3">
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Note title..."
                className="flex-1 text-lg font-semibold bg-transparent border-none outline-none placeholder:text-ink-dim"
              />
              <div className="flex items-center gap-1">
                {/* Move to folder */}
                <div className="relative">
                  <button
                    onClick={() => setShowMoveMenu(!showMoveMenu)}
                    className="p-1.5 rounded-md hover:bg-line/40 text-ink-muted hover:text-ink transition-colors"
                    title="Move to folder"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </button>
                  {showMoveMenu && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-bg-soft border border-line rounded-lg shadow-xl z-50 py-1">
                      <button
                        onClick={() => moveNoteMut.mutate({ id: selectedNote.id, folder_id: null })}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-line/40 text-ink-muted"
                      >
                        No folder
                      </button>
                      {folders.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => moveNoteMut.mutate({ id: selectedNote.id, folder_id: f.id })}
                          className={cn(
                            'w-full text-left px-3 py-1.5 text-xs hover:bg-line/40',
                            selectedNote.folder_id === f.id ? 'text-accent font-medium' : 'text-ink-muted',
                          )}
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Delete */}
                <button
                  onClick={handleDeleteNote}
                  className="p-1.5 rounded-md hover:bg-loss/20 text-ink-muted hover:text-loss transition-colors"
                  title="Delete note"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tags */}
            <div className="px-5 py-2 border-b border-line/40 flex items-center gap-2 flex-wrap">
              {(selectedNote.tags || []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent text-2xs rounded-full"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-loss"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="Add tag..."
                className="text-2xs bg-transparent border-none outline-none placeholder:text-ink-dim w-20"
              />
            </div>

            {/* Toolbar */}
            <EditorToolbar editor={editor} />

            {/* Editor */}
            <div className="flex-1 overflow-y-auto px-5 py-3 no-scrollbar">
              <EditorContent editor={editor} className="tiptap-editor" />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-ink-dim text-sm">
            <div className="text-center space-y-2">
              <svg className="w-12 h-12 mx-auto text-ink-dim/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <p>Select a note or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Editor styles */}
      <style>{tiptapStyles}</style>
    </div>
  );
}

/* ────────────────────────────── Toolbar ────────────────────────────── */

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const ToolBtn = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded transition-colors text-xs',
        active
          ? 'bg-accent/20 text-accent'
          : 'text-ink-muted hover:bg-line/40 hover:text-ink',
      )}
    >
      {children}
    </button>
  );

  const Separator = () => <div className="w-px h-5 bg-line/60 mx-1" />;

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className="px-5 py-1.5 border-b border-line/40 flex items-center gap-0.5 flex-wrap overflow-x-auto no-scrollbar">
      {/* Text formatting */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
      >
        <span className="font-bold">B</span>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
      >
        <span className="italic">I</span>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Underline"
      >
        <span className="underline">U</span>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      >
        <span className="line-through">S</span>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        active={editor.isActive('highlight')}
        title="Highlight"
      >
        <span className="bg-yellow-400/40 px-0.5 rounded">H</span>
      </ToolBtn>

      <Separator />

      {/* Headings */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        H1
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        H2
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        H3
      </ToolBtn>

      <Separator />

      {/* Lists */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet list"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Ordered list"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h10M7 16h10M3 8h.01M3 12h.01M3 16h.01" />
        </svg>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
        title="Task list"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </ToolBtn>

      <Separator />

      {/* Table */}
      <ToolBtn onClick={insertTable} title="Insert table (3x3)">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
        </svg>
      </ToolBtn>

      {/* Image */}
      <ToolBtn onClick={insertImage} title="Insert image">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </ToolBtn>

      <Separator />

      {/* Block elements */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Quote"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="Code block"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      </ToolBtn>
    </div>
  );
}

/* ────────────────────────────── Tiptap Styles ────────────────────────────── */

const tiptapStyles = `
  .tiptap-editor .tiptap {
    outline: none;
    min-height: 300px;
    font-size: 0.875rem;
    line-height: 1.6;
    color: rgb(var(--c-ink));
  }

  .tiptap-editor .tiptap p {
    margin: 0.5em 0;
  }

  .tiptap-editor .tiptap h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 1em 0 0.5em;
    line-height: 1.3;
  }

  .tiptap-editor .tiptap h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0.8em 0 0.4em;
    line-height: 1.3;
  }

  .tiptap-editor .tiptap h3 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0.6em 0 0.3em;
    line-height: 1.4;
  }

  .tiptap-editor .tiptap ul,
  .tiptap-editor .tiptap ol {
    padding-left: 1.5rem;
    margin: 0.5em 0;
  }

  .tiptap-editor .tiptap ul {
    list-style-type: disc;
  }

  .tiptap-editor .tiptap ol {
    list-style-type: decimal;
  }

  .tiptap-editor .tiptap li {
    margin: 0.2em 0;
  }

  .tiptap-editor .tiptap ul[data-type="taskList"] {
    list-style: none;
    padding-left: 0;
  }

  .tiptap-editor .tiptap ul[data-type="taskList"] li {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .tiptap-editor .tiptap ul[data-type="taskList"] li label {
    display: flex;
    align-items: center;
    margin-top: 0.2em;
  }

  .tiptap-editor .tiptap ul[data-type="taskList"] li label input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    accent-color: rgb(var(--c-accent));
    cursor: pointer;
  }

  .tiptap-editor .tiptap ul[data-type="taskList"] li div {
    flex: 1;
  }

  .tiptap-editor .tiptap blockquote {
    border-left: 3px solid rgb(var(--c-accent) / 0.5);
    padding-left: 1rem;
    margin: 0.5em 0;
    color: rgb(var(--c-ink-muted));
    font-style: italic;
  }

  .tiptap-editor .tiptap pre {
    background: rgb(var(--c-bg-soft));
    border: 1px solid rgb(var(--c-line));
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    margin: 0.5em 0;
    overflow-x: auto;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.8rem;
  }

  .tiptap-editor .tiptap code {
    background: rgb(var(--c-bg-soft));
    padding: 0.15em 0.4em;
    border-radius: 0.25rem;
    font-size: 0.85em;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }

  .tiptap-editor .tiptap pre code {
    background: none;
    padding: 0;
    border-radius: 0;
    font-size: inherit;
  }

  .tiptap-editor .tiptap hr {
    border: none;
    border-top: 1px solid rgb(var(--c-line));
    margin: 1.5em 0;
  }

  .tiptap-editor .tiptap mark {
    background-color: rgb(250 204 21 / 0.4);
    border-radius: 0.15em;
    padding: 0.05em 0.1em;
  }

  .tiptap-editor .tiptap img {
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin: 0.5em 0;
  }

  .tiptap-editor .tiptap table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5em 0;
  }

  .tiptap-editor .tiptap table td,
  .tiptap-editor .tiptap table th {
    border: 1px solid rgb(var(--c-line));
    padding: 0.4rem 0.6rem;
    text-align: left;
    font-size: 0.8rem;
  }

  .tiptap-editor .tiptap table th {
    background: rgb(var(--c-bg-soft));
    font-weight: 600;
  }

  .tiptap-editor .tiptap .is-empty::before {
    content: attr(data-placeholder);
    float: left;
    color: rgb(var(--c-ink-dim));
    pointer-events: none;
    height: 0;
  }

  .tiptap-editor .tiptap a {
    color: rgb(var(--c-accent));
    text-decoration: underline;
    cursor: pointer;
  }
`;
