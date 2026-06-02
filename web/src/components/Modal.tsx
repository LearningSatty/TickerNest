/**
 * Minimal modal dialog. Click backdrop or Esc to close. No external deps.
 */
import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Footer content (typically Cancel/Confirm buttons). */
  footer?: React.ReactNode;
}

export default function Modal({ open, onClose, title, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-line bg-bg-soft shadow-xl"
      >
        {title && (
          <header className="px-5 py-3 border-b border-line/60">
            <h2 className="text-sm font-semibold">{title}</h2>
          </header>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line/60 flex justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}
