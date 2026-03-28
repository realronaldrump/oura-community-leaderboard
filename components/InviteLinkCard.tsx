import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Send, Users } from 'lucide-react';
import {
    buildInviteLink,
    copyInviteLink,
    InviteShareResult,
    shareInviteLink,
    supportsNativeInviteShare,
} from '../utils/inviteLink';

interface InviteLinkCardProps {
    title: string;
    description: string;
    memberCount?: number;
    className?: string;
}

type InviteCardStatus = InviteShareResult | 'idle' | 'error';

const InviteLinkCard: React.FC<InviteLinkCardProps> = ({
    title,
    description,
    memberCount,
    className = '',
}) => {
    const [status, setStatus] = useState<InviteCardStatus>('idle');
    const [isWorking, setIsWorking] = useState(false);
    const inviteLink = useMemo(() => buildInviteLink(), []);
    const canNativeShare = supportsNativeInviteShare();

    useEffect(() => {
        if (status === 'idle') return;
        const timer = window.setTimeout(() => setStatus('idle'), 2400);
        return () => window.clearTimeout(timer);
    }, [status]);

    const handleShare = async () => {
        setIsWorking(true);
        try {
            const result = await shareInviteLink();
            if (result !== 'dismissed') {
                setStatus(result);
            }
        } catch (error) {
            console.error('Failed to share invite link:', error);
            setStatus('error');
        } finally {
            setIsWorking(false);
        }
    };

    const handleCopy = async () => {
        setIsWorking(true);
        try {
            await copyInviteLink();
            setStatus('copied');
        } catch (error) {
            console.error('Failed to copy invite link:', error);
            setStatus('error');
        } finally {
            setIsWorking(false);
        }
    };

    const statusMessage = (() => {
        if (status === 'shared') return 'Invite shared.';
        if (status === 'copied') return 'Invite link copied.';
        if (status === 'error') return 'Could not share the invite link.';
        return memberCount != null
            ? `${memberCount} ${memberCount === 1 ? 'member' : 'members'} currently on the board`
            : 'Share this link with a friend';
    })();

    return (
        <div className={`rounded-[1.25rem] border border-[rgba(0,0,0,0.06)] bg-white p-5 ${className}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#C5D8CE] bg-[#EBF3EE] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#6B9E8A]">
                        <Users className="h-3.5 w-3.5" />
                        Invite Link
                    </div>
                    <h3 className="mt-3 text-lg font-semibold tracking-tight text-[#2D2A26]">{title}</h3>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#7A756E]">{description}</p>
                </div>
                <div className="rounded-full border border-[#C5D8CE] bg-[#EBF3EE] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[#6B9E8A]">
                    {statusMessage}
                </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F2EDE8]">
                <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Join URL</p>
                    {status === 'copied' || status === 'shared' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B9E8A]">
                            <Check className="h-3.5 w-3.5" />
                            Ready to send
                        </span>
                    ) : null}
                </div>
                <div className="px-4 py-3">
                    <code className="block overflow-x-auto whitespace-nowrap font-mono text-sm text-[#6B9E8A]">
                        {inviteLink}
                    </code>
                </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                    type="button"
                    onClick={handleShare}
                    disabled={isWorking}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#6B9E8A] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <Send className="h-4 w-4" />
                    {canNativeShare ? 'Share Invite' : 'Copy Invite Link'}
                </button>
                <button
                    type="button"
                    onClick={handleCopy}
                    disabled={isWorking}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(0,0,0,0.10)] px-4 py-3 text-sm font-medium text-[#2D2A26] transition-colors hover:bg-[#FAF7F4] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {status === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    Copy Link
                </button>
            </div>
        </div>
    );
};

export default InviteLinkCard;
