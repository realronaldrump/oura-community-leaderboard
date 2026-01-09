import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
    title: string;
    description: string;
    calculation?: string;
    className?: string;
}

/**
 * A mobile-friendly info tooltip that shows on hover (desktop) or tap (mobile).
 * Displays a title, description, and optional calculation explanation.
 */
const InfoTooltip: React.FC<InfoTooltipProps> = ({
    title,
    description,
    calculation,
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Close tooltip when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                tooltipRef.current &&
                !tooltipRef.current.contains(event.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen]);

    return (
        <div className={`relative inline-flex ${className}`}>
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                onMouseEnter={() => setIsOpen(true)}
                onMouseLeave={() => setIsOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                aria-label={`Info about ${title}`}
                aria-expanded={isOpen}
            >
                <Info className="w-4 h-4 text-[var(--text-muted)] hover:text-[var(--text-secondary)]" />
            </button>

            {/* Tooltip content */}
            <div
                ref={tooltipRef}
                className={`absolute z-50 transition-all duration-200 ${isOpen
                        ? 'opacity-100 translate-y-0 pointer-events-auto'
                        : 'opacity-0 translate-y-1 pointer-events-none'
                    }`}
                style={{
                    top: 'calc(100% + 8px)',
                    left: '50%',
                    transform: `translateX(-50%) ${isOpen ? 'translateY(0)' : 'translateY(4px)'}`,
                    minWidth: '240px',
                    maxWidth: '320px'
                }}
            >
                {/* Arrow */}
                <div
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[var(--bg-elevated)] border-l border-t border-[var(--border-default)]"
                />

                {/* Content */}
                <div className="relative bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-xl overflow-hidden">
                    <div className="p-3">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                            {title}
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            {description}
                        </p>
                        {calculation && (
                            <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
                                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                                    How it's calculated
                                </p>
                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                    {calculation}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InfoTooltip;
