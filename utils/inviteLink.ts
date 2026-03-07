export const INVITE_PATH = '/join';

const INVITE_SHARE_TITLE = 'Join my Oura leaderboard';
const INVITE_SHARE_TEXT = 'Connect your Oura account to join our private leaderboard.';

export type InviteShareResult = 'shared' | 'copied' | 'dismissed';

export const buildInviteLink = (): string => {
    if (typeof window === 'undefined') return INVITE_PATH;
    return new URL(INVITE_PATH, window.location.origin).toString();
};

export const isInviteLocation = (pathname?: string, search?: string): boolean => {
    if (pathname === INVITE_PATH) return true;
    if (!search) return false;
    return new URLSearchParams(search).get('invite') === '1';
};

export const supportsNativeInviteShare = (): boolean => {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
};

export const copyInviteLink = async (): Promise<string> => {
    const inviteLink = buildInviteLink();

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('clipboard_unavailable');
    }

    await navigator.clipboard.writeText(inviteLink);
    return inviteLink;
};

export const shareInviteLink = async (): Promise<InviteShareResult> => {
    const inviteLink = buildInviteLink();

    if (supportsNativeInviteShare()) {
        try {
            await navigator.share({
                title: INVITE_SHARE_TITLE,
                text: INVITE_SHARE_TEXT,
                url: inviteLink,
            });
            return 'shared';
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return 'dismissed';
            }
        }
    }

    await copyInviteLink();
    return 'copied';
};
