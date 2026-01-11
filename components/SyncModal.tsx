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
        <IOSModal isOpen={isOpen} onClose={canClose ? onClose : () => {}}>
            <div className="space-y-4">
                {/* Current Step */}
                <p className="text-[#A0A0A0]">
                    {progress.currentStep}
                </p>

                {/* Progress Bar */}
                <div className="h-3 bg-[#1C1C1C] rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-300 rounded-full ${progress.status === 'complete' ? 'bg-[#34D399]' :
                            progress.status === 'error' ? 'bg-[#FF453A]' :
                                'bg-[#00C896]'
                            }`}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                {/* Details */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-[#666666]">{progress.details}</span>
                    <span className="text-[#666666] font-mono">
                        {progress.stepsCompleted}/{progress.totalSteps}
                    </span>
                </div>

                {/* Error message */}
                {progress.error && (
                    <p className="mt-3 text-sm text-[#FF453A]">
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
