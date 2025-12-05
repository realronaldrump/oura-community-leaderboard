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
        Deep: (session.deep_sleep_duration || 0) / 3600,
        REM: (session.rem_sleep_duration || 0) / 3600,
        Light: (session.light_sleep_duration || 0) / 3600,
        Awake: (session.awake_time || 0) / 3600,
    }));

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                barSize={20}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="day" stroke="#666" fontSize={12} tickFormatter={(val) => val.slice(5)} />
                <YAxis stroke="#666" fontSize={12} unit="h" />
                <Tooltip
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '12px' }}
                    formatter={(value: number) => [value.toFixed(1) + 'h', '']}
                    labelStyle={{ color: '#999', marginBottom: '4px' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', opacity: 0.8 }} />
                <Bar dataKey="Deep" stackId="a" fill="#3182CE" name="Deep" radius={[0, 0, 4, 4]} />
                <Bar dataKey="REM" stackId="a" fill="#805AD5" name="REM" />
                <Bar dataKey="Light" stackId="a" fill="#38B2AC" name="Light" />
                <Bar dataKey="Awake" stackId="a" fill="#E53E3E" name="Awake" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
};

export default SleepStagesChart;
