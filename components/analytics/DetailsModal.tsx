import React from 'react';
import { Calendar, X } from 'lucide-react';

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
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[var(--bg-void)]/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative card w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in-up border border-[var(--border-default)] shadow-2xl bg-[var(--bg-elevated)]">
                {/* Header */}
                <div className="p-6 border-b border-[var(--border-subtle)]">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                                {title}
                            </h3>
                            {subtitle && (
                                <p className="text-[var(--accent)] text-sm font-medium mt-1">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <p className="text-[var(--text-secondary)] mb-6">
                        {description}
                    </p>

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
                                            {new Date(date).toLocaleDateString(undefined, {
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
            </div>
        </div>
    );
};

export default DetailsModal;
