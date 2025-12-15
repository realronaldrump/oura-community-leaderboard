import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ComparisonRow from './ComparisonRow';

interface MetricData {
    label: string;
    valA: number | string | undefined | null;
    valB: number | string | undefined | null;
    unit?: string;
    inverse?: boolean;
    max?: number;
}

interface Props {
    title: string;
    scoreA?: number | null;
    scoreB?: number | null;
    metrics: MetricData[];
    defaultOpen?: boolean;
}

const MetricComparisonGroup: React.FC<Props> = ({ title, scoreA, scoreB, metrics, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    // Calculate winner for the group header
    const scoreAWins = (scoreA || 0) > (scoreB || 0);
    const scoreBWins = (scoreB || 0) > (scoreA || 0);

    return (
        <div className="bg-dashboard-card border border-dashboard-border rounded-xl overflow-hidden mb-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-dashboard-card/50 hover:bg-dashboard-card/80 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    <h3 className="font-semibold text-lg">{title}</h3>
                </div>

                {(scoreA !== undefined && scoreB !== undefined) && (
                    <div className="flex items-center gap-4 text-sm font-mono">
                        <span className={scoreAWins ? 'text-accent-green font-bold' : 'text-text-muted'}>
                            {scoreA ?? '--'}
                        </span>
                        <span className="text-xs text-text-muted">VS</span>
                        <span className={scoreBWins ? 'text-accent-purple font-bold' : 'text-text-muted'}>
                            {scoreB ?? '--'}
                        </span>
                    </div>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="p-4 border-t border-dashboard-border space-y-1">
                            {metrics.map((metric, idx) => (
                                <ComparisonRow
                                    key={idx}
                                    {...metric}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MetricComparisonGroup;
