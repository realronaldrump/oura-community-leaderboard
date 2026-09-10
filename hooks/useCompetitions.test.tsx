import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCompetition, makeCompetitionInvite } from '../test/competitionFixtures';
import { useCompetitionInvitePreview } from './useCompetitions';
const mocks = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('../services/competitionService', () => ({ competitionService: { getCompetitionInvitePreview: mocks.preview } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('invitation loading', () => {
    it('never exposes the previous link while a new link is loading', async () => {
        const preview = { competition: makeCompetition(), invite: makeCompetitionInvite() };
        mocks.preview.mockResolvedValueOnce(preview);
        const { result, rerender } = renderHook(({ token }) => useCompetitionInvitePreview(token), { initialProps: { token: 'first' } });
        await waitFor(() => expect(result.current.preview).toEqual(preview));
        let resolve: ((value: null) => void) | undefined;
        mocks.preview.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
        rerender({ token: 'second' });
        expect(result.current).toEqual({ preview: null, isLoading: true, error: null });
        await act(async () => resolve?.(null));
        expect(result.current).toEqual({ preview: null, isLoading: false, error: null });
    });
});
