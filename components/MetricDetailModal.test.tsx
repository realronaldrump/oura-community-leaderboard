import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MetricDetailModal from './MetricDetailModal';

afterEach(cleanup);

describe('MetricDetailModal', () => {
    it('shows the selected sleep session bedtime and wake time in record-local time', () => {
        const props = {
            isOpen: true,
            onClose: () => undefined,
            metricType: 'sleep_duration' as const,
            currentValue: 27_900,
            historyData: [],
            date: '2026-08-11',
            sleepSession: {
                bedtime_start: '2026-08-10T22:47:00-06:00',
                bedtime_end: '2026-08-11T06:32:00-06:00',
            },
        };

        render(<MetricDetailModal {...props} />);

        const timing = screen.getByRole('group', { name: 'Sleep timing' });
        expect(within(timing).getByText('Bedtime')).toBeInTheDocument();
        expect(within(timing).getByText('10:47 PM')).toBeInTheDocument();
        expect(within(timing).getByText('Wake time')).toBeInTheDocument();
        expect(within(timing).getByText('6:32 AM')).toBeInTheDocument();
    });

    it('does not add sleep timing to unrelated metric details', () => {
        const props = {
            isOpen: true,
            onClose: () => undefined,
            metricType: 'hrv' as const,
            currentValue: 42,
            historyData: [],
            sleepSession: {
                bedtime_start: '2026-08-10T22:47:00-06:00',
                bedtime_end: '2026-08-11T06:32:00-06:00',
            },
        };

        render(<MetricDetailModal {...props} />);

        expect(screen.queryByRole('group', { name: 'Sleep timing' })).not.toBeInTheDocument();
    });

    it('keeps both timing fields visible when Oura has not supplied them', () => {
        render(
            <MetricDetailModal
                isOpen
                onClose={() => undefined}
                metricType="sleep_duration"
                currentValue={null}
                historyData={[]}
                date="2026-08-11"
            />
        );

        const timing = screen.getByRole('group', { name: 'Sleep timing' });
        expect(within(timing).getAllByText('Not available')).toHaveLength(2);
    });

    it('does not present hard-coded category ranges as if they were data-backed', () => {
        render(
            <MetricDetailModal
                isOpen
                onClose={() => undefined}
                metricType="sleep_duration"
                currentValue={28_800}
                historyData={[]}
                date="2026-08-11"
            />
        );

        expect(screen.queryByText('Category Ranges')).not.toBeInTheDocument();
        expect(screen.queryByText(/^Reference:/)).not.toBeInTheDocument();
        expect(screen.queryByText(/General reference bands/i)).not.toBeInTheDocument();
    });
});
