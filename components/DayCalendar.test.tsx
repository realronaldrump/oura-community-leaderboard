import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DayCalendar from './DayCalendar';

afterEach(cleanup);
describe('tap-to-select days', () => {
    it('selects recent and older days without a native date picker and marks exclusions', () => {
        const onSelect = vi.fn();
        const { container } = render(<DayCalendar selectedDay="2026-10-30" today="2026-10-31" onSelect={onSelect}
            ranges={[{ id: 's', startDay: '2026-10-29', endDay: '2026-10-29', sources: ['sleep'] }]} />);
        expect(container.querySelector('input[type="date"]')).toBeNull();
        expect(screen.getByRole('button', { name: /October 29, 2026 · Some data ignored/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
        expect(onSelect).toHaveBeenLastCalledWith('2026-10-30');
        fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2024' } });
        fireEvent.change(screen.getByLabelText('Month'), { target: { value: '02' } });
        fireEvent.click(screen.getByRole('button', { name: /February 29, 2024/ }));
        expect(onSelect).toHaveBeenLastCalledWith('2024-02-29');
    });

    it('blocks future days and supports keyboard navigation across months', () => {
        render(<DayCalendar selectedDay="2026-10-01" today="2026-10-15" onSelect={vi.fn()} />);
        expect(screen.getByRole('button', { name: /October 16, 2026/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
        const first = screen.getByRole('button', { name: /October 1, 2026/ });
        first.focus();
        fireEvent.keyDown(first, { key: 'ArrowLeft' });
        expect(screen.getByRole('button', { name: /September 30, 2026/ })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Today' }));
        expect(screen.getByRole('group', { name: 'October 2026' })).toBeInTheDocument();
    });
});
