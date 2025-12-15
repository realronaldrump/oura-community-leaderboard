import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';

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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-void/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative z-10 glass-card p-6 md:p-8 w-full max-w-md animate-fade-in-up">
                <h2 className="text-2xl font-bold text-text-primary mb-2">Edit Profile</h2>
                <p className="text-text-muted text-sm mb-6">
                    Add your name so the app can greet you personally.
                </p>

                {/* Form */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-text-secondary mb-2">
                            First Name
                        </label>
                        <input
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="Enter your first name"
                            className="w-full px-4 py-3 bg-void/50 border border-dashboard-border rounded-xl text-text-primary placeholder:text-text-dim focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/30 transition-all"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-text-secondary mb-2">
                            Last Name
                        </label>
                        <input
                            type="text"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Enter your last name"
                            className="w-full px-4 py-3 bg-void/50 border border-dashboard-border rounded-xl text-text-primary placeholder:text-text-dim focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/30 transition-all"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-8">
                    <button
                        onClick={onClose}
                        className="flex-1 btn-secondary py-3"
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 btn-primary py-3"
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Saving...
                            </span>
                        ) : (
                            'Save'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProfileEditModal;
