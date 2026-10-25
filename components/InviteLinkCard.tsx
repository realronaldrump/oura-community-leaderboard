import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Send } from 'lucide-react';
import {
    buildInviteLink,
    copyInviteLink,
    InviteShareResult,
    shareInviteLink,
    supportsNativeInviteShare,
} from '../utils/inviteLink';
import { Button } from './ui';

type InviteStatus = InviteShareResult | 'idle' | 'error';

const MESSAGES: Partial<Record<InviteStatus, string>> = {
    shared: 'Invite sent.',
    copied: 'Link copied.',
    error: 'Couldn’t share from this browser. Copy the link above instead.',
};

/** The circle's join link with copy and native share actions. */
const InviteLinkCard: React.FC<{ className?: string }> = ({ className = '' }) => {
    const [status, setStatus] = useState<InviteStatus>('idle');
    const [isWorking, setIsWorking] = useState(false);
    const inviteLink = useMemo(() => buildInviteLink(), []);
    const canNativeShare = supportsNativeInviteShare();

    useEffect(() => {
        if (status === 'idle' || status === 'error') return;
        const timer = window.setTimeout(() => setStatus('idle'), 2400);
        return () => window.clearTimeout(timer);
    }, [status]);

    const run = async (action: () => Promise<InviteShareResult | void>) => {
        setIsWorking(true);
        try {
            const result = await action();
            if (result !== 'dismissed') setStatus(result || 'copied');
        } catch (error) {
            console.error('Failed to share invite link:', error);
            setStatus('error');
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <div className={`grid gap-3 ${className}`}>
            <div className="invite-link">
                <code>{inviteLink}</code>
                <Button
                    variant="quiet"
                    size="icon"
                    aria-label="Copy invite link"
                    onClick={() => void run(async () => { await copyInviteLink(); return 'copied'; })}
                    disabled={isWorking}
                >
                    {status === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </Button>
            </div>
            {canNativeShare ? (
                <Button onClick={() => void run(shareInviteLink)} disabled={isWorking}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Share invite
                </Button>
            ) : null}
            {MESSAGES[status] ? (
                <p
                    role={status === 'error' ? 'alert' : 'status'}
                    className={`status-note ${status === 'error' ? 'status-note--error' : 'status-note--success'}`}
                    style={{ margin: 0 }}
                >
                    {MESSAGES[status]}
                </p>
            ) : null}
        </div>
    );
};

export default InviteLinkCard;
