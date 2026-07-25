import React from 'react';
import { Calendar } from 'lucide-react';
import { formatISODateForDisplay } from '../../utils/date';
import { Dialog } from '../ui';

interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    description: string;
    stats: Array<{ label: string; value: string | number; subValue?: string }>;
    dates?: string[]; // List of dates involved
    datesTitle?: string;
}

const DetailsModal: React.FC<DetailsModalProps> = ({
    isOpen, onClose, title, subtitle, description, stats, dates, datesTitle = 'Contributing Days'
}) => {
    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            description={subtitle || description}
        >
            <div className="overflow-y-auto custom-scrollbar">
                    {subtitle ? (
                        <p className="text-[var(--text-secondary)] mb-6">
                            {description}
                        </p>
                    ) : null}

                    {/* Stats Grid */}
                    {stats.length > 0 && (
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            {stats.map((stat, idx) => (
                                <div key={idx} className="bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-subtle)]">
                                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
                                        {stat.label}
                                    </p>
                                    <p className="text-lg font-mono font-bold text-[var(--text-primary)]">
                                        {stat.value}
                                    </p>
                                    {stat.subValue && (
                                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                                            {stat.subValue}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Dates List (if provided) */}
                    {dates && dates.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-[var(--accent)]" />
                                {datesTitle} ({dates.length})
                            </h4>
                            <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-subtle)] max-h-48 overflow-y-auto">
                                {dates.map((date, idx) => (
                                    <div
                                        key={date}
                                        className={`px-4 py-2 text-sm flex justify-between items-center ${idx !== dates.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''
                                            }`}
                                    >
                                        <span className="text-[var(--text-secondary)] font-mono">
                                            {formatISODateForDisplay(date, undefined, {
                                                weekday: 'short',
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </span>
                                        <span className="text-[var(--text-muted)] text-xs">
                                            #{idx + 1}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
            </div>
        </Dialog>
    );
};

export default DetailsModal;
