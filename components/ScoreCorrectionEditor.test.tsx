import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyScoreCorrection } from '../types';
import ScoreCorrectionEditor from './ScoreCorrectionEditor';
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../contexts/UserContext', () => ({ useUser: () => ({ updateScoreCorrections: mocks.save }) }));
let saved: DailyScoreCorrection[];
beforeEach(() => {
    saved = [{ id: 'other-day', day: '2026-04-01', source: 'oura_app', sleepScore: 80 }];
    mocks.save.mockReset().mockImplementation(async (_id: string, edit: (current: DailyScoreCorrection[]) => DailyScoreCorrection[]) => { saved = edit(saved); });
});
afterEach(cleanup);
describe('confirmed score editor', () => {
    it('validates values, retains a failed edit for retry, and saves only to the viewed date/profile', async () => {
        const close = vi.fn();
        render(<ScoreCorrectionEditor profile={{ id: 'viewed' }} day="2026-04-03" onClose={close} />);
        const submit = screen.getByRole('button', { name: 'Save scores' });
        fireEvent.submit(submit.closest('form')!);
        expect(screen.getByRole('alert')).toHaveTextContent('1 to 100');
        expect(mocks.save).not.toHaveBeenCalled();
        fireEvent.change(screen.getByRole('spinbutton', { name: /Sleep score/ }), { target: { value: '78' } });
        fireEvent.change(screen.getByRole('spinbutton', { name: /Readiness score/ }), { target: { value: '82' } });
        mocks.save.mockRejectedValueOnce(new Error('offline'));
        fireEvent.click(submit);
        expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');
        expect(screen.getByRole('spinbutton', { name: /Sleep score/ })).toHaveValue(78);
        expect(close).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Save scores' }));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(mocks.save).toHaveBeenLastCalledWith('viewed', expect.any(Function));
        expect(saved).toEqual([expect.objectContaining({ id: 'other-day' }), expect.objectContaining({ day: '2026-04-03', sleepScore: 78, readinessScore: 82, source: 'oura_app' })]);
    });

    it('removes a correction reversibly without changing another date', async () => {
        const current: DailyScoreCorrection = { id: 'remove', day: '2026-04-03', source: 'oura_app', sleepScore: 78 };
        saved.push(current);
        const close = vi.fn();
        render(<ScoreCorrectionEditor profile={{ id: 'viewed', scoreCorrections: [current] }} day={current.day} onClose={close} />);
        fireEvent.click(screen.getByRole('button', { name: 'Remove correction' }));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(saved.map(value => value.id)).toEqual(['other-day']);
    });
});
