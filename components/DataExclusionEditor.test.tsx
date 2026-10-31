import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataExclusionRange, UserProfile } from '../types';
import { DATA_EXCLUSION_SOURCES, getExclusionSourcesForDay, normalizeDataExclusionRanges } from '../utils/dataExclusions';
import DataExclusionEditor, { DayDataControl } from './DataExclusionEditor';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('../contexts/UserContext', () => ({ useUser: () => ({ updateDataExclusions: mocks.update }) }));
const day = '2026-10-30';
const profile: UserProfile = { id: 'target-profile', firstName: 'Davis' };
let saved: DataExclusionRange[];
beforeEach(() => {
    saved = [];
    mocks.update.mockReset().mockImplementation(async (_id: string, edit: (ranges: DataExclusionRange[]) => DataExclusionRange[]) => { saved = normalizeDataExclusionRanges(edit(saved)); });
});
afterEach(cleanup);

describe('day data-quality editor', () => {
    it('ignores sleep for the viewed profile while preserving concurrent edits to other days', async () => {
        const close = vi.fn();
        render(<DataExclusionEditor profile={profile} day={day} onClose={close} />);
        saved.push({ id: 'another-tab', startDay: '2026-10-29', endDay: '2026-10-29', sources: ['activity'] });
        fireEvent.click(screen.getByRole('checkbox', { name: 'Sleep' }));
        fireEvent.change(screen.getByRole('textbox', { name: /Reason/ }), { target: { value: 'Inaccurate sleep' } });
        fireEvent.click(screen.getByRole('button', { name: 'Ignore selected data' }));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(mocks.update).toHaveBeenCalledWith('target-profile', expect.any(Function));
        expect(saved.find(range => range.startDay === day)).toMatchObject({ endDay: day, sources: ['session', 'sleep', 'sleepTime'], label: 'Inaccurate sleep' });
        expect(saved.some(range => range.id === 'another-tab')).toBe(true);
    });

    it('restores sleep inside a whole-day range without restoring the remaining data types or neighboring dates', async () => {
        const ranges = [{ id: 'break', startDay: '2026-10-28', endDay: '2026-10-31' }];
        saved = structuredClone(ranges);
        const close = vi.fn();
        render(<DataExclusionEditor profile={{ ...profile, dataExclusionRanges: ranges }} day={day} onClose={close} />);
        expect(screen.getByRole('checkbox', { name: /^Whole day/ })).toBeChecked();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Sleep' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(getExclusionSourcesForDay(day, saved)).not.toContain('sleep');
        expect(getExclusionSourcesForDay(day, saved)).toContain('activity');
        expect(getExclusionSourcesForDay('2026-10-29', saved)).toEqual(DATA_EXCLUSION_SOURCES);
        expect(getExclusionSourcesForDay('2026-10-31', saved)).toEqual(DATA_EXCLUSION_SOURCES);
    });

    it('keeps failed edits available for retry and prevents duplicate saves', async () => {
        const close = vi.fn();
        mocks.update.mockRejectedValueOnce(new Error('offline'));
        render(<DataExclusionEditor profile={profile} day={day} initialSources={['activity']} onClose={close} />);
        const save = screen.getByRole('button', { name: 'Ignore selected data' });
        fireEvent.click(save); fireEvent.click(save);
        expect(mocks.update).toHaveBeenCalledOnce();
        expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/);
        expect(close).not.toHaveBeenCalled();
        expect(screen.getByRole('checkbox', { name: 'Activity' })).toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Ignore selected data' }));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(saved[0].sources).toEqual(['activity']);
    });

    it('preselects the complete sleep group from a nightly measurement and can restore a day', async () => {
        const { unmount } = render(<DayDataControl profile={profile} day={day} source="session" />);
        fireEvent.click(screen.getByRole('button', { name: 'Ignore data' }));
        expect(screen.getByRole('checkbox', { name: 'Sleep' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Activity' })).not.toBeChecked();
        unmount();
        saved = [{ id: 's', startDay: day, endDay: day, sources: ['sleep'] }];
        const close = vi.fn();
        render(<DataExclusionEditor profile={{ ...profile, dataExclusionRanges: saved }} day={day} onClose={close} />);
        fireEvent.click(screen.getByRole('button', { name: 'Restore this day' }));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(saved).toEqual([]);
    });
});
