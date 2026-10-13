import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({
  title,
  close,
  children,
  wide = false,
  error = "",
  pinned = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
  error?: string;
  /** Account workspace remains open until its explicit close button is activated. */
  pinned?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? " wide" : ""}${pinned ? " pinned" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!pinned) close();
      }}
      onClick={(e) => {
        if (!pinned && e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={close} aria-label="Close dialog">
          <X size={22} />
        </button>
      </div>
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
