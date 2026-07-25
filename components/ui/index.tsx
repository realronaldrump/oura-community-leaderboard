import React, {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react';
import { X } from 'lucide-react';

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      {...props}
    />
  );
});

export type CardVariant = 'default' | 'subtle' | 'elevated' | 'outlined';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', interactive = false, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('ui-card', `ui-card--${variant}`, interactive && 'ui-card--interactive', className)}
      {...props}
    />
  );
});

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';

export const Badge: React.FC<HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }> = ({
  tone = 'neutral',
  className,
  ...props
}) => <span className={cx('ui-badge', `ui-badge--${tone}`, className)} {...props} />;

export const Skeleton: React.FC<HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div aria-hidden="true" className={cx('ui-skeleton', className)} {...props} />
);

interface StatePanelProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  tone?: 'neutral' | 'error' | 'warning';
  headingLevel?: 'h1' | 'h2' | 'h3';
}

export const StatePanel: React.FC<StatePanelProps> = ({
  eyebrow,
  title,
  description,
  icon,
  action,
  tone = 'neutral',
  headingLevel = 'h2',
  className,
  ...props
}) => {
  const Heading = headingLevel;

  return (
    <div className={cx('ui-state', `ui-state--${tone}`, className)} {...props}>
      {icon ? <div className="ui-state__icon" aria-hidden="true">{icon}</div> : null}
      <div className="ui-state__content">
        {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
        <Heading className="ui-state__title">{title}</Heading>
        <p className="ui-state__description">{description}</p>
        {action ? <div className="ui-state__action">{action}</div> : null}
      </div>
    </div>
  );
};

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({ label, hint, error, children, className }) => (
  <label className={cx('ui-field', className)}>
    <span className="ui-field__label">{label}</span>
    {children}
    {error ? <span className="ui-field__error" role="alert">{error}</span> : null}
    {!error && hint ? <span className="ui-field__hint">{hint}</span> : null}
  </label>
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx('ui-input', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cx('ui-input ui-select', className)} {...props} />;
});

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('ui-segmented', className)} role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={cx('ui-segmented__item', active && 'is-active')}
            onClick={() => onChange(option.value)}
          >
            {option.icon ? <span aria-hidden="true">{option.icon}</span> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface DialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** Whether user-driven dismissal is allowed. Defaults to true. */
  dismissible?: boolean;
  /** Marks the dialog busy and temporarily blocks every dismissal affordance. */
  busy?: boolean;
}

const getFocusableElements = (container: HTMLElement): HTMLElement[] => Array.from(
  container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ),
).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  title,
  description,
  onClose,
  children,
  className,
  dismissible = true,
  busy = false,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const canDismiss = dismissible && !busy;
  const canDismissRef = useRef(canDismiss);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    canDismissRef.current = canDismiss;
  }, [canDismiss]);

  useEffect(() => {
    if (!isOpen) return undefined;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]');
      (preferred || getFocusableElements(panel)[0] || panel).focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (canDismissRef.current) onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = getFocusableElements(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="ui-dialog-backdrop"
      onMouseDown={(event) => {
        if (canDismiss && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cx('ui-dialog', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <header className="ui-dialog__header">
          <div>
            <h2 id={titleId} className="ui-dialog__title">{title}</h2>
            {description ? <p id={descriptionId} className="ui-dialog__description">{description}</p> : null}
          </div>
          {canDismiss ? (
            <Button variant="quiet" size="icon" onClick={onClose} aria-label={`Close ${title}`}>
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </header>
        <div className="ui-dialog__body">{children}</div>
      </div>
    </div>
  );
};
