import React from 'react';
import { Dialog } from './ui';
import InviteLinkCard from './InviteLinkCard';

interface InviteLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const InviteLinkModal: React.FC<InviteLinkModalProps> = ({ isOpen, onClose }) => (
    <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title="Invite a friend"
        description="Friends join by connecting their Oura account. Anyone with this link can see the board, so share it only with people you trust."
    >
        <InviteLinkCard />
    </Dialog>
);

export default InviteLinkModal;
