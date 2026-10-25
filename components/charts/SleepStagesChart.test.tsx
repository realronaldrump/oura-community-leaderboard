import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
    it('shows each stage with its duration and share of the night', () => {
        render(<SleepStagesChart data={[session]} />);

        expect(screen.getByRole('img', {
            name: 'Sleep stages: Deep 1h 30m, REM 2h 0m, Light 4h 0m, Awake 30m',
        })).toBeInTheDocument();
        expect(screen.getByText('Deep').nextElementSibling).toHaveTextContent('1h 30m19%');
        expect(screen.getByText('Light').nextElementSibling).toHaveTextContent('4h 0m50%');
        expect(screen.getByText('REM').nextElementSibling).toHaveTextContent('2h 0m25%');
        expect(screen.getByText('Awake').nextElementSibling).toHaveTextContent('30m6%');
    });

    it('says when a night has no stage data', () => {
        render(<SleepStagesChart data={[{ id: 'empty', day: '2026-07-21' }]} />);
        expect(screen.getByText('No sleep stages recorded.')).toBeInTheDocument();
    });
});
