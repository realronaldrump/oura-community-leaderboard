import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyCompetitionInviteLink, shareCompetitionInviteLink } from './inviteLink';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('competition sharing', () => {
    it('falls back when Clipboard is present but permission is denied', async () => {
        vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
        const execCommand = vi.fn().mockReturnValue(true);
        Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
        expect(await copyCompetitionInviteLink('test-token')).toContain('/join?competitionInvite=test-token');
        expect(execCommand).toHaveBeenCalledWith('copy');
        expect(document.querySelector('textarea')).toBeNull();
    });
    it('reports a copy failure instead of claiming success', async () => {
        vi.stubGlobal('navigator', {});
        Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });
        await expect(copyCompetitionInviteLink('token')).rejects.toThrow('clipboard_unavailable');
        expect(document.querySelector('textarea')).toBeNull();
    });
    it('uses date-independent sharing text and treats cancellation as dismissal', async () => {
        const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
        vi.stubGlobal('navigator', { share });
        expect(await shareCompetitionInviteLink('token', 'Step Week')).toBe('dismissed');
        expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Step Week', text: 'Join my Oura competition.' }));
    });
});
