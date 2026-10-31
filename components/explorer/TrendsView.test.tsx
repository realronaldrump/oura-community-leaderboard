import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppRoute } from '../../hooks/useAppRoute';
import { shiftDay, type MetricObservation } from '../../domain/metrics';
import type { PublishedInsights } from '../../services/insightsService';
import TrendsView from './TrendsView';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../services/insightsService', () => ({ readMetricHistory: (...args: unknown[]) => mocks.read(...args) }));
afterEach(() => { cleanup(); mocks.read.mockReset(); });
beforeEach(() => { window.scrollTo = vi.fn(); });
const day = '2026-10-31';
const all: MetricObservation[] = Array.from({ length: 400 }, (_, i) => ({ day: shiftDay(day, i - 399), values: { sleep_score: i % 2 ? 70 : 90 }, sources: {} }));
const summary = { revision: 'published', months: { '2026-10': 'october' } } as unknown as PublishedInsights;
function Wrapper({ source = summary }: { source?: PublishedInsights | null }) {
    useAppRoute();
    return <TrendsView profile={{ id: 'synthetic' }} day={day} summary={source} fallback={all.slice(-30)} />;
}
const mount = (source: PublishedInsights | null = summary) => {
    window.history.replaceState({}, '', '/trends?range=30');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Wrapper source={source} /></QueryClientProvider>);
};
describe('Trends history ranges', () => {
    it('loads the full selected range and visibly marks a pending request', async () => {
        let resolveLong!: (rows: MetricObservation[]) => void;
        mocks.read.mockImplementation(async (_id, _months, start: string | undefined, end: string) => {
            if (start === shiftDay(day, -89)) return new Promise<MetricObservation[]>(resolve => { resolveLong = resolve; });
            return all.filter(row => (!start || row.day >= start) && row.day <= end);
        });
        mount();
        await screen.findByText(/30 recorded days/);
        fireEvent.click(screen.getByRole('button', { name: '90D' }));
        expect(await screen.findByRole('status')).toHaveTextContent('Loading 90-day history');
        expect(screen.getByRole('region', { name: 'Sleep score trend' })).toHaveAttribute('aria-busy', 'true');
        resolveLong(all.slice(-90));
        await screen.findByText(/90 recorded days/);
        expect(screen.queryByText(/Loading 90-day history/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '1Y' }));
        await screen.findByText(/365 recorded days/);
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        await screen.findByText(/400 recorded days/);
        fireEvent.click(screen.getByRole('button', { name: '7D' }));
        await screen.findByText(/7 recorded days/);
        expect(mocks.read).toHaveBeenCalledWith('synthetic', summary.months, shiftDay(day, -6), day);
        const calls = mocks.read.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: '90D' }));
        await screen.findByText(/90 recorded days/);
        expect(mocks.read).toHaveBeenCalledTimes(calls);
    });

    it('does not overwrite the selected range when an earlier request finishes late', async () => {
        let resolveEarlier!: (rows: MetricObservation[]) => void;
        mocks.read.mockImplementation(async (_id, _months, start: string | undefined, end: string) => {
            if (start === shiftDay(day, -89)) return new Promise<MetricObservation[]>(resolve => { resolveEarlier = resolve; });
            return all.filter(row => (!start || row.day >= start) && row.day <= end);
        });
        mount();
        await screen.findByText(/30 recorded days/);
        fireEvent.click(screen.getByRole('button', { name: '90D' }));
        await screen.findByText(/Loading 90-day history/);
        fireEvent.click(screen.getByRole('button', { name: '1Y' }));
        await screen.findByText(/365 recorded days/);
        resolveEarlier(all.slice(-90));
        await waitFor(() => expect(screen.getByRole('button', { name: '1Y' })).toHaveAttribute('aria-pressed', 'true'));
        expect(screen.getByText(/365 recorded days/)).toBeInTheDocument();
    });

    it('surfaces errors next to the chart and retries, and explains when no full history exists', async () => {
        mocks.read.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(all.slice(-30));
        mount();
        const card = screen.getByRole('region', { name: 'Sleep score trend' });
        expect(await within(card).findByRole('alert')).toHaveTextContent('History couldn’t load');
        fireEvent.click(within(card).getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(within(card).queryByRole('alert')).toBeNull());
        cleanup();
        mocks.read.mockClear();
        mount(null);
        expect(screen.getByRole('status')).toHaveTextContent('Full history is being prepared');
        expect(mocks.read).not.toHaveBeenCalled();
    });
});
