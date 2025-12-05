
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SleepSession } from '../../types';

interface Props {
    data: SleepSession[];
}

const SleepStagesChart: React.FC<Props> = ({ data }) => {
    // Process data to get duration in hours for each stage
    const processedData = data.slice().reverse().map(session => ({
        day: session.day,
        Deep: (session.deep_sleep_duration || 0) / 3600,
        REM: (session.rem_sleep_duration || 0) / 3600,
        Light: (session.light_sleep_duration || 0) / 3600,
        Awake: (session.awake_time || 0) / 3600,
    }));

    return (
        <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={processedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="day" stroke="#718096" fontSize={12} tickFormatter={(val) => val.slice(5)} />
                    <YAxis stroke="#718096" fontSize={12} unit="h" />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#2D3748', border: 'none', borderRadius: '8px', color: '#fff' }}
                        formatter={(value: number) => [`${value.toFixed(1)}h`, '']}
                    />
                    <Legend />
                    <Bar dataKey="Deep" stackId="a" fill="#3182CE" />
                    <Bar dataKey="REM" stackId="a" fill="#805AD5" />
                    <Bar dataKey="Light" stackId="a" fill="#38B2AC" />
                    <Bar dataKey="Awake" stackId="a" fill="#E53E3E" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default SleepStagesChart;
