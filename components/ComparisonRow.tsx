import React from 'react';
import { BiDirectionalBar } from './BiDirectionalBar';

interface Props {
    label: string;
    valA: number | undefined | string | null;
    valB: number | undefined | string | null;
    displayA?: string | number | null;
    displayB?: string | number | null;
    unit?: string;
    inverse?: boolean; // True if lower is better (e.g., Resting HR)
    max?: number;
}

const ComparisonRow: React.FC<Props> = ({ label, valA, valB, displayA, displayB, unit = '', inverse, max }) => {
    if (valA === undefined || valB === undefined || valA === null || valB === null) return null;

    // Ensure values are numbers for comparison
    const numA = typeof valA === 'string' ? parseFloat(valA) : valA;
    const numB = typeof valB === 'string' ? parseFloat(valB) : valB;

    if (isNaN(numA) || isNaN(numB)) return null;

    // Use provided max or calculate reasonable max based on values
    const activeMax = max || (Math.max(numA, numB) * 1.1) || 100;

    // Determine winner for highlighting raw values
    const leftWins = inverse ? numA < numB : numA > numB;
    const isTie = numA === numB;

    return (
        <div className="mb-6">
            {/* Metric Label */}
            <div className="text-center text-xs text-text-muted uppercase tracking-wider font-semibold mb-2">
                {label}
            </div>

            {/* Values Row */}
            <div className="flex justify-between items-end mb-2 px-1">
                {/* Left Side (User A) */}
                <div className="flex flex-col items-start gap-1">
                    <span className={`text-lg font-bold font-mono ${leftWins && !isTie ? 'text-accent-green' : 'text-text-primary'}`}>
                        {displayA ?? '--'} <span className="text-xs text-text-muted font-normal">{unit}</span>
                    </span>
                    <span className="text-xs text-text-dim px-2 py-0.5 rounded bg-white/5 border border-white/5">
                        Score: <span className={leftWins ? 'text-accent-green' : ''}>{numA}</span>
                    </span>
                </div>

                {/* Right Side (User B) */}
                <div className="flex flex-col items-end gap-1">
                    <span className={`text-lg font-bold font-mono ${!leftWins && !isTie ? 'text-accent-purple' : 'text-text-primary'}`}>
                        {displayB ?? '--'} <span className="text-xs text-text-muted font-normal">{unit}</span>
                    </span>
                    <span className="text-xs text-text-dim px-2 py-0.5 rounded bg-white/5 border border-white/5">
                        Score: <span className={!leftWins && !isTie ? 'text-accent-purple' : ''}>{numB}</span>
                    </span>
                </div>
            </div>

            {/* Visual Bar (Score Comparison) */}
            <BiDirectionalBar
                leftValue={numA}
                rightValue={numB}
                showLabels={false} // We handle labels above now
                max={activeMax}
                inverse={inverse}
            />
        </div>
    );
};

export default ComparisonRow;
