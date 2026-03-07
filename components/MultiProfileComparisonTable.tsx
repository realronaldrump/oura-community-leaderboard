import React, { CSSProperties } from 'react';

export interface ComparisonColumn {
    id: string;
    name: string;
    color: string;
    score?: number | null;
}

export interface ComparisonCell {
    value?: number | string | null;
    display?: string | number | null;
    caption?: string | null;
}

export interface ComparisonRow {
    label: string;
    inverse?: boolean;
    cells: Record<string, ComparisonCell>;
}

interface MultiProfileComparisonTableProps {
    title: string;
    subtitle?: string;
    columns: ComparisonColumn[];
    rows: ComparisonRow[];
}

const toNumber = (value: number | string | null | undefined): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const scoresMatch = (left: number, right: number): boolean => Math.abs(left - right) < 0.0001;

const MultiProfileComparisonTable: React.FC<MultiProfileComparisonTableProps> = ({
    title,
    subtitle,
    columns,
    rows,
}) => {
    const gridStyle: CSSProperties = {
        gridTemplateColumns: `minmax(11rem, 1.1fr) repeat(${columns.length}, minmax(8.5rem, 1fr))`,
        minWidth: `${Math.max(40, 14 + (columns.length * 9))}rem`,
    };

    return (
        <section className="overflow-hidden rounded-[1.25rem] border border-[#222] bg-[#141414]">
            <div className="border-b border-[#222] px-4 py-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold tracking-tight text-[#FAFAFA]">{title}</h3>
                        {subtitle ? <p className="mt-1 text-sm text-[#8A8A8A]">{subtitle}</p> : null}
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[#666]">
                        {columns.length} participants
                    </p>
                </div>
            </div>

            <div className="overflow-x-auto">
                <div className="grid" style={gridStyle}>
                    <div className="border-b border-[#222] bg-[#101010] px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[#666]">
                        Metric
                    </div>
                    {columns.map((column) => (
                        <div
                            key={column.id}
                            className="border-b border-l border-[#222] bg-[#101010] px-4 py-3"
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: column.color }}
                                />
                                <p className="truncate text-sm font-semibold text-[#FAFAFA]">{column.name}</p>
                            </div>
                            <p className="mt-1 font-mono text-xs text-[#8A8A8A]">
                                {column.score != null ? `Score ${column.score}` : 'No score'}
                            </p>
                        </div>
                    ))}

                    {rows.map((row) => {
                        const numericValues = columns
                            .map((column) => toNumber(row.cells[column.id]?.value))
                            .filter((value): value is number => value != null);
                        const bestValue = numericValues.length > 0
                            ? (row.inverse ? Math.min(...numericValues) : Math.max(...numericValues))
                            : null;

                        return (
                            <React.Fragment key={row.label}>
                                <div className="border-b border-[#1D1D1D] bg-[#121212] px-4 py-4">
                                    <p className="text-sm font-medium text-[#FAFAFA]">{row.label}</p>
                                    <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#666]">
                                        {row.inverse ? 'Lower is better' : 'Higher is better'}
                                    </p>
                                </div>
                                {columns.map((column) => {
                                    const cell = row.cells[column.id];
                                    const numericValue = toNumber(cell?.value);
                                    const isBest = bestValue != null && numericValue != null && scoresMatch(numericValue, bestValue);
                                    const displayValue = cell?.display ?? (numericValue != null ? numericValue.toLocaleString() : '--');

                                    return (
                                        <div
                                            key={`${row.label}-${column.id}`}
                                            className="border-b border-l border-[#1D1D1D] px-3 py-3"
                                        >
                                            <div
                                                className={`rounded-xl border px-3 py-3 transition-colors ${
                                                    isBest ? 'bg-white/5' : 'bg-[#111111]'
                                                }`}
                                                style={{
                                                    borderColor: isBest ? `${column.color}55` : '#222222',
                                                    boxShadow: isBest ? `inset 0 0 0 1px ${column.color}22` : 'none',
                                                }}
                                            >
                                                <p
                                                    className="text-sm font-semibold text-[#FAFAFA]"
                                                    style={{ color: isBest ? column.color : '#FAFAFA' }}
                                                >
                                                    {displayValue}
                                                </p>
                                                <p className="mt-1 text-[11px] leading-relaxed text-[#7A7A7A]">
                                                    {cell?.caption || (numericValue != null ? `Value ${numericValue.toLocaleString()}` : 'No data')}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export default MultiProfileComparisonTable;
