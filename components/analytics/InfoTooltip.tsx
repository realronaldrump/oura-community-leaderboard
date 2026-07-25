import React, { useState, useRef, useEffect, useId, useLayoutEffect } from 'react';
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
    const tooltipId = useId();
    const tooltipRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [horizontalOffset, setHorizontalOffset] = useState(0);
    const horizontalOffsetRef = useRef(0);

    useLayoutEffect(() => {
        if (!isOpen) {
            horizontalOffsetRef.current = 0;
            setHorizontalOffset(0);
            return undefined;
        }

        const clampToViewport = () => {
            const tooltip = tooltipRef.current;
            if (!tooltip) return;
            const margin = 16;
            const rect = tooltip.getBoundingClientRect();
            let adjustment = 0;
            if (rect.left < margin) adjustment += margin - rect.left;
            if (rect.right > window.innerWidth - margin) adjustment -= rect.right - (window.innerWidth - margin);
            if (Math.abs(adjustment) > 0.5) {
                horizontalOffsetRef.current += adjustment;
                setHorizontalOffset(horizontalOffsetRef.current);
            }
        };

        clampToViewport();
        window.addEventListener('resize', clampToViewport);
        return () => window.removeEventListener('resize', clampToViewport);
    }, [isOpen]);

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
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                onMouseEnter={() => setIsOpen(true)}
                onMouseLeave={() => setIsOpen(false)}
                className="grid min-h-11 min-w-11 place-items-center rounded-full transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                aria-label={`Info about ${title}`}
                aria-expanded={isOpen}
                aria-controls={isOpen ? tooltipId : undefined}
            >
                <Info className="w-4 h-4 text-[var(--text-muted)] hover:text-[var(--text-secondary)]" aria-hidden="true" />
            </button>

            {/* Do not leave a visually hidden wide box in document geometry. */}
            {isOpen ? <div
                id={tooltipId}
                ref={tooltipRef}
                role="tooltip"
                className="absolute z-50 pointer-events-auto"
                style={{
                    top: 'calc(100% + 8px)',
                    left: '50%',
                    transform: `translateX(calc(-50% + ${horizontalOffset}px))`,
                    width: 'min(240px, calc(100vw - 32px))',
                    maxWidth: '320px'
                }}
            >
                {/* Arrow */}
                <div
                    className="absolute -top-1.5 -translate-x-1/2 w-3 h-3 rotate-45 bg-[var(--bg-elevated)] border-l border-t border-[var(--border-default)]"
                    style={{ left: `calc(50% - ${horizontalOffset}px)` }}
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
            </div> : null}
        </div>
    );
};

export default InfoTooltip;
