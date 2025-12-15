import React from 'react';
import { BiDirectionalBar } from './BiDirectionalBar';

interface Props {
    label: string;
    valA: number | undefined | string | null;
    valB: number | undefined | string | null;
    unit?: string;
    inverse?: boolean; // True if lower is better (e.g., Resting HR)
    max?: number;
}

const ComparisonRow: React.FC<Props> = ({ label, valA, valB, unit = '', inverse, max }) => {
    if (valA === undefined || valB === undefined || valA === null || valB === null) return null;

    // Ensure values are numbers for comparison
    const numA = typeof valA === 'string' ? parseFloat(valA) : valA;
    const numB = typeof valB === 'string' ? parseFloat(valB) : valB;

    if (isNaN(numA) || isNaN(numB)) return null;

    // Use provided max or calculate reasonable max based on values
    // If no max provided, use the larger value + 10% padding
    const activeMax = max || (Math.max(numA, numB) * 1.1) || 100;

    return (
        <div className="mb-2">
            <BiDirectionalBar
                label={label}
                leftValue={numA}
                rightValue={numB}
                unit={unit}
                max={activeMax}
                inverse={inverse}
            />
        </div>
    );
};

export default ComparisonRow;
