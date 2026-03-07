import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Send, TriangleAlert } from 'lucide-react';
import { IOSButton, IOSModal } from './ios';
import {
    buildInviteLink,
    copyInviteLink,
    InviteShareResult,
    shareInviteLink,
    supportsNativeInviteShare,
} from '../utils/inviteLink';

interface InviteLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type InviteModalStatus = InviteShareResult | 'idle' | 'error';

const InviteLinkModal: React.FC<InviteLinkModalProps> = ({ isOpen, onClose }) => {
    const [status, setStatus] = useState<InviteModalStatus>('idle');
    const [isWorking, setIsWorking] = useState(false);
    const inviteLink = useMemo(() => buildInviteLink(), []);
    const canNativeShare = supportsNativeInviteShare();

    useEffect(() => {
        if (!isOpen) {
            setStatus('idle');
            setIsWorking(false);
        }
    }, [isOpen]);

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

    const statusPanel = (() => {
        if (status === 'shared') {
            return (
                <div className="rounded-xl border border-[#1E4033] bg-[#0F1B17] px-3 py-2 text-sm text-[#9BE4C9]">
                    Invite shared.
                </div>
            );
        }

        if (status === 'copied') {
            return (
                <div className="rounded-xl border border-[#1E4033] bg-[#0F1B17] px-3 py-2 text-sm text-[#9BE4C9]">
                    Invite link copied. Paste it into a text, email, or group chat.
                </div>
            );
        }

        if (status === 'error') {
            return (
                <div className="rounded-xl border border-[#4A2323] bg-[#1A1212] px-3 py-2 text-sm text-[#FCA5A5]">
                    <div className="flex items-start gap-2">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Sharing failed on this browser. Use the visible link below and copy it manually if needed.</span>
                    </div>
                </div>
            );
        }

        return null;
    })();

    return (
        <IOSModal isOpen={isOpen} onClose={onClose} title="Invite a Friend">
            <div className="space-y-4">
                <p className="text-sm leading-relaxed text-[#A0A0A0]">
                    Send this link to a friend. They land on the join screen and can add themselves with a single Oura sign-in.
                </p>

                <div className="rounded-2xl border border-[#1E1E1E] bg-[#0C0C0C] p-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#666]">Join URL</p>
                    <code className="mt-3 block overflow-x-auto whitespace-nowrap font-mono text-sm text-[#C7F9E7]">
                        {inviteLink}
                    </code>
                </div>

                {statusPanel}

                <div className="grid gap-2">
                    <IOSButton onClick={handleShare} disabled={isWorking}>
                        <span className="inline-flex items-center gap-2">
                            {status === 'shared' ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                            {canNativeShare ? 'Share Invite' : 'Copy Invite Link'}
                        </span>
                    </IOSButton>
                    <IOSButton variant="secondary" onClick={handleCopy} disabled={isWorking}>
                        <span className="inline-flex items-center gap-2">
                            {status === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            Copy Link
                        </span>
                    </IOSButton>
                    <IOSButton variant="secondary" onClick={onClose} disabled={isWorking}>
                        Close
                    </IOSButton>
                </div>
            </div>
        </IOSModal>
    );
};

export default InviteLinkModal;
