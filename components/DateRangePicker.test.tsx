import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DateRangePicker from './DateRangePicker';

afterEach(cleanup);

describe('DateRangePicker availability', () => {
    it('treats omitted dates as an unconstrained calendar', () => {
        const onSelectDate = vi.fn();
        const { container } = render(
            <DateRangePicker
                mode="date"
                variant="field"
                selectedDate="2026-07-25"
                min="2026-07-01"
                max="2026-07-31"
                onSelectDate={onSelectDate}
            />,
        );

        const trigger = container.querySelector<HTMLButtonElement>('.date-picker-trigger');
        expect(trigger).not.toBeNull();
        expect(trigger).toBeEnabled();

        fireEvent.click(trigger!);

        const panel = screen.getByRole('dialog', { name: 'Date picker' });
        const calendarViewport = within(panel).getByRole('region', { name: 'Calendar dates' });
        const selectableDay = within(calendarViewport).getByRole('button', { name: /Jul 25, 2026/i });

        expect(panel).toHaveClass('date-picker-panel--field');
        expect(calendarViewport).toHaveAttribute('tabindex', '0');
        expect(selectableDay).toBeEnabled();
        expect(selectableDay).toHaveClass('min-h-11', 'min-w-11');
    });

    it('disables the picker when dates is explicitly empty', () => {
        const onSelectDate = vi.fn();
        const { container } = render(
            <DateRangePicker
                dates={[]}
                mode="date"
                variant="field"
                min="2026-07-01"
                max="2026-07-31"
                onSelectDate={onSelectDate}
            />,
        );

        const trigger = container.querySelector<HTMLButtonElement>('.date-picker-trigger');
        expect(trigger).not.toBeNull();
        expect(trigger).toBeDisabled();

        fireEvent.click(trigger!);
        expect(screen.queryByRole('dialog', { name: 'Date picker' })).not.toBeInTheDocument();
        expect(onSelectDate).not.toHaveBeenCalled();
    });

    it('notifies the caller when history is opened so older dates can load on demand', () => {
        const onOpen = vi.fn();
        const { container } = render(
            <DateRangePicker
                dates={['2026-07-25']}
                mode="date"
                selectedDate="2026-07-25"
                onSelectDate={vi.fn()}
                onOpen={onOpen}
            />,
        );

        const trigger = container.querySelector<HTMLButtonElement>('.date-picker-trigger');
        fireEvent.click(trigger!);
        fireEvent.click(trigger!);

        expect(onOpen).toHaveBeenCalledTimes(1);
    });
});
