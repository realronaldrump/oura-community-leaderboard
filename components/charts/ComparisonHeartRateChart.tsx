import React, { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { HeartRate } from '../../types';

interface ComparisonHeartRateChartProps {
    userAData: HeartRate[];
    userBData: HeartRate[];
    userAName: string;
    userBName: string;
}

const ComparisonHeartRateChart: React.FC<ComparisonHeartRateChartProps> = ({ userAData, userBData, userAName, userBName }) => {

    const formattedData = useMemo(() => {
        // We need to merge two data sets.
        // Assuming data is sorted by timestamp.
        // We will bucket by time. Since dates might be different if we are comparing "last night" vs "last night", 
        // but strictly speaking they should be overlapping in time if we are comparing same night.
        // However, if they sleep at slightly different times, we might want to align by "hours since sleep onset" OR just real wall clock time.
        // The prompt implies "Overlaid Data... immediately shows who fell asleep faster". 
        // This suggests wall clock time (e.g. 10PM vs 10:15PM).

        // Let's create a map by time (HH:MM)
        const dataMap = new Map<string, { time: string, hrA?: number, hrB?: number, timestamp: number }>();

        const processData = (data: HeartRate[], key: 'hrA' | 'hrB') => {
            data.forEach(point => {
                const date = new Date(point.timestamp);
                // Round to nearest 5 minutes to make the graph readable and increase overlap
                const minutes = date.getMinutes();
                const roundedMinutes = Math.floor(minutes / 5) * 5;
                date.setMinutes(roundedMinutes, 0, 0);

                // Format HH:MM
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                if (!dataMap.has(timeStr)) {
                    dataMap.set(timeStr, { time: timeStr, timestamp: date.getTime() });
                }
                const entry = dataMap.get(timeStr)!;
                // Average if multiple points fall in same bucket? Or just take last. Oura HR is 5min interval usually so it should be fine.
                entry[key] = point.bpm;
            });
        };

        processData(userAData, 'hrA');
        processData(userBData, 'hrB');

        return Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    }, [userAData, userBData]);

    if (!userAData.length && !userBData.length) return <div className="text-center text-gray-500">No heart rate data available</div>;

    return (
        <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formattedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                        dataKey="time"
                        stroke="#9CA3AF"
                        fontSize={12}
                        tick={{ fill: '#9CA3AF' }}
                        interval="preserveStartEnd"
                        minTickGap={30}
                    />
                    <YAxis
                        stroke="#9CA3AF"
                        fontSize={12}
                        tick={{ fill: '#9CA3AF' }}
                        domain={['dataMin - 5', 'dataMax + 5']}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                        itemStyle={{ color: '#F3F4F6' }}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="hrA"
                        name={userAName}
                        stroke="#10B981"
                        dot={false}
                        strokeWidth={2}
                        connectNulls
                    />
                    <Line
                        type="monotone"
                        dataKey="hrB"
                        name={userBName}
                        stroke="#3B82F6"
                        dot={false}
                        strokeWidth={2}
                        connectNulls
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ComparisonHeartRateChart;
