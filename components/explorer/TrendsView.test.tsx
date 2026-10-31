import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppRoute } from '../../hooks/useAppRoute';
import { shiftDay, type MetricObservation } from '../../domain/metrics';
import type { PublishedInsights } from '../../services/insightsService';
import TrendsView from './TrendsView';
import { storageKey } from '../../services/storageScope';
import { SMOOTHING_STORAGE_KEY } from '../../utils/chartSmoothing';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../services/insightsService', () => ({ readMetricHistory: (...args: unknown[]) => mocks.read(...args) }));
afterEach(() => { cleanup(); mocks.read.mockReset(); });
beforeEach(() => { window.scrollTo = vi.fn(); localStorage.clear(); });
const day = '2026-10-31';
const all: MetricObservation[] = Array.from({ length: 400 }, (_, i) => ({ day: shiftDay(day, i - 399), values: { sleep_score: i % 2 ? 70 : 90, readiness_score: 85, activity_score: 80 }, sources: {} }));
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
    it('leaves ignored warm-up dates out of the average without changing visible day counts', async () => {
        mocks.read.mockImplementation(async (_id, _months, start: string | undefined, end: string) => all.filter(row => (!start || row.day >= start) && row.day <= end));
        window.history.replaceState({}, '', '/trends?range=30');
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<QueryClientProvider client={client}><TrendsView profile={{ id: 'synthetic', dataExclusionRanges: [{ id: 'bad', startDay: '2026-09-30', endDay: '2026-09-30', sources: ['sleep'] }] }} summary={summary} day={day} fallback={all.slice(-30)} /></QueryClientProvider>);
        await screen.findByText(/30 recorded days/);
        fireEvent.click(screen.getByRole('button', { name: 'Smooth' }));
        await waitFor(() => expect(screen.queryByText(/Loading history for/)).toBeNull());
        fireEvent.change(screen.getByRole('slider', { name: 'Inspect Sleep score date' }), { target: { value: '0' } });
        expect(screen.getByRole('slider', { name: 'Inspect Sleep score date' })).toHaveAttribute('aria-valuetext', expect.stringContaining('Daily 90, 7-day avg 80'));
        expect(screen.getByText(/30 recorded days/)).toBeInTheDocument();
    });

    it('smooths with earlier days at the visible boundary and preserves the daily values and summary', async () => {
        mocks.read.mockImplementation(async (_id, _months, start: string | undefined, end: string) => all.filter(row => (!start || row.day >= start) && row.day <= end));
        mount();
        await screen.findByText(/30 recorded days/);
        fireEvent.click(within(screen.getByRole('group', { name: 'Line smoothing' })).getByRole('button', { name: 'Smooth' }));
        await screen.findByRole('img', { name: /7-day avg/ });
        await waitFor(() => expect(screen.queryByText(/Loading history for/)).toBeNull());
        expect(mocks.read).toHaveBeenCalledWith('synthetic', summary.months, '2026-09-01', day);
        fireEvent.change(screen.getByRole('slider', { name: 'Inspect Sleep score date' }), { target: { value: '0' } });
        expect(screen.getByRole('slider', { name: 'Inspect Sleep score date' })).toHaveAttribute('aria-valuetext', expect.stringContaining('Daily 90, 7-day avg 81.4'));
        expect(screen.getByText('Daily average')).toBeInTheDocument();
        const chart = screen.getByRole('img', { name: /7-day avg/ });
        expect(chart.querySelectorAll('path')).toHaveLength(1);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Show daily line' }));
        expect(chart.querySelectorAll('path')).toHaveLength(2);
        expect(screen.getByText(/30 recorded days/)).toBeInTheDocument();
    });

    it('keeps a custom window across ranges, metrics and reloads, and avoids extra reads within a month', async () => {
        mocks.read.mockImplementation(async (_id, _months, start: string | undefined, end: string) => all.filter(row => (!start || row.day >= start) && row.day <= end));
        mount();
        await screen.findByText(/30 recorded days/);
        fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
        await waitFor(() => expect(screen.queryByText(/Loading history for/)).toBeNull());
        const calls = mocks.read.mock.calls.length;
        fireEvent.change(screen.getByRole('spinbutton', { name: 'Days to average' }), { target: { value: '21' } });
        expect(screen.getByText('21-day average')).toBeInTheDocument();
        expect(mocks.read).toHaveBeenCalledTimes(calls);
        fireEvent.click(screen.getByRole('button', { name: 'Readiness' }));
        expect(screen.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: '90D' }));
        await screen.findByText(/90 recorded days/);
        expect(screen.getByRole('spinbutton', { name: 'Days to average' })).toHaveValue(21);
        cleanup();
        mount();
        expect(screen.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('spinbutton', { name: 'Days to average' })).toHaveValue(21);
        fireEvent.change(screen.getByRole('slider', { name: 'Smoothing strength' }), { target: { value: '45' } });
        expect(screen.getByRole('spinbutton', { name: 'Days to average' })).toHaveValue(45);
        fireEvent.change(screen.getByRole('spinbutton', { name: 'Days to average' }), { target: { value: '999' } });
        fireEvent.blur(screen.getByRole('spinbutton', { name: 'Days to average' }));
        expect(screen.getByRole('spinbutton', { name: 'Days to average' })).toHaveValue(365);
    });

    it('works when saved settings are invalid or browser storage cannot be written', async () => {
        localStorage.setItem(storageKey(SMOOTHING_STORAGE_KEY), 'bad-json');
        mocks.read.mockResolvedValue(all.slice(-30));
        mount();
        expect(within(screen.getByRole('group', { name: 'Line smoothing' })).getByRole('button', { name: 'Daily' })).toHaveAttribute('aria-pressed', 'true');
        const store = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage disabled'); });
        try {
            fireEvent.click(screen.getByRole('button', { name: 'Smooth' }));
            expect(screen.getByRole('button', { name: 'Smooth' })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByText('7-day average')).toBeInTheDocument();
        } finally { store.mockRestore(); }
    });

    it('loads the full selected range and visibly marks a pending request', async () => {
        let resolveLong!: (rows: MetricObservation[]) => void;
        mocks.read.mockImplementation(async (_id, _months, start: string | undefined, end: string) => {
            if (start === '2026-08-01') return new Promise<MetricObservation[]>(resolve => { resolveLong = resolve; });
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
        expect(mocks.read).toHaveBeenCalledWith('synthetic', summary.months, '2026-10-01', day);
        const calls = mocks.read.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: '90D' }));
        await screen.findByText(/90 recorded days/);
        expect(mocks.read).toHaveBeenCalledTimes(calls);
    });

    it('does not overwrite the selected range when an earlier request finishes late', async () => {
        let resolveEarlier!: (rows: MetricObservation[]) => void;
        mocks.read.mockImplementation(async (_id, _months, start: string | undefined, end: string) => {
            if (start === '2026-08-01') return new Promise<MetricObservation[]>(resolve => { resolveEarlier = resolve; });
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
