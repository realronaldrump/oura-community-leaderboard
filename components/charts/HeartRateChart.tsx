import React, { useMemo, useState } from 'react';
import { HeartRate } from '../../types';
import { formatMetricValue } from '../../domain/metrics';
import { getDataAwareChartDomain } from '../../utils/chartScale';
import { parseUtcOffsetMinutesFromIso } from '../../utils/temporal';

interface Props {
    data: HeartRate[];
    /** The local day to draw, YYYY-MM-DD. */
    day: string;
    /** The profile's offset, used for samples Oura reports in UTC. */
    offsetMinutes?: number | null;
}

type Sample = { minute: number; bpm: number };

const W = 360;
const H = 170;
const LEFT = 30;
const RIGHT = W - 6;
const TOP = 8;
const BOTTOM = H - 22;
const TICKS = [0, 360, 720, 1080, 1440];
const tickLabel = (minute: number) => (minute % 1440 === 0 ? '12a' : minute === 720 ? '12p' : minute < 720 ? `${minute / 60}a` : `${minute / 60 - 12}p`);

/** Converts each sample to minutes of the selected local day; samples from other days are dropped. */
export const localDaySamples = (data: HeartRate[], day: string, offsetMinutes?: number | null): Sample[] => {
    const dayStart = Date.parse(`${day}T00:00:00Z`);
    return data
        .flatMap((item) => {
            const absolute = Date.parse(item.timestamp);
            if (!Number.isFinite(absolute) || !Number.isFinite(item.bpm)) return [];
            // Oura reports heart rate in UTC; a zero offset is translated with the profile's own offset.
            const offset = parseUtcOffsetMinutesFromIso(item.timestamp) || offsetMinutes || 0;
            const minute = (absolute + offset * 60_000 - dayStart) / 60_000;
            return minute >= 0 && minute < 1440 ? [{ minute, bpm: item.bpm }] : [];
        })
        .sort((a, b) => a.minute - b.minute);
};

const HeartRateChart: React.FC<Props> = ({ data, day, offsetMinutes }) => {
    const samples = useMemo(() => localDaySamples(data, day, offsetMinutes), [data, day, offsetMinutes]);
    const [selected, setSelected] = useState<number | null>(null);
    if (!samples.length) return <p className="empty-note">No heart rate samples for this day.</p>;

    const values = samples.map((sample) => sample.bpm);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const [low, high] = getDataAwareChartDomain(values, { min: 0 }).map(Number);
    const x = (minute: number) => LEFT + (minute / 1440) * (RIGHT - LEFT);
    const y = (bpm: number) => BOTTOM - ((bpm - low) / Math.max(1, high - low)) * (BOTTOM - TOP);
    const path = samples
        .map((sample, index) => `${index === 0 || sample.minute - samples[index - 1].minute > 30 ? 'M' : 'L'}${x(sample.minute).toFixed(1)},${y(sample.bpm).toFixed(1)}`)
        .join(' ');
    const active = selected == null ? null : samples[selected];
    const inspect = (event: React.PointerEvent<SVGSVGElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const minute = ((((event.clientX - bounds.left) / bounds.width) * W - LEFT) / (RIGHT - LEFT)) * 1440;
        let nearest = 0;
        samples.forEach((sample, index) => {
            if (Math.abs(sample.minute - minute) < Math.abs(samples[nearest].minute - minute)) nearest = index;
        });
        setSelected(nearest);
    };

    return (
        <div className="metric-chart">
            <dl className="hr-stats">
                <div><dt>Low</dt><dd>{Math.min(...values)} bpm</dd></div>
                <div><dt>Average</dt><dd>{Math.round(average)} bpm</dd></div>
                <div><dt>High</dt><dd>{Math.max(...values)} bpm</dd></div>
            </dl>
            <div className="chart-reading" aria-live="polite">
                <span>{active ? formatMetricValue('bedtime', active.minute) : 'Tap the chart to inspect'}</span>
                {active && <strong><i style={{ background: 'var(--color-error)' }} />{active.bpm} bpm</strong>}
            </div>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={`Heart rate through the day: low ${Math.min(...values)}, average ${Math.round(average)}, high ${Math.max(...values)} beats per minute`}
                onPointerDown={inspect}
                onPointerMove={(event) => {
                    if (event.buttons || event.pointerType === 'mouse') inspect(event);
                }}
                onPointerLeave={(event) => {
                    if (event.pointerType === 'mouse') setSelected(null);
                }}
            >
                {[low, (low + high) / 2, high].map((value) => (
                    <g key={value}>
                        <line className="chart-grid" x1={LEFT} x2={RIGHT} y1={y(value)} y2={y(value)} />
                        <text x={LEFT - 6} y={y(value) + 4} textAnchor="end">{Math.round(value)}</text>
                    </g>
                ))}
                <line className="chart-guide" x1={LEFT} x2={RIGHT} y1={y(average)} y2={y(average)} />
                <path d={path} fill="none" stroke="var(--color-error)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
                {active && (
                    <>
                        <line className="chart-guide" x1={x(active.minute)} x2={x(active.minute)} y1={TOP} y2={BOTTOM} />
                        <circle cx={x(active.minute)} cy={y(active.bpm)} r={4} fill="var(--color-error)" stroke="var(--color-surface)" strokeWidth={2} />
                    </>
                )}
                {TICKS.map((minute) => (
                    <text key={minute} x={x(minute)} y={H - 4} textAnchor={minute === 0 ? 'start' : minute === 1440 ? 'end' : 'middle'}>
                        {tickLabel(minute)}
                    </text>
                ))}
            </svg>
        </div>
    );
};

export default HeartRateChart;
