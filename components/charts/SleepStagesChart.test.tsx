import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SleepSession } from '../../types';
import SleepStagesChart from './SleepStagesChart';

afterEach(cleanup);

const session: SleepSession = {
    id: 'sleep-2026-07-20',
    day: '2026-07-20',
    deep_sleep_duration: 5_400,
    light_sleep_duration: 14_400,
    rem_sleep_duration: 7_200,
    awake_time: 1_800,
};

describe('SleepStagesChart', () => {
    it('offers a keyboard-focusable day action that opens the stage details', () => {
        const onStageClick = vi.fn();

        render(
            <div style={{ width: 640, height: 260 }}>
                <SleepStagesChart data={[session]} onStageClick={onStageClick} />
            </div>,
        );

        const dayAction = screen.getByRole('button', {
            name: 'View sleep stage details for Monday, July 20, 2026',
        });

        dayAction.focus();
        expect(dayAction).toHaveFocus();
        expect(dayAction).toHaveClass('min-h-11', 'min-w-11');

        fireEvent.click(dayAction);

        expect(screen.getByRole('dialog', {
            name: 'Sleep stage details for Monday, July 20, 2026',
        })).toBeInTheDocument();
        expect(screen.getByText('1h 30m')).toBeInTheDocument();
        expect(screen.getByText('4h 0m')).toBeInTheDocument();
        expect(screen.getByText('2h 0m')).toBeInTheDocument();
        expect(screen.getByText('30m')).toBeInTheDocument();
        expect(onStageClick).not.toHaveBeenCalled();
    });
});
