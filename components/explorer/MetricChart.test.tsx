import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { METRIC_BY_ID } from '../../domain/metrics';
import MetricChart, { type ChartSeries } from './MetricChart';

afterEach(cleanup);
it('keeps daily readings and the chart scale available when only the average line is plotted', () => {
    const series: ChartSeries[] = [
        { label: 'Daily', color: 'purple', points: [{ day: '2026-04-01', value: 10 }, { day: '2026-04-02', value: 30 }], plot: false, muted: true },
        { label: '7-day avg', color: 'purple', points: [{ day: '2026-04-01', value: 10 }, { day: '2026-04-02', value: 20.25 }], precision: 1 },
    ];
    const onSelect = vi.fn();
    const { rerender } = render(<MetricChart metric={METRIC_BY_ID.sleep_score} series={series} onSelectDay={onSelect} />);
    const chart = screen.getByRole('img', { name: /2 recorded days.*Daily and 7-day avg/ });
    expect(chart.querySelectorAll('path')).toHaveLength(1);
    const axes = [...chart.querySelectorAll('text')].map(node => node.textContent);
    expect(screen.getByRole('slider', { name: 'Inspect Sleep score date' })).toHaveAttribute('aria-valuetext', expect.stringContaining('Daily 30, 7-day avg 20.3'));
    rerender(<MetricChart metric={METRIC_BY_ID.sleep_score} series={[{ ...series[0], plot: true }, series[1]]} onSelectDay={onSelect} />);
    expect(chart.querySelectorAll('path')).toHaveLength(2);
    expect([...chart.querySelectorAll('text')].map(node => node.textContent)).toEqual(axes);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'View Apr 1 details' }));
    expect(onSelect).toHaveBeenCalledWith('2026-04-01');
});
