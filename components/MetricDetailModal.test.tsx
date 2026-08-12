import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MetricDetailModal, { getMetricHistoryChartDomain } from './MetricDetailModal';
import type { MetricDetailType } from './MetricDetailModal';

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

    it('scales heart-rate history around the observed values instead of zero', () => {
        expect(getMetricHistoryChartDomain('lowest_hr', [46, 49, 50, 49, 48, 47, 46]))
            .toEqual([44, 52]);
    });

    it.each<MetricDetailType>([
        'hrv',
        'heart_rate',
        'lowest_hr',
        'spo2',
        'stress',
        'resilience',
        'steps',
        'calories',
        'total_calories',
        'distance',
        'sleep_duration',
        'deep_sleep',
        'rem_sleep',
        'light_sleep',
        'efficiency',
        'bedtime',
        'wake_time',
        'latency',
        'awake_time',
        'breathing_rate',
        'high_activity_time',
        'medium_activity_time',
        'low_activity_time',
        'sedentary_time',
    ])('does not force zero into nonzero %s history', (metricType) => {
        const domain = getMetricHistoryChartDomain(metricType, [46, 49, 50]);

        expect(domain[0]).toBeGreaterThan(0);
        expect(domain[0]).toBeLessThan(46);
        expect(domain[1]).toBeGreaterThan(50);
    });

    it('keeps percentage history focused on observed values and capped at 100', () => {
        const domain = getMetricHistoryChartDomain('spo2', [98.1, 97.8, 98.5, 99, 98.2]);

        expect(domain[0]).toBeGreaterThan(0);
        expect(domain[0]).toBeLessThan(97.8);
        expect(domain[1]).toBeGreaterThan(99);
        expect(domain[1]).toBeLessThanOrEqual(100);
    });

    it('retains zero as a meaningful baseline for temperature deviation', () => {
        const domain = getMetricHistoryChartDomain('body_temperature', [0.1, 0.2, 0.3]);

        expect(domain[0]).toBeLessThanOrEqual(0);
        expect(domain[1]).toBeGreaterThan(0.3);
    });
});
