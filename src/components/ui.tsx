import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
let pointerOrigin: HTMLElement | null = null;
/** Safari does not focus a button on pointer activation; remember its actual trigger. */
export function useDialogFocusOrigin() {
  useEffect(() => {
    const remember = (event: PointerEvent) => {
      if (document.querySelector('dialog[open]')) return;
      pointerOrigin =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              'button, a[href], input, select, textarea, [tabindex]',
            )
          : null;
    };
    const keyboard = () => {
      pointerOrigin = null;
    };
    document.addEventListener('pointerdown', remember, true);
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('pointerdown', remember, true);
      document.removeEventListener('keydown', keyboard, true);
      pointerOrigin = null;
    };
  }, []);
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  dirty = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  dirty?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  const [confirmClose, setConfirmClose] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const requestClose = () => {
    if (!dirty) {
      onClose();
      return;
    }
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmClose(true);
  };
  useEffect(() => {
    closeRef.current = requestClose;
  }, [onClose, dirty]);
  useEffect(() => {
    const d = ref.current;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opener = pointerOrigin?.isConnected ? pointerOrigin : focused;
    d?.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    d?.addEventListener('cancel', cancel);
    return () => {
      d?.removeEventListener('cancel', cancel);
      d?.close();
      queueMicrotask(() => {
        if (opener?.isConnected && !opener.closest('[inert]')) opener.focus();
        else document.querySelector<HTMLElement>('.page-heading h1')?.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const items = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
          ),
        ].filter(
          (item) => item.tabIndex >= 0 && item.getClientRects().length && !item.closest('[inert]'),
        );
        if (
          event.shiftKey &&
          (document.activeElement === items[0] ||
            !items.includes(document.activeElement as HTMLElement))
        ) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === items.at(-1) ||
            !items.includes(document.activeElement as HTMLElement))
        ) {
          event.preventDefault();
          items[0]?.focus();
        }
      }}
      onClickCapture={(event) => {
        if (dirty && (event.target as HTMLElement).closest('[data-close-dialog]')) {
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={requestClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </header>
      {confirmClose && (
        <div className="notice warning discard-confirmation" role="alert">
          <strong>Discard unfinished entries?</strong>
          <p>Your entries remain here until you confirm or discard them.</p>
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              autoFocus
              onClick={() => {
                setConfirmClose(false);
                queueMicrotask(() => returnFocus.current?.focus());
              }}
            >
              Keep editing
            </button>
            <button type="button" className="button secondary" onClick={onClose}>
              Discard entries
            </button>
          </div>
        </div>
      )}
      {children}
    </dialog>
  );
}
export function Field({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  error?: string;
}) {
  const fieldId = useId();
  const directControl =
    isValidElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>(
      children,
    ) &&
    typeof children.type === 'string' &&
    ['input', 'select', 'textarea'].includes(children.type)
      ? children
      : null;
  const controlId = directControl?.props.id ?? `${fieldId}-control`;
  const descriptionId = `${fieldId}-description`;
  return (
    <div className={`field ${error ? 'invalid' : ''}`}>
      {directControl ? (
        <label className="field-caption" htmlFor={controlId}>
          {label}
        </label>
      ) : (
        <div className="field-caption">{label}</div>
      )}
      {directControl
        ? cloneElement(directControl, {
            id: controlId,
            'aria-invalid': !!error || directControl.props['aria-invalid'],
            'aria-describedby':
              [directControl.props['aria-describedby'], hint || error ? descriptionId : undefined]
                .filter(Boolean)
                .join(' ') || undefined,
          })
        : children}
      {error ? (
        <p id={descriptionId} className="field-error" role="status">
          {error}
        </p>
      ) : hint ? (
        <p id={descriptionId} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  error,
  id,
  disabled = false,
  step = '0.01',
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  error?: string;
  id: string;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <div className={`field ${error ? 'invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="number-input">
        {prefix && <span>{prefix}</span>}
        <input
          id={id}
          type="text"
          maxLength={1000}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={hint || error ? `${id}-hint` : undefined}
          data-step={step}
        />
        {suffix && <span>{suffix}</span>}
      </div>
      {(error || hint) && (
        <p id={`${id}-hint`} className={error ? 'field-error' : 'field-hint'}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
