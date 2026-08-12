import React, { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import PrimaryProfileSwitcher from '../components/PrimaryProfileSwitcher';
import InviteLinkCard from '../components/InviteLinkCard';
import { Button, Dialog } from '../components/ui';
import { DataExclusionRange } from '../types';
import { getProfileDisplayName } from '../utils/profileName';
import { formatISODateForDisplay, isISODateString } from '../utils/date';
import { getProfileLocalISODate } from '../utils/profileTemporal';
import { profileRequiresReconnect } from '../utils/profileSyncHealth';
import {
    getDataExclusionRangeDayCount,
    getTotalExcludedDayCount,
    normalizeDataExclusionRanges,
} from '../utils/dataExclusions';

const Settings: React.FC = () => {
    const {
        activeProfile,
        profiles,
        setActiveProfileId,
        removeProfile,
        login,
        updateProfile,
    } = useUser();
    const [isProfileManagerOpen, setIsProfileManagerOpen] = useState(false);
    const [profileToRemoveId, setProfileToRemoveId] = useState<string | null>(null);
    const [isRemovingProfile, setIsRemovingProfile] = useState(false);
    const [profileManagerError, setProfileManagerError] = useState('');

    const [firstName, setFirstName] = useState(activeProfile?.firstName || '');
    const [lastName, setLastName] = useState(activeProfile?.lastName || '');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [exclusionStartDay, setExclusionStartDay] = useState(activeProfile ? getProfileLocalISODate(activeProfile) : '');
    const [exclusionEndDay, setExclusionEndDay] = useState(activeProfile ? getProfileLocalISODate(activeProfile) : '');
    const [exclusionLabel, setExclusionLabel] = useState('');
    const [isSavingExclusion, setIsSavingExclusion] = useState(false);
    const [exclusionMessage, setExclusionMessage] = useState('');

    React.useEffect(() => {
        if (activeProfile) {
            setFirstName(activeProfile.firstName || '');
            setLastName(activeProfile.lastName || '');
        }
    }, [activeProfile]);

    React.useEffect(() => {
        if (!activeProfile) return;
        const profileToday = getProfileLocalISODate(activeProfile);
        setExclusionStartDay(profileToday);
        setExclusionEndDay(profileToday);
        setExclusionLabel('');
        setExclusionMessage('');
    }, [activeProfile?.id]);

    const dataExclusionRanges = React.useMemo(
        () => normalizeDataExclusionRanges(activeProfile?.dataExclusionRanges),
        [activeProfile?.dataExclusionRanges]
    );
    const excludedDayCount = React.useMemo(
        () => getTotalExcludedDayCount(dataExclusionRanges),
        [dataExclusionRanges]
    );

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

    const persistDataExclusionRanges = async (ranges: DataExclusionRange[], successMessage: string) => {
        if (!activeProfile) return;
        setIsSavingExclusion(true);
        setExclusionMessage('');
        try {
            await updateProfile({ dataExclusionRanges: normalizeDataExclusionRanges(ranges) });
            setExclusionMessage(successMessage);
            setTimeout(() => setExclusionMessage(''), 3000);
        } catch (error) {
            console.error('Failed to update data exclusions:', error);
            setExclusionMessage('Failed to save exclusions.');
        } finally {
            setIsSavingExclusion(false);
        }
    };

    const handleAddDataExclusion = async () => {
        if (!activeProfile) return;
        if (!isISODateString(exclusionStartDay) || !isISODateString(exclusionEndDay)) {
            setExclusionMessage('Choose a valid start and end date.');
            return;
        }

        const [startDay, endDay] = exclusionStartDay <= exclusionEndDay
            ? [exclusionStartDay, exclusionEndDay]
            : [exclusionEndDay, exclusionStartDay];
        const now = new Date().toISOString();
        const newRange: DataExclusionRange = {
            id: crypto.randomUUID(),
            startDay,
            endDay,
            label: exclusionLabel.trim() || null,
            createdAt: now,
            updatedAt: now,
        };

        await persistDataExclusionRanges(
            [...dataExclusionRanges, newRange],
            startDay === endDay ? 'Excluded day saved.' : 'Excluded range saved.'
        );
        setExclusionLabel('');
    };

    const handleRemoveDataExclusion = async (id: string) => {
        await persistDataExclusionRanges(
            dataExclusionRanges.filter((range) => range.id !== id),
            'Excluded range removed.'
        );
    };

    const handleBackToDashboard = () => {
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    const closeProfileManager = () => {
        if (isRemovingProfile) return;
        setIsProfileManagerOpen(false);
        setProfileToRemoveId(null);
        setProfileManagerError('');
    };

    const handleOpenManagedProfile = (profileId: string) => {
        setActiveProfileId(profileId);
        closeProfileManager();
    };

    const handleRemoveManagedProfile = async () => {
        if (!profileToRemoveId || profiles.length <= 1) return;
        const fallbackProfile = profiles.find((profile) => profile.id !== profileToRemoveId) || null;
        setIsRemovingProfile(true);
        setProfileManagerError('');
        try {
            await removeProfile(profileToRemoveId);
            if (activeProfile?.id === profileToRemoveId && fallbackProfile) {
                setActiveProfileId(fallbackProfile.id);
            }
            setProfileToRemoveId(null);
        } catch (error) {
            console.error('Failed to remove profile:', error);
            setProfileManagerError('That profile could not be removed. Please try again.');
        } finally {
            setIsRemovingProfile(false);
        }
    };
    const profileToRemove = profiles.find((profile) => profile.id === profileToRemoveId) || null;

    if (!activeProfile) {
        return (
            <main className="min-h-screen bg-canvas text-ink flex flex-col items-center justify-center p-4">
                <div className="text-center max-w-md w-full space-y-6">
                    <div>
                        <h2 className="text-xl font-semibold mb-2">No Profile Selected</h2>
                        <p className="text-ink-muted text-sm">Please connect an Oura account or select an existing profile to view settings.</p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <button onClick={login} className="min-h-11 w-full px-4 py-2.5 bg-accent text-white font-medium rounded-[14px] text-sm hover:opacity-90 transition-opacity">
                            Connect Oura Account
                        </button>
                        <button onClick={handleBackToDashboard} className="min-h-11 w-full px-4 py-2.5 border border-line-strong text-ink font-medium rounded-[14px] text-sm hover:bg-surface-raised transition-colors">
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <div className="min-h-screen bg-canvas text-ink">
            <Dialog
                isOpen={isProfileManagerOpen}
                title={profileToRemoveId ? 'Remove this sleeper?' : 'Manage sleepers'}
                description={profileToRemoveId
                    ? 'This removes the profile and its saved leaderboard history from this shared app.'
                    : 'Switch who you are viewing or remove an account that should no longer be in the circle.'}
                onClose={closeProfileManager}
                busy={isRemovingProfile}
            >
                {profileToRemoveId ? (
                    <div>
                        <p className="m-0 text-sm leading-6 text-ink-secondary">
                            Remove <strong className="text-ink">{profileToRemove ? getProfileDisplayName(profileToRemove) : 'this sleeper'}</strong>? This cannot be undone from the app.
                        </p>
                        {profileManagerError ? <p className="mt-3 text-sm text-error" role="alert">{profileManagerError}</p> : null}
                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                            <Button variant="secondary" onClick={() => setProfileToRemoveId(null)} disabled={isRemovingProfile}>
                                Keep profile
                            </Button>
                            <Button variant="danger" onClick={handleRemoveManagedProfile} disabled={isRemovingProfile} data-autofocus>
                                {isRemovingProfile ? 'Removing…' : 'Remove profile'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {profiles.map((profile) => {
                            const isActive = profile.id === activeProfile?.id;
                            return (
                                <article key={profile.id} className="rounded-[var(--radius-md)] border border-line bg-surface-raised p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-ink">{getProfileDisplayName(profile)}</p>
                                            <p className="mt-1 text-xs text-ink-muted">{isActive ? 'Currently under observation' : 'In the sleep roster'}</p>
                                        </div>
                                        {isActive ? <span className="ui-badge ui-badge--accent">Viewing</span> : null}
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                        <Button variant="secondary" onClick={() => handleOpenManagedProfile(profile.id)} disabled={isActive}>
                                            {isActive ? 'Open now' : 'Open profile'}
                                        </Button>
                                        <Button
                                            variant="quiet"
                                            onClick={() => setProfileToRemoveId(profile.id)}
                                            disabled={profiles.length <= 1}
                                            aria-label={`Remove ${getProfileDisplayName(profile)}`}
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                </article>
                            );
                        })}
                        {profiles.length <= 1 ? (
                            <p className="m-0 text-sm leading-6 text-ink-muted">The only sleeper stays put. Connect another account before removing this one.</p>
                        ) : null}
                        <Button onClick={login}>Add another sleeper</Button>
                    </div>
                )}
            </Dialog>

            <header className="sticky top-0 z-40 border-b border-line bg-surface px-4 py-3">
                <div className="max-w-2xl mx-auto flex justify-between items-center">
                    <button type="button" onClick={handleBackToDashboard} className="min-h-11 text-ink-muted hover:text-ink transition-colors flex items-center gap-2 text-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                    </button>
                    <h1 className="text-base font-semibold text-ink">Settings</h1>
                    <div className="w-16" />
                </div>
            </header>

            <main className="settings-content max-w-2xl mx-auto px-4 pt-8 pb-12">

                {/* Profile */}
                <section className="mb-8">
                    <h2 className="text-sm font-medium text-ink-secondary uppercase tracking-wider mb-4">Profile</h2>
                    <div className="rounded-[18px] border border-line bg-surface p-5 shadow-sm space-y-5">
                        <div>
                            <p className="text-xs text-ink-muted mb-1.5 uppercase tracking-wide">Email</p>
                            <p className="text-sm text-ink bg-canvas border border-line rounded-[12px] px-3 py-2.5 cursor-not-allowed opacity-70">{activeProfile.email}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="settings-first-name" className="block text-xs text-ink-muted mb-1.5 uppercase tracking-wide">First Name</label>
                                <input id="settings-first-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full bg-canvas border border-line-strong rounded-[12px] px-3 py-2.5 text-ink text-sm focus:border-[#6B9E8A] outline-none transition-colors"
                                    placeholder="First name" />
                            </div>
                            <div>
                                <label htmlFor="settings-last-name" className="block text-xs text-ink-muted mb-1.5 uppercase tracking-wide">Last Name</label>
                                <input id="settings-last-name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                                    className="w-full bg-canvas border border-line-strong rounded-[12px] px-3 py-2.5 text-ink text-sm focus:border-[#6B9E8A] outline-none transition-colors"
                                    placeholder="Last name" />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            {saveMessage && (
                                <span className={`text-xs ${saveMessage.includes('Failed') ? 'text-error' : 'text-accent'}`}>{saveMessage}</span>
                            )}
                            <button onClick={handleSaveProfile} disabled={isSaving}
                                className="px-5 py-2.5 bg-accent text-white font-medium rounded-[12px] text-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>

                        <hr className="border-line" />

                        <div className="flex flex-col items-stretch gap-4 bg-canvas border border-line rounded-[14px] p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-ink font-medium text-sm">Switch Profile</p>
                                <p className="text-ink-muted text-xs mt-1">Currently viewing as {getProfileDisplayName(activeProfile)}</p>
                            </div>
                            {profiles.length > 1 ? (
                                <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(11rem,1fr)_auto]">
                                    <PrimaryProfileSwitcher selectClassName="w-full sm:min-w-[11rem]" />
                                    <button
                                        onClick={() => setIsProfileManagerOpen(true)}
                                        className="min-h-11 px-4 py-2 border border-line-strong text-ink font-medium rounded-[12px] text-sm hover:bg-surface-raised transition-colors whitespace-nowrap"
                                    >
                                        Manage
                                    </button>
                                </div>
                            ) : (
                                <p className="text-ink-muted text-xs">Add another profile to enable switching.</p>
                            )}
                        </div>
                    </div>
                </section>

                {profileRequiresReconnect(activeProfile) ? (
                    <section className="mb-8" aria-labelledby="oura-connection-heading">
                        <div className="rounded-[18px] border border-line bg-surface p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-5">
                            <div>
                                <h2 id="oura-connection-heading" className="text-sm font-semibold text-ink">Reconnect Oura</h2>
                                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                                    Oura needs a fresh connection before automatic updates can continue.
                                </p>
                            </div>
                            <Button className="mt-4 w-full sm:mt-0 sm:w-auto" onClick={login}>Reconnect</Button>
                        </div>
                    </section>
                ) : null}

                {/* Data Quality */}
                <section className="mb-8">
                    <h2 className="text-sm font-medium text-ink-secondary uppercase tracking-wider mb-4">Data Quality</h2>
                    <div className="rounded-[18px] border border-line bg-surface p-5 shadow-sm space-y-5">
                        <div>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-ink font-medium text-sm">Ring Breaks & Excluded Days</p>
                                    <p className="text-ink-muted text-xs mt-1 leading-relaxed">
                                        Save days when the ring was not worn. These days stay on this profile and are omitted from dashboard scores, analytics, comparisons, competitions, and CSV exports.
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-lg font-semibold text-ink">{excludedDayCount}</p>
                                    <p className="text-[11px] uppercase tracking-wide text-ink-muted">days excluded</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="block">
                                <span className="block text-xs text-ink-muted mb-1.5 uppercase tracking-wide">Start Date</span>
                                <input
                                    type="date"
                                    value={exclusionStartDay}
                                    onChange={(event) => setExclusionStartDay(event.target.value)}
                                    className="w-full bg-canvas border border-line-strong rounded-[12px] px-3 py-2.5 text-ink text-sm focus:border-[#6B9E8A] outline-none transition-colors"
                                />
                            </label>
                            <label className="block">
                                <span className="block text-xs text-ink-muted mb-1.5 uppercase tracking-wide">End Date</span>
                                <input
                                    type="date"
                                    value={exclusionEndDay}
                                    onChange={(event) => setExclusionEndDay(event.target.value)}
                                    className="w-full bg-canvas border border-line-strong rounded-[12px] px-3 py-2.5 text-ink text-sm focus:border-[#6B9E8A] outline-none transition-colors"
                                />
                            </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                            <label className="block min-w-0">
                                <span className="block text-xs text-ink-muted mb-1.5 uppercase tracking-wide">Label</span>
                                <input
                                    type="text"
                                    value={exclusionLabel}
                                    onChange={(event) => setExclusionLabel(event.target.value)}
                                    className="w-full bg-canvas border border-line-strong rounded-[12px] px-3 py-2.5 text-ink text-sm focus:border-[#6B9E8A] outline-none transition-colors"
                                    placeholder="Travel, charging break, illness..."
                                />
                            </label>
                            <button
                                onClick={handleAddDataExclusion}
                                disabled={isSavingExclusion}
                                className="px-5 py-2.5 bg-accent text-white font-medium rounded-[12px] text-sm disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
                            >
                                {isSavingExclusion ? 'Saving...' : 'Add Exclusion'}
                            </button>
                        </div>

                        {exclusionMessage && (
                            <p className={`text-xs ${exclusionMessage.includes('Failed') || exclusionMessage.includes('valid') ? 'text-error' : 'text-accent'}`}>
                                {exclusionMessage}
                            </p>
                        )}

                        <div className="border-t border-line pt-4">
                            {dataExclusionRanges.length === 0 ? (
                                <div className="rounded-[14px] border border-line bg-canvas px-4 py-3">
                                    <p className="text-sm text-ink-secondary">No ring breaks are excluded for this profile.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {dataExclusionRanges.map((range) => {
                                        const isSingleDay = range.startDay === range.endDay;
                                        const dateLabel = isSingleDay
                                            ? formatISODateForDisplay(range.startDay, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                            : `${formatISODateForDisplay(range.startDay, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })} to ${formatISODateForDisplay(range.endDay, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                                        const dayCount = getDataExclusionRangeDayCount(range);

                                        return (
                                            <div key={range.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-canvas px-4 py-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-ink truncate">{range.label || (isSingleDay ? 'Excluded day' : 'Ring break')}</p>
                                                    <p className="text-xs text-ink-muted mt-1">{dateLabel} - {dayCount} {dayCount === 1 ? 'day' : 'days'}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveDataExclusion(range.id)}
                                                    disabled={isSavingExclusion}
                                                    className="px-3 py-1.5 border border-line-strong text-ink-secondary font-medium rounded-[10px] text-xs hover:bg-surface-raised transition-colors disabled:opacity-50"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Add Profiles */}
                <section>
                    <h2 className="text-sm font-medium text-ink-secondary uppercase tracking-wider mb-4">Add Profiles</h2>
                    <div className="space-y-4">
                        <div className="rounded-[18px] border border-line bg-surface p-5 shadow-sm">
                            <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex-1">
                                    <p className="text-ink font-medium text-sm">Connect Another Account</p>
                                    <p className="text-ink-muted text-xs mt-1">Add another Oura profile to the leaderboard.</p>
                                </div>
                                <button onClick={login} className="min-h-11 w-full rounded-[12px] bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto whitespace-nowrap">
                                    Connect Account
                                </button>
                            </div>
                        </div>

                        <InviteLinkCard
                            title="Invite a friend"
                            description="They can connect Oura and add themselves to the board. Anyone with this app link can open the shared board, so only send it to someone you trust."
                            memberCount={profiles.length}
                        />
                    </div>
                </section>
            </main>
        </div>
    );
};

export default Settings;
