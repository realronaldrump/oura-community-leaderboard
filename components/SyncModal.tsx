import React from 'react';
import { SyncProgress } from '../services/syncService';

interface SyncModalProps {
    isOpen: boolean;
    progress: SyncProgress;
    onClose: () => void;
}

const SyncModal: React.FC<SyncModalProps> = ({ isOpen, progress, onClose }) => {
    if (!isOpen) return null;

    const progressPercent = progress.totalSteps > 0
        ? Math.round((progress.stepsCompleted / progress.totalSteps) * 100)
        : 0;

    const canClose = progress.status === 'complete' || progress.status === 'error';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-void/80 backdrop-blur-sm"
                onClick={canClose ? onClose : undefined}
            />

            {/* Modal */}
            <div className="relative glass-card p-6 w-full max-w-sm animate-fade-in-up">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-text-primary">
                        {progress.status === 'complete' ? '✓ Sync Complete' :
                            progress.status === 'error' ? 'Sync Error' :
                                'Syncing Data'}
                    </h3>
                    {canClose && (
                        <button
                            onClick={onClose}
                            className="text-text-muted hover:text-text-primary transition-colors"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Current Step */}
                <p className="text-text-secondary mb-2">
                    {progress.currentStep}
                </p>

                {/* Progress Bar */}
                <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                    <div
                        className={`h-full transition-all duration-300 rounded-full ${progress.status === 'complete' ? 'bg-accent-green' :
                                progress.status === 'error' ? 'bg-accent-rose' :
                                    'bg-accent-cyan'
                            }`}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                {/* Details */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">{progress.details}</span>
                    <span className="text-text-dim font-mono">
                        {progress.stepsCompleted}/{progress.totalSteps}
                    </span>
                </div>

                {/* Error message */}
                {progress.error && (
                    <p className="mt-3 text-sm text-accent-rose">
                        {progress.error}
                    </p>
                )}

                {/* Close button when complete */}
                {canClose && (
                    <button
                        onClick={onClose}
                        className="mt-4 w-full btn-primary py-2"
                    >
                        {progress.status === 'complete' ? 'Done' : 'Close'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default SyncModal;
