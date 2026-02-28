import React from 'react';
import { IOSButton, IOSModal } from './ios';

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
    const panelClasses = intent === 'destructive'
        ? 'bg-[#2A1414] border border-[#7A2C2C]/50'
        : 'bg-[#121B1A] border border-[#1E5E4D]/50';

    return (
        <IOSModal isOpen={isOpen} onClose={onCancel || onConfirm} title={title}>
            <div className="space-y-5">
                <div className={`rounded-xl p-3 ${panelClasses}`}>
                    <p className="text-sm text-[#D4D4D4] leading-relaxed">{message}</p>
                </div>

                <div className={`grid gap-2 ${onCancel ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {onCancel && (
                        <IOSButton
                            variant="secondary"
                            onClick={onCancel}
                            disabled={confirmDisabled}
                        >
                            {cancelText}
                        </IOSButton>
                    )}
                    <IOSButton
                        variant={intent === 'destructive' ? 'destructive' : 'primary'}
                        onClick={onConfirm}
                        disabled={confirmDisabled}
                    >
                        {confirmText}
                    </IOSButton>
                </div>
            </div>
        </IOSModal>
    );
};

export default AppDialog;
