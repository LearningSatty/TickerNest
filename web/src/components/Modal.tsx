/**
 * Minimal modal dialog. Click backdrop or Esc to close. No external deps.
 */
import { useEffect } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Footer content (typically Cancel/Confirm buttons). */
  footer?: React.ReactNode;
  /** Use 'lg' for wider modals (e.g. rich text editor). Default 'md'. */
  size?: 'sm' | 'md' | 'lg';
}

export default function Modal({ open, onClose, title, children, footer, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn('w-full rounded-xl border border-line bg-bg-soft shadow-xl max-h-[90vh] flex flex-col', sizeClass)}
      >
        {title && (
          <header className="px-5 py-3 border-b border-line/60 shrink-0">
            <h2 className="text-sm font-semibold">{title}</h2>
          </header>
        )}
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line/60 flex justify-end gap-2 shrink-0">{footer}</footer>}
      </div>
    </div>
  );
}
