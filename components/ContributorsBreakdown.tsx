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
        <div className="card p-4">
            <h3 className="section-header">{title}</h3>
            <div className="space-y-3">
                {contributors.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-text-secondary">{item.label}</span>
                            <span className="metric-value text-text-primary">
                                {item.value ?? '--'}
                            </span>
                        </div>
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{
                                    width: `${item.value ?? 0}%`,
                                    backgroundColor: item.color
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ContributorsBreakdown;
