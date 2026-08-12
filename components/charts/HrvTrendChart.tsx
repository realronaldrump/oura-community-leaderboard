import React from 'react';
import {
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { SleepSession } from '../../types';
import { CHART_TOOLTIP_STYLE } from '../../utils/chartStyles';
import { getDataAwareChartDomain } from '../../utils/chartScale';

interface HrvTrendChartProps {
    data: SleepSession[];
}

const HrvTrendChart: React.FC<HrvTrendChartProps> = ({ data }) => (
    <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={100}
        initialDimension={{ width: 480, height: 100 }}
    >
        <LineChart data={data}>
            <XAxis
                dataKey="day"
                tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: string) => value.slice(5)}
            />
            <YAxis
                domain={getDataAwareChartDomain(data.map((session) => session.average_hrv), { min: 0 })}
                tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                unit=" ms"
                tickCount={5}
            />
            <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number) => [`${value} ms`, 'HRV']}
            />
            <Line
                type="monotone"
                dataKey="average_hrv"
                stroke="var(--color-insight)"
                dot={false}
                strokeWidth={1.5}
                connectNulls
            />
        </LineChart>
    </ResponsiveContainer>
);

export default HrvTrendChart;
