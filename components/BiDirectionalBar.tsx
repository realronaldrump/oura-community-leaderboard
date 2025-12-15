import React from 'react';
import { motion } from 'framer-motion';

interface BiDirectionalBarProps {
    leftValue: number;
    rightValue: number;
    leftLabel?: string;
    rightLabel?: string;
    label: string;
    max: number; // The max value for the scale (e.g. 100 for scores, or max observed for others)
    unit?: string;
    inverse?: boolean; // If true, lower is better (e.g. resting heart rate)
}

export const BiDirectionalBar: React.FC<BiDirectionalBarProps> = ({
    leftValue,
    rightValue,
    leftLabel,
    rightLabel,
    label,
    max,
    unit = '',
    inverse = false,
}) => {
    // Determine winner
    const leftWins = inverse ? leftValue < rightValue : leftValue > rightValue;
    const isTie = leftValue === rightValue;

    // Calculate percentages for bar width
    // We want the bar to represent the value relative to the max.
    // Center is 0.
    const leftPercent = Math.min((leftValue / max) * 100, 100);
    const rightPercent = Math.min((rightValue / max) * 100, 100);

    return (
        <div className="w-full py-2">
            <div className="flex justify-between text-xs text-text-muted mb-1 px-1">
                <span className={leftWins && !isTie ? 'text-accent-green font-bold' : ''}>
                    {leftLabel || leftValue} {unit}
                </span>
                <span className="font-semibold text-text-primary uppercase tracking-wider text-[10px]">{label}</span>
                <span className={!leftWins && !isTie ? 'text-accent-purple font-bold' : ''}>
                    {rightLabel || rightValue} {unit}
                </span>
            </div>

            <div className="relative h-3 bg-dashboard-card rounded-full flex overflow-hidden">
                {/* Center marker */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-dashboard-border z-10 opacity-50"></div>

                {/* Left Bar (User A) - Grows right-to-left from center */}
                <div className="w-1/2 flex justify-end">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${leftPercent}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className={`h-full rounded-l-full ${leftWins ? 'bg-accent-green' : 'bg-dashboard-text/20'}`}
                    />
                </div>

                {/* Right Bar (User B) - Grows left-to-right from center */}
                <div className="w-1/2 flex justify-start">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${rightPercent}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className={`h-full rounded-r-full ${!leftWins && !isTie ? 'bg-accent-purple' : 'bg-dashboard-text/20'}`}
                    />
                </div>
            </div>
        </div>
    );
};
