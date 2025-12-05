import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SleepSession } from '../../types';

interface Props {
    data: SleepSession[];
}

const SleepStagesChart: React.FC<Props> = ({ data }) => {
    // Transform data for chart
    const chartData = data.map(session => ({
        day: session.day,
        // Convert seconds to hours
        Deep: Number(((session.deep_sleep_duration || 0) / 3600).toFixed(1)),
        REM: Number(((session.rem_sleep_duration || 0) / 3600).toFixed(1)),
        Light: Number(((session.light_sleep_duration || 0) / 3600).toFixed(1)),
        Awake: Number(((session.awake_time || 0) / 3600).toFixed(1)),
    }));

    if (chartData.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
                No sleep data available
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                barSize={16}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis
                    dataKey="day"
                    stroke="#737373"
                    fontSize={11}
                    tickFormatter={(val) => val.slice(5)}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    stroke="#737373"
                    fontSize={11}
                    unit="h"
                    axisLine={false}
                    tickLine={false}
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #2a2a2a',
                        borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`${value}h`, '']}
                    labelStyle={{ color: '#a3a3a3', marginBottom: '4px' }}
                />
                <Legend
                    verticalAlign="top"
                    height={32}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '11px' }}
                />
                <Bar dataKey="Deep" stackId="a" fill="#1e40af" name="Deep" radius={[0, 0, 4, 4]} />
                <Bar dataKey="Light" stackId="a" fill="#3b82f6" name="Light" />
                <Bar dataKey="REM" stackId="a" fill="#8b5cf6" name="REM" />
                <Bar dataKey="Awake" stackId="a" fill="#6b7280" name="Awake" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
};

export default SleepStagesChart;
