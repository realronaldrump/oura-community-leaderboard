import { describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import SleepRhythm from './SleepRhythm';
import { createEmptyDailyStats } from '../../test/helpers';
import type { SleepSession } from '../../types';

afterEach(cleanup);

// Build a night that goes to bed ~23:00 and wakes ~07:00 (US Central offset),
// sleeping 7h30m. `day` is the morning the session ends on.
const makeNight = (day: string, bedHour = 23, wakeHour = 7, sleepSeconds = 27000): SleepSession => {
    const prevDay = new Date(`${day}T00:00:00Z`);
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
    const prevIso = prevDay.toISOString().slice(0, 10);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
        id: `s-${day}`,
        day,
        type: 'long_sleep',
        bedtime_start: `${prevIso}T${pad(bedHour)}:00:00-05:00`,
        bedtime_end: `${day}T${pad(wakeHour)}:00:00-05:00`,
        total_sleep_duration: sleepSeconds,
        efficiency: 92,
    };
};

const makeSessions = (count: number): SleepSession[] => {
    const sessions: SleepSession[] = [];
    const base = new Date('2026-06-01T00:00:00Z');
    for (let i = 0; i < count; i += 1) {
        const d = new Date(base);
        d.setUTCDate(d.getUTCDate() + i);
        sessions.push(makeNight(d.toISOString().slice(0, 10)));
    }
    return sessions;
};

const profile = { id: 'p1', firstName: 'Davis', lastName: null, email: null };

describe('SleepRhythm', () => {
    it('renders an empty state when there is no sleep data', () => {
        render(<SleepRhythm profiles={[profile]} usersData={[{ data: createEmptyDailyStats() }]} />);
        expect(screen.getByText(/No sleep data yet/i)).toBeInTheDocument();
    });

    it('computes averages without crashing and shows them', () => {
        const data = createEmptyDailyStats({ session: makeSessions(40) });
        render(<SleepRhythm profiles={[profile]} usersData={[{ data }]} />);

        // Hero stat labels are present
        expect(screen.getByText(/Avg bedtime/i)).toBeInTheDocument();
        expect(screen.getByText(/Avg wake/i)).toBeInTheDocument();
        expect(screen.getByText(/Avg duration/i)).toBeInTheDocument();

        // Average duration of a consistent 7h30m sleeper should surface as 7h 30m.
        expect(screen.getAllByText(/7h 30m/i).length).toBeGreaterThan(0);

        // Bedtime ~11 PM and wake ~7 AM should appear in the averages-by-window table.
        expect(screen.getAllByText(/11:00 PM/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/7:00 AM/i).length).toBeGreaterThan(0);
    });
});
