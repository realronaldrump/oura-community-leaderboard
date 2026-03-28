import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { IOSModal, IOSInput, IOSButton, IOSLoading } from './ios';

interface ProfileEditModalProps {
    profile: UserProfile;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: { firstName: string; lastName: string }) => Promise<void>;
}

const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
    profile,
    isOpen,
    onClose,
    onSave,
}) => {
    const [firstName, setFirstName] = useState(profile.firstName || '');
    const [lastName, setLastName] = useState(profile.lastName || '');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFirstName(profile.firstName || '');
            setLastName(profile.lastName || '');
        }
    }, [isOpen, profile]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave({ firstName: firstName.trim(), lastName: lastName.trim() });
            onClose();
        } catch (error) {
            console.error('Failed to save profile:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <IOSModal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title="Edit Profile">
            <div className="space-y-6">
                <p className="text-[#7A756E] text-sm">
                    Add your name so the app can greet you personally.
                </p>

                {/* Form */}
                <div className="space-y-4">
                    <IOSInput
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Enter your first name"
                        label="First Name"
                        autoFocus
                    />
                    <IOSInput
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Enter your last name"
                        label="Last Name"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <IOSButton
                        onClick={onClose}
                        className="flex-1"
                        variant="secondary"
                        disabled={isSaving}
                    >
                        Cancel
                    </IOSButton>
                    <IOSButton
                        onClick={handleSave}
                        className="flex-1"
                        variant="primary"
                        disabled={isSaving}
                    >
                        {isSaving ? <IOSLoading size="small" /> : 'Save'}
                    </IOSButton>
                </div>
            </div>
        </IOSModal>
    );
};

export default ProfileEditModal;
