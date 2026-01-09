import React, { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { useQueryClient } from '@tanstack/react-query';
import { fullSync, SyncProgress } from '../services/syncService';
import SyncModal from '../components/SyncModal';

const Settings: React.FC = () => {
    const { activeProfile, profiles, setActiveProfileId, login, updateProfile } = useUser();
    const queryClient = useQueryClient();

    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncProgress, setSyncProgress] = useState<SyncProgress>({
        status: 'idle',
        currentStep: '',
        stepsCompleted: 0,
        totalSteps: 0,
        details: '',
    });

    const [firstName, setFirstName] = useState(activeProfile?.firstName || '');
    const [lastName, setLastName] = useState(activeProfile?.lastName || '');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    React.useEffect(() => {
        if (activeProfile) {
            setFirstName(activeProfile.firstName || '');
            setLastName(activeProfile.lastName || '');
        }
    }, [activeProfile]);

    const handleSaveProfile = async () => {
        if (!activeProfile) return;
        setIsSaving(true);
        try {
            await updateProfile({
                firstName,
                lastName
            });
            setSaveMessage('Profile updated!');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (error) {
            console.error('Failed to update profile:', error);
            setSaveMessage('Failed to save.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleFullSync = async () => {
        if (!activeProfile) return;

        setShowSyncModal(true);

        try {
            await fullSync(activeProfile.token, (progress) => {
                setSyncProgress(progress);
            });

            // After full sync, invalidate all caches
            await queryClient.invalidateQueries({ queryKey: ['dailyStats'] });
            await queryClient.invalidateQueries({ queryKey: ['allTimeStats'] });
            await queryClient.invalidateQueries({ queryKey: ['heartRate'] });
        } catch (err) {
            console.error('Full sync failed:', err);
            setSyncProgress(prev => ({
                ...prev,
                status: 'error',
                error: 'Something went wrong. Please try again.',
            }));
        }
    };

    const handleBackToDashboard = () => {
        window.history.back();
    };

    if (!activeProfile) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-text-muted">Please select a profile first.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-void text-text-primary">
            {/* Sync Modal */}
            <SyncModal
                isOpen={showSyncModal}
                progress={syncProgress}
                onClose={() => setShowSyncModal(false)}
            />

            {/* Header */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-void/80 backdrop-blur-xl border-b border-dashboard-border px-4 md:px-8 py-4">
                <div className="max-w-2xl mx-auto flex justify-between items-center">
                    <button
                        onClick={handleBackToDashboard}
                        className="text-text-muted hover:text-text-primary transition-colors flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                    </button>
                    <h1 className="text-lg font-bold">Settings</h1>
                    <div className="w-16" /> {/* Spacer */}
                </div>
            </nav>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 pt-24 pb-12">
                {/* Profile Section */}
                <section className="mb-8">
                    <h2 className="text-sm text-text-muted uppercase tracking-wider mb-4">Profile Settings</h2>
                    <div className="glass-card p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-text-muted mb-2 uppercase tracking-wide">First Name</label>
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-text-primary focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan outline-none transition-all placeholder-text-dim/50"
                                    placeholder="Enter first name"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-text-muted mb-2 uppercase tracking-wide">Last Name</label>
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-text-primary focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan outline-none transition-all placeholder-text-dim/50"
                                    placeholder="Enter last name"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <div>
                                <p className="text-xs text-text-muted mb-1">Email Account</p>
                                <p className="text-sm text-text-secondary">{activeProfile.email}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                {saveMessage && (
                                    <span className={`text-sm ${saveMessage.includes('Failed') ? 'text-accent-rose' : 'text-accent-cyan'}`}>
                                        {saveMessage}
                                    </span>
                                )}
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={isSaving}
                                    className="btn-primary px-6 py-2 text-sm disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>

                        <hr className="border-white/5" />

                        <div className="flex justify-between items-center">
                            <span className="text-sm text-text-muted">Switch to a different profile?</span>
                            <button
                                onClick={() => setActiveProfileId('')}
                                className="text-sm text-accent-cyan hover:text-accent-cyan/80 transition-colors"
                            >
                                Switch Profile
                            </button>
                        </div>
                    </div>
                </section>

                {/* Data Sync Section */}
                <section className="mb-8">
                    <h2 className="text-sm text-text-muted uppercase tracking-wider mb-4">Data Sync</h2>
                    <div className="glass-card p-4 space-y-4">
                        {/* Full Sync Option */}
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <p className="text-text-primary font-medium">Full Data Sync</p>
                                <p className="text-text-muted text-sm mt-1">
                                    Download all your Oura data from the beginning. This retrieves your complete history and may take a few minutes.
                                </p>
                            </div>
                            <button
                                onClick={handleFullSync}
                                className="btn-secondary px-4 py-2 text-sm whitespace-nowrap"
                            >
                                Sync All
                            </button>
                        </div>

                        <hr className="border-dashboard-border" />

                        {/* Info */}
                        <div className="flex items-start gap-3 text-sm">
                            <svg className="w-5 h-5 text-accent-cyan flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-text-muted">
                                The "Sync" button in the dashboard only fetches recent data to keep things fast. Use Full Sync here to backfill your complete history.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Add Profile Section */}
                <section>
                    <h2 className="text-sm text-text-muted uppercase tracking-wider mb-4">Add Profile</h2>
                    <div className="glass-card p-4">
                        <div className="flex items-center justify-between gap-4">
                            <p className="text-text-muted text-sm">
                                Connect another Oura account to compare with friends.
                            </p>
                            <button
                                onClick={login}
                                className="btn-primary px-4 py-2 text-sm whitespace-nowrap"
                            >
                                + Add
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Settings;
