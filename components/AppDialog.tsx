import React from 'react';
import { Button, Dialog } from './ui';

type DialogIntent = 'info' | 'destructive';

interface AppDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    intent?: DialogIntent;
    confirmText?: string;
    cancelText?: string;
    confirmDisabled?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
}

const AppDialog: React.FC<AppDialogProps> = ({
    isOpen,
    title,
    message,
    intent = 'info',
    confirmText = 'OK',
    cancelText = 'Cancel',
    confirmDisabled = false,
    onConfirm,
    onCancel,
}) => {
    return (
        <Dialog isOpen={isOpen} onClose={onCancel || onConfirm} title={title}>
            <div className="space-y-5">
                <div
                    className={`rounded-lg border p-4 ${intent === 'destructive'
                        ? 'border-error/25 bg-error-soft'
                        : 'border-line bg-surface-raised'}`}
                >
                    <p className="m-0 text-sm leading-relaxed text-ink-secondary">{message}</p>
                </div>

                <div className={`grid gap-2 ${onCancel ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {onCancel && (
                        <Button
                            variant="secondary"
                            onClick={onCancel}
                            disabled={confirmDisabled}
                        >
                            {cancelText}
                        </Button>
                    )}
                    <Button
                        variant={intent === 'destructive' ? 'danger' : 'primary'}
                        onClick={onConfirm}
                        disabled={confirmDisabled}
                        data-autofocus={!onCancel ? true : undefined}
                    >
                        {confirmText}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
};

export default AppDialog;
