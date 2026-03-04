import React, { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { useQueryClient } from '@tanstack/react-query';
import { fullSync, SyncProgress } from '../services/syncService';
import SyncModal from '../components/SyncModal';
import PrimaryProfileSwitcher from '../components/PrimaryProfileSwitcher';
import { ouraService } from '../services/ouraService';
import { webhookService } from '../services/webhookService';
import { DailyStats } from '../types';
import { getProfileDisplayName } from '../utils/profileName';
import { formatLocalISODate } from '../utils/date';

type QuickCheckStatus = 'idle' | 'running' | 'ok' | 'warning' | 'error';

type QuickCheckState = {
    status: QuickCheckStatus;
    message: string;
    details: string[];
    checkedAt: string | null;
};

type WebhookStatusState = {
    status: 'idle' | 'running' | 'ok' | 'warning' | 'error';
    message: string;
    details: string[];
    checkedAt: string | null;
};

const QUICK_CHECK_LOOKBACK_DAYS = 3;

const toDay = (date: Date): string => formatLocalISODate(date);

const shiftDay = (day: string, delta: number): string => {
    const value = new Date(`${day}T00:00:00`);
    if (Number.isNaN(value.getTime())) return day;
    value.setDate(value.getDate() + delta);
    return toDay(value);
};

const getLatestDay = (items?: Array<{ day?: string }>): string | null => {
    if (!items?.length) return null;

    return items.reduce<string | null>((latest, item) => {
        const day = item?.day;
        if (!day) return latest;
        return !latest || day > latest ? day : latest;
    }, null);
};

const findLatestForDay = <T extends { day?: string; timestamp?: string }>(items: T[] | undefined, day?: string): T | undefined => {
    if (!items?.length || !day) return undefined;
    return items
        .filter((item) => item.day === day)
        .sort((a, b) => {
            const bTs = b.timestamp ? new Date(b.timestamp).getTime() : Number.NEGATIVE_INFINITY;
            const aTs = a.timestamp ? new Date(a.timestamp).getTime() : Number.NEGATIVE_INFINITY;
            return bTs - aTs;
        })[0];
};

const buildQuickCheckBaseline = (sleep: any[], readiness: any[], activity: any[]): DailyStats => ({
    sleep,
    readiness,
    activity,
    session: [],
    spo2: [],
    stress: [],
    resilience: [],
    heartrate: [],
    workout: [],
    guidedSession: [],
    sleepTime: [],
    tag: [],
    enhancedTag: [],
    restModePeriod: [],
    ringConfiguration: [],
    cardiovascularAge: [],
    vo2Max: [],
});

const Settings: React.FC = () => {
    const {
        activeProfile,
        profiles,
        clearActiveProfileSelection,
        login,
        updateProfile,
        getAccessTokenForProfile,
        markProfileSyncSuccess,
        markProfileSyncError,
    } = useUser();
    const queryClient = useQueryClient();

    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncProgress, setSyncProgress] = useState<SyncProgress>({
        status: 'idle', currentStep: '', stepsCompleted: 0, totalSteps: 0, details: '',
    });

    const [firstName, setFirstName] = useState(activeProfile?.firstName || '');
    const [lastName, setLastName] = useState(activeProfile?.lastName || '');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [quickCheck, setQuickCheck] = useState<QuickCheckState>({
        status: 'idle',
        message: '',
        details: [],
        checkedAt: null,
    });
    const [webhookStatus, setWebhookStatus] = useState<WebhookStatusState>({
        status: 'idle',
        message: '',
        details: [],
        checkedAt: null,
    });

    React.useEffect(() => {
        if (activeProfile) {
            setFirstName(activeProfile.firstName || '');
            setLastName(activeProfile.lastName || '');
        }
        setQuickCheck({
            status: 'idle',
            message: '',
            details: [],
            checkedAt: null,
        });
        setWebhookStatus({
            status: 'idle',
            message: '',
            details: [],
            checkedAt: null,
        });
    }, [activeProfile]);

    React.useEffect(() => {
        if (!activeProfile) return;
        let cancelled = false;

        webhookService.getStatus()
            .then((result) => {
                if (cancelled) return;
                if (!result.configured) {
                    const missing = result.missing?.length ? result.missing.join(', ') : 'server webhook configuration';
                    setWebhookStatus({
                        status: 'warning',
                        message: 'Live updates are not configured on the server yet.',
                        details: [`Missing: ${missing}`],
                        checkedAt: new Date().toISOString(),
                    });
                    return;
                }

                const activeSubscriptions = result.subscriptions?.length || 0;
                const details = [
                    `Callback URL: ${result.callbackUrl}`,
                    `Data types: ${result.dataTypes.join(', ')}`,
                    `Subscriptions active: ${activeSubscriptions}`,
                ];

                setWebhookStatus({
                    status: activeSubscriptions > 0 ? 'ok' : 'warning',
                    message: activeSubscriptions > 0
                        ? 'Live webhook updates are enabled.'
                        : 'Webhook config is ready, but subscriptions are not active yet.',
                    details,
                    checkedAt: new Date().toISOString(),
                });
            })
            .catch(() => {
                if (cancelled) return;
                // Keep status idle; manual "Enable Live Updates" can surface full diagnostics.
            });

        return () => {
            cancelled = true;
        };
    }, [activeProfile?.id]);

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
            const runSync = async (forceRefresh: boolean = false) => {
                const token = await getAccessTokenForProfile(activeProfile.id, { forceRefresh });
                return fullSync(token, (progress) => { setSyncProgress(progress); }, {
                    grantedScopes: activeProfile.grantedScopes,
                    availabilityKey: activeProfile.id,
                });
            };

            let syncedData;
            try {
                syncedData = await runSync(false);
            } catch (error) {
                const message = error instanceof Error ? error.message.toLowerCase() : '';
                const shouldRetry = message.includes('unauthorized') || message.includes('401');
                if (!shouldRetry) throw error;
                syncedData = await runSync(true);
            }

            queryClient.setQueryData(['dailyStats', activeProfile.id], syncedData);
            queryClient.setQueryData(['allTimeStats', activeProfile.id], syncedData);
            await markProfileSyncSuccess(activeProfile.id);
        } catch (err) {
            console.error('Full sync failed:', err);
            setSyncProgress(prev => ({ ...prev, status: 'error', error: 'Something went wrong. Please try again.' }));
            await markProfileSyncError(activeProfile.id, err);
        }
    };

    const handleBackToDashboard = () => { window.history.back(); };

    const handleQuickCheck = async () => {
        if (!activeProfile) return;

        setQuickCheck({
            status: 'running',
            message: 'Checking Oura API and recent metrics...',
            details: [],
            checkedAt: null,
        });

        try {
            const endDay = toDay(new Date());
            const startDay = shiftDay(endDay, -QUICK_CHECK_LOOKBACK_DAYS);

            const runCheck = async (forceRefresh: boolean = false) => {
                const token = await getAccessTokenForProfile(activeProfile.id, { forceRefresh });
                return Promise.all([
                    ouraService.getDailySleep(token, startDay, endDay, { availabilityKey: activeProfile.id }),
                    ouraService.getDailyReadiness(token, startDay, endDay, { availabilityKey: activeProfile.id }),
                    ouraService.getDailyActivity(token, startDay, endDay, { availabilityKey: activeProfile.id }),
                ]);
            };

            let sleep: any[] = [];
            let readiness: any[] = [];
            let activity: any[] = [];

            try {
                [sleep, readiness, activity] = await runCheck(false);
            } catch (error) {
                const message = error instanceof Error ? error.message.toLowerCase() : '';
                const shouldRetry = message.includes('unauthorized') || message.includes('401');
                if (!shouldRetry) throw error;
                [sleep, readiness, activity] = await runCheck(true);
            }

            const apiLatestDays = {
                sleep: getLatestDay(sleep),
                readiness: getLatestDay(readiness),
                activity: getLatestDay(activity),
            };

            const cached = queryClient.getQueryData(['dailyStats', activeProfile.id]) as DailyStats | undefined;
            const hasLocalBaseline = Boolean(
                getLatestDay(cached?.sleep) ||
                getLatestDay(cached?.readiness) ||
                getLatestDay(cached?.activity)
            );

            let effectiveCached = cached;
            let hydratedFromQuickCheck = false;

            if (!hasLocalBaseline) {
                hydratedFromQuickCheck = true;

                effectiveCached = cached
                    ? {
                        ...cached,
                        sleep: cached.sleep?.length ? cached.sleep : sleep,
                        readiness: cached.readiness?.length ? cached.readiness : readiness,
                        activity: cached.activity?.length ? cached.activity : activity,
                    }
                    : buildQuickCheckBaseline(sleep, readiness, activity);

                queryClient.setQueryData(['dailyStats', activeProfile.id], effectiveCached);
            }

            const localLatestDays = {
                sleep: getLatestDay(effectiveCached?.sleep),
                readiness: getLatestDay(effectiveCached?.readiness),
                activity: getLatestDay(effectiveCached?.activity),
            };

            const staleMetrics: string[] = [];
            const noRecentApiData: string[] = [];
            const valueMismatches: string[] = [];
            const metrics: Array<keyof typeof apiLatestDays> = ['sleep', 'readiness', 'activity'];

            metrics.forEach((metric) => {
                const apiDay = apiLatestDays[metric];
                const localDay = localLatestDays[metric];

                if (!apiDay) {
                    noRecentApiData.push(metric);
                    return;
                }

                if (!localDay || localDay < apiDay) {
                    staleMetrics.push(metric);
                }
            });

            const apiLatestActivity = findLatestForDay(activity, apiLatestDays.activity || undefined);
            const localLatestActivity = findLatestForDay(effectiveCached?.activity, localLatestDays.activity || undefined);
            if (
                apiLatestDays.activity &&
                localLatestDays.activity &&
                apiLatestDays.activity === localLatestDays.activity &&
                apiLatestActivity &&
                localLatestActivity
            ) {
                const apiSteps = Number(apiLatestActivity.steps ?? 0);
                const localSteps = Number(localLatestActivity.steps ?? 0);
                const stepDelta = Math.abs(apiSteps - localSteps);
                if (stepDelta >= 500) {
                    valueMismatches.push(
                        `Activity steps differ on ${apiLatestDays.activity}: cache ${localSteps.toLocaleString()} vs API ${apiSteps.toLocaleString()}`
                    );
                }
            }

            const details = [
                `Oura latest days - Sleep: ${apiLatestDays.sleep ?? 'n/a'}, Readiness: ${apiLatestDays.readiness ?? 'n/a'}, Activity: ${apiLatestDays.activity ?? 'n/a'}`,
                `Local cached days - Sleep: ${localLatestDays.sleep ?? 'n/a'}, Readiness: ${localLatestDays.readiness ?? 'n/a'}, Activity: ${localLatestDays.activity ?? 'n/a'}`,
            ];

            if (staleMetrics.length > 0) {
                details.push(`Behind latest Oura data: ${staleMetrics.join(', ')}`);
            }

            if (noRecentApiData.length > 0) {
                details.push(`No recent Oura data returned for: ${noRecentApiData.join(', ')}`);
            }

            valueMismatches.forEach((detail) => details.push(detail));

            if (hydratedFromQuickCheck) {
                details.push('Local metric cache was empty and has been hydrated from this quick check.');
            }

            let status: QuickCheckStatus = 'ok';
            let message = 'Oura API is working and cached metrics look up to date.';

            if (hydratedFromQuickCheck) {
                status = 'ok';
                message = 'Oura API is working and local metrics cache has been refreshed.';
            } else if (staleMetrics.length > 0 || valueMismatches.length > 0) {
                status = 'warning';
                message = valueMismatches.length > 0
                    ? 'Oura API is working, but cached values differ from the latest API data.'
                    : 'Oura API is working, but some cached metrics are behind the latest Oura data.';
            } else if (metrics.every((metric) => !apiLatestDays[metric])) {
                status = 'warning';
                message = 'Oura API is working, but no recent daily metrics were returned to compare freshness.';
            }

            setQuickCheck({
                status,
                message,
                details,
                checkedAt: new Date().toISOString(),
            });
        } catch (error) {
            const rawMessage = error instanceof Error ? error.message : 'Unknown error';
            const lower = rawMessage.toLowerCase();
            const message = (lower.includes('unauthorized') || lower.includes('401'))
                ? 'Oura check failed: authorization expired. Reconnect your Oura account.'
                : 'Oura check failed. Please try again.';

            setQuickCheck({
                status: 'error',
                message,
                details: [rawMessage],
                checkedAt: new Date().toISOString(),
            });
        }
    };

    const handleEnableLiveUpdates = async () => {
        setWebhookStatus({
            status: 'running',
            message: 'Configuring Oura webhook subscriptions...',
            details: [],
            checkedAt: null,
        });

        try {
            const result = await webhookService.ensureSetup();
            if (!result.configured) {
                const missing = result.missing?.length ? result.missing.join(', ') : 'server webhook configuration';
                setWebhookStatus({
                    status: 'warning',
                    message: 'Live updates are not configured on the server yet.',
                    details: [`Missing: ${missing}`],
                    checkedAt: new Date().toISOString(),
                });
                return;
            }

            const createdCount = result.created?.length || 0;
            const renewedCount = result.renewed?.length || 0;
            const existingCount = result.existing?.length || 0;
            const totalActive = createdCount + renewedCount + existingCount;
            const details = [
                `Callback URL: ${result.callbackUrl}`,
                `Data types: ${result.dataTypes.join(', ')}`,
                `Subscriptions active: ${totalActive}`,
                `Created: ${createdCount} | Renewed: ${renewedCount} | Existing: ${existingCount}`,
            ];

            setWebhookStatus({
                status: 'ok',
                message: 'Live webhook updates are enabled.',
                details,
                checkedAt: new Date().toISOString(),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown webhook setup error';
            setWebhookStatus({
                status: 'error',
                message: 'Could not enable live webhook updates.',
                details: [message],
                checkedAt: new Date().toISOString(),
            });
        }
    };

    if (!activeProfile) {
        return (
            <div className="min-h-screen bg-[#0C0C0C] text-[#FAFAFA] flex flex-col items-center justify-center p-4">
                <div className="text-center max-w-md w-full space-y-6">
                    <div>
                        <h2 className="text-xl font-semibold mb-2">No Profile Selected</h2>
                        <p className="text-[#666] text-sm">Please connect an Oura account or select an existing profile to view settings.</p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <button onClick={login} className="w-full px-4 py-2.5 bg-[#00C896] text-[#0C0C0C] font-medium rounded-md text-sm hover:opacity-90 transition-opacity">
                            Connect Oura Account
                        </button>
                        <button onClick={handleBackToDashboard} className="w-full px-4 py-2.5 border border-[#333] text-[#FAFAFA] font-medium rounded-md text-sm hover:bg-[#1C1C1C] transition-colors">
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0C0C0C] text-[#FAFAFA]">
            <SyncModal isOpen={showSyncModal} progress={syncProgress} onClose={() => setShowSyncModal(false)} />

            <nav className="sticky top-0 z-40 bg-[#0C0C0C]/80 backdrop-blur-xl border-b border-[#1C1C1C] px-4 py-3">
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
                    <h2 className="text-sm font-medium text-[#A0A0A0] uppercase tracking-wider mb-4">Profile</h2>
                    <div className="bg-[#141414] border border-[#222] rounded-lg p-5 space-y-5">
                        <div>
                            <p className="text-xs text-[#666] mb-1.5 uppercase tracking-wide">Email</p>
                            <p className="text-sm text-[#FAFAFA] bg-[#0C0C0C] border border-[#222] rounded-md px-3 py-2.5 cursor-not-allowed opacity-70">{activeProfile.email}</p>
                        </div>
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

                        <div className="flex items-center justify-end gap-3 pt-2">
                            {saveMessage && (
                                <span className={`text-xs ${saveMessage.includes('Failed') ? 'text-[#F87171]' : 'text-[#00C896]'}`}>{saveMessage}</span>
                            )}
                            <button onClick={handleSaveProfile} disabled={isSaving}
                                className="px-5 py-2.5 bg-[#00C896] text-[#0C0C0C] font-medium rounded-md text-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>

                        <hr className="border-[#222]" />

                        <div className="flex justify-between items-center bg-[#0C0C0C] border border-[#222] rounded-md p-4">
                            <div>
                                <p className="text-[#FAFAFA] font-medium text-sm">Switch Profile</p>
                                <p className="text-[#666] text-xs mt-1">Currently viewing as {getProfileDisplayName(activeProfile)}</p>
                            </div>
                            {profiles.length > 1 ? (
                                <div className="flex items-center gap-2">
                                    <PrimaryProfileSwitcher selectClassName="min-w-[11rem]" />
                                    <button
                                        onClick={clearActiveProfileSelection}
                                        className="px-4 py-2 border border-[#333] text-[#FAFAFA] font-medium rounded-md text-sm hover:bg-[#1C1C1C] transition-colors whitespace-nowrap"
                                    >
                                        Manage
                                    </button>
                                </div>
                            ) : (
                                <p className="text-[#666] text-xs">Add another profile to enable switching.</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* Data Sync */}
                <section className="mb-8">
                    <h2 className="text-sm font-medium text-[#A0A0A0] uppercase tracking-wider mb-4">Data Sync</h2>
                    <div className="bg-[#141414] border border-[#222] rounded-lg p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <p className="text-[#FAFAFA] font-medium text-sm">Full Data Sync</p>
                                <p className="text-[#666] text-xs mt-1 leading-relaxed">
                                    Download your complete Oura history. This may take a few minutes.<br />
                                    The dashboard syncs recent data automatically every hour. Use Full Sync here to backfill your complete history.
                                </p>
                            </div>
                            <button onClick={handleFullSync} className="px-4 py-2 border border-[#333] text-[#FAFAFA] font-medium rounded-md text-sm hover:bg-[#1C1C1C] transition-colors whitespace-nowrap">
                                Sync All Data
                            </button>
                        </div>

                        <div className="mt-5 pt-5 border-t border-[#222]">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <p className="text-[#FAFAFA] font-medium text-sm">Quick API & Freshness Check</p>
                                    <p className="text-[#666] text-xs mt-1 leading-relaxed">
                                        Fast verification against Oura `daily_sleep`, `daily_readiness`, and `daily_activity` endpoints over the last {QUICK_CHECK_LOOKBACK_DAYS + 1} days.
                                    </p>
                                </div>
                                <button
                                    onClick={handleQuickCheck}
                                    disabled={quickCheck.status === 'running'}
                                    className="px-4 py-2 border border-[#333] text-[#FAFAFA] font-medium rounded-md text-sm hover:bg-[#1C1C1C] transition-colors whitespace-nowrap disabled:opacity-50"
                                >
                                    {quickCheck.status === 'running' ? 'Checking...' : 'Run Check'}
                                </button>
                            </div>

                            {quickCheck.status !== 'idle' && (
                                <div
                                    className={`mt-3 rounded-md border px-3 py-2.5 text-xs ${
                                        quickCheck.status === 'ok'
                                            ? 'border-[#00C896]/40 bg-[#00C896]/10 text-[#9AF0D3]'
                                            : quickCheck.status === 'warning'
                                                ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FCD34D]'
                                                : quickCheck.status === 'error'
                                                    ? 'border-[#F87171]/40 bg-[#F87171]/10 text-[#FCA5A5]'
                                                    : 'border-[#333] bg-[#0C0C0C] text-[#A0A0A0]'
                                    }`}
                                >
                                    <p className="font-medium">{quickCheck.message}</p>
                                    {quickCheck.details.map((detail, index) => (
                                        <p key={`${detail}-${index}`} className="mt-1.5">{detail}</p>
                                    ))}
                                    {quickCheck.checkedAt && (
                                        <p className="mt-2 text-[11px] opacity-80">
                                            Checked {new Date(quickCheck.checkedAt).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mt-5 pt-5 border-t border-[#222]">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <p className="text-[#FAFAFA] font-medium text-sm">Live Webhook Updates</p>
                                    <p className="text-[#666] text-xs mt-1 leading-relaxed">
                                        Configure Oura webhooks so the Today view refreshes as soon as Oura publishes new data.
                                    </p>
                                </div>
                                <button
                                    onClick={handleEnableLiveUpdates}
                                    disabled={webhookStatus.status === 'running'}
                                    className="px-4 py-2 border border-[#333] text-[#FAFAFA] font-medium rounded-md text-sm hover:bg-[#1C1C1C] transition-colors whitespace-nowrap disabled:opacity-50"
                                >
                                    {webhookStatus.status === 'running' ? 'Configuring...' : 'Enable Live Updates'}
                                </button>
                            </div>

                            {webhookStatus.status !== 'idle' && (
                                <div
                                    className={`mt-3 rounded-md border px-3 py-2.5 text-xs ${
                                        webhookStatus.status === 'ok'
                                            ? 'border-[#00C896]/40 bg-[#00C896]/10 text-[#9AF0D3]'
                                            : webhookStatus.status === 'warning'
                                                ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FCD34D]'
                                                : webhookStatus.status === 'error'
                                                    ? 'border-[#F87171]/40 bg-[#F87171]/10 text-[#FCA5A5]'
                                                    : 'border-[#333] bg-[#0C0C0C] text-[#A0A0A0]'
                                    }`}
                                >
                                    <p className="font-medium">{webhookStatus.message}</p>
                                    {webhookStatus.details.map((detail, index) => (
                                        <p key={`${detail}-${index}`} className="mt-1.5">{detail}</p>
                                    ))}
                                    {webhookStatus.checkedAt && (
                                        <p className="mt-2 text-[11px] opacity-80">
                                            Checked {new Date(webhookStatus.checkedAt).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Add Profile */}
                <section>
                    <h2 className="text-sm font-medium text-[#A0A0A0] uppercase tracking-wider mb-4">Add Profile</h2>
                    <div className="bg-[#141414] border border-[#222] rounded-lg p-5">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                                <p className="text-[#FAFAFA] font-medium text-sm">Connect Another Account</p>
                                <p className="text-[#666] text-xs mt-1">Add another Oura profile to seamlessly switch between them.</p>
                            </div>
                            <button onClick={login} className="px-4 py-2 bg-[#00C896] text-[#0C0C0C] font-medium rounded-md text-sm hover:opacity-90 transition-opacity whitespace-nowrap">
                                Connect Account
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Settings;
