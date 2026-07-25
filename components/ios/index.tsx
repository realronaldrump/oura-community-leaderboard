import React from 'react';
import { Button, Dialog } from '../ui';

interface IOSButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive';
  size?: 'small' | 'medium' | 'large';
  children: React.ReactNode;
}

/** Compatibility adapter for detail views that have not migrated their prop names yet. */
export const IOSButton: React.FC<IOSButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  children,
  className = '',
  ...props
}) => (
  <Button
    variant={variant === 'destructive' ? 'danger' : variant}
    size={size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'md'}
    className={className}
    {...props}
  >
    {children}
  </Button>
);

interface IOSListItemProps {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
}

export const IOSListItem: React.FC<IOSListItemProps> = ({
  title,
  subtitle,
  rightElement,
  onClick,
  icon,
}) => {
  const content = (
    <div className="flex w-full items-center gap-3 text-left">
      {icon ? <div className="grid min-h-11 min-w-11 place-items-center">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{title}</div>
        {subtitle ? <div className="text-sm text-ink-muted">{subtitle}</div> : null}
      </div>
      {rightElement ? <div className="grid min-h-11 min-w-11 place-items-center">{rightElement}</div> : null}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" className="detail-list-item w-full px-4 py-3" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className="detail-list-item px-4 py-3">{content}</div>;
};

interface IOSModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  busy?: boolean;
}

export const IOSModal: React.FC<IOSModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  dismissible,
  busy,
}) => (
  <Dialog
    isOpen={isOpen}
    onClose={onClose}
    title={title || 'Details'}
    dismissible={dismissible}
    busy={busy}
  >
    {children}
  </Dialog>
);
