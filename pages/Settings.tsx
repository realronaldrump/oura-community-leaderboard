import React, { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { useQueryClient } from '@tanstack/react-query';
import { fullSync, SyncProgress } from '../services/syncService';
import SyncModal from '../components/SyncModal';

const Settings: React.FC = () => {
    const { activeProfile, profiles, setActiveProfileId, login } = useUser();
    const queryClient = useQueryClient();

    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncProgress, setSyncProgress] = useState<SyncProgress>({
        status: 'idle',
        currentStep: '',
        stepsCompleted: 0,
        totalSteps: 0,
        details: '',
    });

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
                    <h2 className="text-sm text-text-muted uppercase tracking-wider mb-4">Profile</h2>
                    <div className="glass-card p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-text-primary font-medium">
                                    {activeProfile.email?.split('@')[0] || 'User'}
                                </p>
                                <p className="text-text-muted text-sm">
                                    {activeProfile.email}
                                </p>
                            </div>
                            <button
                                onClick={() => setActiveProfileId('')}
                                className="text-sm text-accent-cyan hover:text-accent-cyan/80 transition-colors"
                            >
                                Switch
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
                            <span className="text-accent-cyan">ℹ️</span>
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
