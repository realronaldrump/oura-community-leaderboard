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
        status: 'idle', currentStep: '', stepsCompleted: 0, totalSteps: 0, details: '',
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
            await updateProfile({ firstName, lastName });
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
            await fullSync(activeProfile.token, (progress) => { setSyncProgress(progress); });
            await queryClient.invalidateQueries({ queryKey: ['dailyStats'] });
            await queryClient.invalidateQueries({ queryKey: ['allTimeStats'] });
            await queryClient.invalidateQueries({ queryKey: ['heartRate'] });
        } catch (err) {
            console.error('Full sync failed:', err);
            setSyncProgress(prev => ({ ...prev, status: 'error', error: 'Something went wrong. Please try again.' }));
        }
    };

    const handleBackToDashboard = () => { window.history.back(); };

    if (!activeProfile) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-[#666]">Please select a profile first.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0C0C0C] text-[#FAFAFA]">
            <SyncModal isOpen={showSyncModal} progress={syncProgress} onClose={() => setShowSyncModal(false)} />

            <nav className="sticky top-0 z-40 bg-[#0C0C0C]/90 backdrop-blur-md border-b border-[#1C1C1C] px-4 py-3">
                <div className="max-w-2xl mx-auto flex justify-between items-center">
                    <button onClick={handleBackToDashboard} className="text-[#666] hover:text-[#FAFAFA] transition-colors flex items-center gap-2 text-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                    </button>
                    <h1 className="text-base font-semibold">Settings</h1>
                    <div className="w-16" />
                </div>
            </nav>

            <div className="max-w-2xl mx-auto px-4 pt-8 pb-12">
                {/* Profile */}
                <section className="mb-8">
                    <h2 className="text-xs text-[#666] uppercase tracking-wider mb-3">Profile</h2>
                    <div className="bg-[#141414] border border-[#222] rounded-lg p-5 space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-[#666] mb-1.5 uppercase tracking-wide">First Name</label>
                                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full bg-[#0C0C0C] border border-[#333] rounded-md px-3 py-2.5 text-[#FAFAFA] text-sm focus:border-[#00C896] outline-none transition-colors"
                                    placeholder="First name" />
                            </div>
                            <div>
                                <label className="block text-xs text-[#666] mb-1.5 uppercase tracking-wide">Last Name</label>
                                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                                    className="w-full bg-[#0C0C0C] border border-[#333] rounded-md px-3 py-2.5 text-[#FAFAFA] text-sm focus:border-[#00C896] outline-none transition-colors"
                                    placeholder="Last name" />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <div>
                                <p className="text-xs text-[#666] mb-0.5">Email</p>
                                <p className="text-sm text-[#A0A0A0]">{activeProfile.email}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {saveMessage && (
                                    <span className={`text-xs ${saveMessage.includes('Failed') ? 'text-[#F87171]' : 'text-[#00C896]'}`}>{saveMessage}</span>
                                )}
                                <button onClick={handleSaveProfile} disabled={isSaving}
                                    className="px-4 py-2 bg-[#00C896] text-[#0C0C0C] font-medium rounded-md text-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                                    {isSaving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </div>

                        <hr className="border-[#222]" />

                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[#666]">Switch profile</span>
                            <button onClick={() => setActiveProfileId('')} className="text-sm text-[#00C896] hover:opacity-80 transition-opacity">Switch</button>
                        </div>
                    </div>
                </section>

                {/* Data Sync */}
                <section className="mb-8">
                    <h2 className="text-xs text-[#666] uppercase tracking-wider mb-3">Data Sync</h2>
                    <div className="bg-[#141414] border border-[#222] rounded-lg p-5 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <p className="text-[#FAFAFA] font-medium text-sm">Full Data Sync</p>
                                <p className="text-[#666] text-xs mt-1">Download your complete Oura history. This may take a few minutes.</p>
                            </div>
                            <button onClick={handleFullSync} className="px-4 py-2 border border-[#333] text-[#FAFAFA] font-medium rounded-md text-sm hover:bg-[#1C1C1C] transition-colors">
                                Sync All
                            </button>
                        </div>
                        <hr className="border-[#222]" />
                        <p className="text-xs text-[#666]">
                            The dashboard syncs recent data automatically every hour. Use Full Sync here to backfill your complete history.
                        </p>
                    </div>
                </section>

                {/* Add Profile */}
                <section>
                    <h2 className="text-xs text-[#666] uppercase tracking-wider mb-3">Add Profile</h2>
                    <div className="bg-[#141414] border border-[#222] rounded-lg p-5">
                        <div className="flex items-center justify-between gap-4">
                            <p className="text-[#666] text-sm">Connect another Oura account.</p>
                            <button onClick={login} className="px-4 py-2 bg-[#00C896] text-[#0C0C0C] font-medium rounded-md text-sm hover:opacity-90 transition-opacity">
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
