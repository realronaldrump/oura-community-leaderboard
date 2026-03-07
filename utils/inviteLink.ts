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

const copyInviteLinkWithExecCommand = (inviteLink: string): boolean => {
    if (typeof document === 'undefined') return false;

    const textarea = document.createElement('textarea');
    textarea.value = inviteLink;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (error) {
        copied = false;
    } finally {
        document.body.removeChild(textarea);
    }

    return copied;
};

export const copyInviteLink = async (): Promise<string> => {
    const inviteLink = buildInviteLink();

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
        return inviteLink;
    }

    if (copyInviteLinkWithExecCommand(inviteLink)) {
        return inviteLink;
    }

    throw new Error('clipboard_unavailable');
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
