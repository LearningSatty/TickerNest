/**
 * RichTextEditor — reusable TipTap-based rich text editor.
 * Used for watchlist descriptions, notes, etc.
 *
 * Features:
 *   - Bold, italic, underline, strikethrough, highlight
 *   - Headings (H1, H2, H3)
 *   - Bullet/ordered/task lists
 *   - Blockquote, code block, horizontal rule
 *   - Images (via URL prompt)
 *   - Links (with YouTube URL auto-embed in view mode)
 *   - Placeholder text
 */
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Compact mode: smaller height, fewer toolbar items */
  compact?: boolean;
  className?: string;
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start writing…',
  compact = false,
  className,
}: RichTextEditorProps) {
  // Track whether the change came from the editor itself (to avoid circular sync)
  const isInternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-accent underline' },
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-invert max-w-none outline-none px-3 py-2',
          compact ? 'min-h-[120px]' : 'min-h-[200px]',
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      isInternalUpdate.current = true;
      onChange(ed.getHTML());
    },
  });

  // Sync external content changes (only when NOT triggered by the editor's own onUpdate)
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) return null;

  return (
    <div className={cn('border border-line rounded-lg overflow-hidden bg-bg', className)}>
      <Toolbar editor={editor} compact={compact} />
      <EditorContent editor={editor} className="wl-rich-editor" />
      <style>{editorStyles}</style>
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────
function Toolbar({
  editor,
  compact,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  compact: boolean;
}) {
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
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1 rounded transition-colors text-xs',
        active
          ? 'bg-accent/20 text-accent'
          : 'text-ink-muted hover:bg-line/40 hover:text-ink',
      )}
    >
      {children}
    </button>
  );

  const Sep = () => <div className="w-px h-4 bg-line/60 mx-0.5" />;

  const insertLink = () => {
    const url = prompt('Enter URL (YouTube links will auto-embed):');
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  };

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className="px-2 py-1 border-b border-line/40 flex items-center gap-0.5 flex-wrap bg-bg-soft/40">
      <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
        <span className="font-bold">B</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
        <span className="italic">I</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
        <span className="underline">U</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
        <span className="line-through">S</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Highlight">
        <span className="bg-yellow-400/40 px-0.5 rounded">H</span>
      </ToolBtn>

      <Sep />

      {!compact && (
        <>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading">
            H2
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Sub-heading">
            H3
          </ToolBtn>
          <Sep />
        </>
      )}

      <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
        •
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered list">
        1.
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="Checklist">
        ☑
      </ToolBtn>

      <Sep />

      <ToolBtn onClick={insertLink} active={editor.isActive('link')} title="Insert link / YouTube URL">
        🔗
      </ToolBtn>
      <ToolBtn onClick={insertImage} title="Insert image">
        🖼
      </ToolBtn>

      {!compact && (
        <>
          <Sep />
          <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">
            ❝
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code block">
            {'</>'}
          </ToolBtn>
        </>
      )}
    </div>
  );
}

// ─── Render description HTML with YouTube auto-embed ─────────────────────────
/** Renders saved HTML content with YouTube links auto-embedded as iframes.
 *  Pass `embedMedia={false}` to skip YouTube/image embeds (e.g. in collapsed view). */
export function RichTextDisplay({
  html,
  className,
  embedMedia = true,
}: {
  html: string;
  className?: string;
  /** When false, YouTube links render as plain links (no iframe). Default true. */
  embedMedia?: boolean;
}) {
  const processed = embedMedia
    ? html.replace(
        /<a[^>]*href="(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)[^"]*)"[^>]*>([^<]*)<\/a>/gi,
        (_match, _url, videoId) =>
          `<div class="yt-embed"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`,
      )
    : html;

  return (
    <>
      <div
        className={cn('wl-rich-display prose prose-invert prose-sm max-w-none', className)}
        dangerouslySetInnerHTML={{ __html: processed }}
      />
      <style>{displayStyles}</style>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const editorStyles = `
  .wl-rich-editor .tiptap {
    outline: none;
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .wl-rich-editor .tiptap p { margin: 0.25em 0; }
  .wl-rich-editor .tiptap h2 { font-size: 1.1rem; font-weight: 600; margin: 0.5em 0 0.25em; }
  .wl-rich-editor .tiptap h3 { font-size: 0.95rem; font-weight: 600; margin: 0.4em 0 0.2em; }
  .wl-rich-editor .tiptap ul, .wl-rich-editor .tiptap ol { padding-left: 1.2em; margin: 0.25em 0; }
  .wl-rich-editor .tiptap ul { list-style: disc; }
  .wl-rich-editor .tiptap ol { list-style: decimal; }
  .wl-rich-editor .tiptap li { margin: 0.1em 0; }
  .wl-rich-editor .tiptap ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  .wl-rich-editor .tiptap ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.4em; }
  .wl-rich-editor .tiptap ul[data-type="taskList"] li label input[type="checkbox"] { margin-top: 0.2em; }
  .wl-rich-editor .tiptap blockquote { border-left: 3px solid var(--color-line, #374151); padding-left: 0.75em; margin: 0.5em 0; opacity: 0.85; }
  .wl-rich-editor .tiptap pre { background: var(--color-bg-soft, #1e293b); border-radius: 0.375rem; padding: 0.75em; font-size: 0.8rem; overflow-x: auto; margin: 0.5em 0; }
  .wl-rich-editor .tiptap code { background: var(--color-bg-soft, #1e293b); padding: 0.15em 0.3em; border-radius: 0.25rem; font-size: 0.85em; }
  .wl-rich-editor .tiptap pre code { background: none; padding: 0; }
  .wl-rich-editor .tiptap mark { background: #fbbf24; color: #1e293b; padding: 0.1em 0.2em; border-radius: 0.15em; }
  .wl-rich-editor .tiptap img { max-width: 100%; height: auto; border-radius: 0.375rem; margin: 0.5em 0; }
  .wl-rich-editor .tiptap a { color: var(--color-accent, #6366f1); text-decoration: underline; }
  .wl-rich-editor .tiptap .is-empty::before { content: attr(data-placeholder); color: var(--color-ink-muted, #64748b); pointer-events: none; float: left; height: 0; }
  .wl-rich-editor .tiptap hr { border-color: var(--color-line, #374151); margin: 0.75em 0; }
`;

const displayStyles = `
  .wl-rich-display p { margin: 0.25em 0; }
  .wl-rich-display h2 { font-size: 1.1rem; font-weight: 600; margin: 0.5em 0 0.25em; }
  .wl-rich-display h3 { font-size: 0.95rem; font-weight: 600; margin: 0.4em 0 0.2em; }
  .wl-rich-display ul, .wl-rich-display ol { padding-left: 1.2em; margin: 0.25em 0; }
  .wl-rich-display ul { list-style: disc; }
  .wl-rich-display ol { list-style: decimal; }
  .wl-rich-display blockquote { border-left: 3px solid var(--color-line, #374151); padding-left: 0.75em; margin: 0.5em 0; opacity: 0.85; }
  .wl-rich-display a { color: var(--color-accent, #6366f1); text-decoration: underline; }
  .wl-rich-display img { max-width: 100%; height: auto; border-radius: 0.375rem; margin: 0.5em 0; }
  .wl-rich-display mark { background: #fbbf24; color: #1e293b; padding: 0.1em 0.2em; border-radius: 0.15em; }
  .wl-rich-display .yt-embed { position: relative; width: 320px; max-width: 100%; aspect-ratio: 16/9; overflow: hidden; margin: 0.5em 0; border-radius: 0.375rem; }
  .wl-rich-display .yt-embed iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 0.375rem; }
`;
