import React from 'react';
import { SyncProgress } from '../services/syncService';
import { IOSButton, IOSModal } from './ios';

interface SyncModalProps {
    isOpen: boolean;
    progress: SyncProgress;
    onClose: () => void;
}

const SyncModal: React.FC<SyncModalProps> = ({ isOpen, progress, onClose }) => {
    const progressPercent = progress.totalSteps > 0
        ? Math.round((progress.stepsCompleted / progress.totalSteps) * 100)
        : 0;

    const canClose = progress.status === 'complete' || progress.status === 'error';

    return (
        <IOSModal isOpen={isOpen} onClose={onClose} title="Sync Oura data" busy={!canClose}>
            <div className="space-y-4">
                {/* Current Step */}
                <p className="text-ink-secondary" aria-live="polite">
                    {progress.currentStep}
                </p>

                {/* Progress Bar */}
                <div
                    className="h-3 bg-surface-raised rounded-full overflow-hidden"
                    role="progressbar"
                    aria-label="Sync progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPercent}
                    aria-valuetext={`${progress.stepsCompleted} of ${progress.totalSteps} steps`}
                >
                    <div
                        className={`h-full transition-all duration-300 rounded-full ${progress.status === 'complete' ? 'bg-[#7BC4A0]' :
                            progress.status === 'error' ? 'bg-error' :
                                'bg-accent'
                            }`}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                {/* Details */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">{progress.details}</span>
                    <span className="text-ink-muted font-mono">
                        {progress.stepsCompleted}/{progress.totalSteps}
                    </span>
                </div>

                {/* Error message */}
                {progress.error && (
                    <p className="mt-3 text-sm text-error" role="alert">
                        {progress.error}
                    </p>
                )}

                {/* Close button when complete */}
                {canClose && (
                    <IOSButton
                        onClick={onClose}
                        className="w-full"
                        variant={progress.status === 'error' ? 'destructive' : 'primary'}
                    >
                        {progress.status === 'complete' ? 'Done' : 'Close'}
                    </IOSButton>
                )}
            </div>
        </IOSModal>
    );
};

export default SyncModal;
