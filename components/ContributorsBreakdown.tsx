import React from 'react';

interface ContributorItem {
    label: string;
    value: number | null | undefined;
    color: string;
}

interface Props {
    title: string;
    contributors: ContributorItem[];
}

const ContributorsBreakdown: React.FC<Props> = ({ title, contributors }) => {
    return (
        <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-6">{title}</h3>
            <div className="space-y-4">
                {contributors.map((item, idx) => (
                    <div key={idx} className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-text-secondary">{item.label}</span>
                            <span className="font-mono font-medium text-text-primary">
                                {item.value ?? '--'}
                            </span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-700 ease-out relative"
                                style={{
                                    width: `${item.value ?? 0}%`,
                                    backgroundColor: item.color,
                                    boxShadow: `0 0 10px ${item.color}60`,
                                }}
                            >
                                {/* Shimmer effect */}
                                <div
                                    className="absolute inset-0 animate-shimmer"
                                    style={{
                                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                                        backgroundSize: '200% 100%',
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ContributorsBreakdown;
