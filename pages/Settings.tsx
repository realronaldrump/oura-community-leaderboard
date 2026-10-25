import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Download, Plus, RefreshCw } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import InviteLinkCard from '../components/InviteLinkCard';
import { Badge, Button, Dialog, Field, Input } from '../components/ui';
import { DataExclusionRange } from '../types';
import { getProfileDisplayName } from '../utils/profileName';
import { formatISODateForDisplay, isISODateString } from '../utils/date';
import { getProfileLocalISODate } from '../utils/profileTemporal';
import { profileRequiresReconnect } from '../utils/profileSyncHealth';
import { navigate } from '../hooks/useAppRoute';
import {
    getDataExclusionRangeDayCount,
    getTotalExcludedDayCount,
    normalizeDataExclusionRanges,
} from '../utils/dataExclusions';

// Mini PC storage keeps every profile's history, and its server refuses removal.
const PROFILE_REMOVAL_AVAILABLE = !import.meta.env.VITE_OURA_API_URL;

type Notice = { tone: 'success' | 'error'; text: string } | null;

const shortDate = (day: string) => formatISODateForDisplay(day, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const useTransientNotice = () => {
    const [notice, setNotice] = useState<Notice>(null);
    useEffect(() => {
        if (!notice || notice.tone === 'error') return;
        const timer = window.setTimeout(() => setNotice(null), 3000);
        return () => window.clearTimeout(timer);
    }, [notice]);
    return [notice, setNotice] as const;
};

const NoticeText: React.FC<{ notice: Notice }> = ({ notice }) => notice ? (
    <span role={notice.tone === 'error' ? 'alert' : 'status'} className={`inline-status ${notice.tone === 'error' ? 'inline-status--error' : ''}`}>
        {notice.text}
    </span>
) : <span />;

const Settings: React.FC = () => {
    const {
        activeProfile,
        profiles,
        setActiveProfileId,
        removeProfile,
        login,
        updateProfile,
    } = useUser();
    const [profileToRemoveId, setProfileToRemoveId] = useState<string | null>(null);
    const [isRemovingProfile, setIsRemovingProfile] = useState(false);
    const [removeError, setRemoveError] = useState('');

    const [firstName, setFirstName] = useState(activeProfile?.firstName || '');
    const [lastName, setLastName] = useState(activeProfile?.lastName || '');
    const [isSaving, setIsSaving] = useState(false);
    const [profileNotice, setProfileNotice] = useTransientNotice();
    const [exclusionStartDay, setExclusionStartDay] = useState(activeProfile ? getProfileLocalISODate(activeProfile) : '');
    const [exclusionEndDay, setExclusionEndDay] = useState(activeProfile ? getProfileLocalISODate(activeProfile) : '');
    const [exclusionLabel, setExclusionLabel] = useState('');
    const [isSavingExclusion, setIsSavingExclusion] = useState(false);
    const [exclusionNotice, setExclusionNotice] = useTransientNotice();

    useEffect(() => {
        if (activeProfile) {
            setFirstName(activeProfile.firstName || '');
            setLastName(activeProfile.lastName || '');
        }
    }, [activeProfile]);

    useEffect(() => {
        if (!activeProfile) return;
        const profileToday = getProfileLocalISODate(activeProfile);
        setExclusionStartDay(profileToday);
        setExclusionEndDay(profileToday);
        setExclusionLabel('');
        setExclusionNotice(null);
        // Reset the form only when a different profile is selected.
    }, [activeProfile?.id]);

    const dataExclusionRanges = useMemo(
        () => normalizeDataExclusionRanges(activeProfile?.dataExclusionRanges),
        [activeProfile?.dataExclusionRanges]
    );
    const excludedDayCount = useMemo(
        () => getTotalExcludedDayCount(dataExclusionRanges),
        [dataExclusionRanges]
    );

    if (!activeProfile) return null;

    const nameChanged = firstName.trim() !== (activeProfile.firstName || '') || lastName.trim() !== (activeProfile.lastName || '');

    const handleSaveProfile = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
            setProfileNotice({ tone: 'success', text: 'Saved.' });
        } catch (error) {
            console.error('Failed to update profile:', error);
            setProfileNotice({ tone: 'error', text: 'Couldn’t save. Try again.' });
        } finally {
            setIsSaving(false);
        }
    };

    const persistDataExclusionRanges = async (ranges: DataExclusionRange[], successText: string) => {
        setIsSavingExclusion(true);
        setExclusionNotice(null);
        try {
            await updateProfile({ dataExclusionRanges: normalizeDataExclusionRanges(ranges) });
            setExclusionNotice({ tone: 'success', text: successText });
            return true;
        } catch (error) {
            console.error('Failed to update data exclusions:', error);
            setExclusionNotice({ tone: 'error', text: 'Couldn’t save. Try again.' });
            return false;
        } finally {
            setIsSavingExclusion(false);
        }
    };

    const handleAddDataExclusion = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!isISODateString(exclusionStartDay) || !isISODateString(exclusionEndDay)) {
            setExclusionNotice({ tone: 'error', text: 'Choose a start and end date.' });
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

        if (await persistDataExclusionRanges([...dataExclusionRanges, newRange], 'Break added.')) {
            setExclusionLabel('');
        }
    };

    const handleRemoveDataExclusion = (id: string) => persistDataExclusionRanges(
        dataExclusionRanges.filter((range) => range.id !== id),
        'Break removed.'
    );

    const closeRemoveDialog = () => {
        if (isRemovingProfile) return;
        setProfileToRemoveId(null);
        setRemoveError('');
    };

    const handleRemoveProfile = async () => {
        if (!profileToRemoveId || profiles.length <= 1) return;
        const fallbackProfile = profiles.find((profile) => profile.id !== profileToRemoveId) || null;
        setIsRemovingProfile(true);
        setRemoveError('');
        try {
            await removeProfile(profileToRemoveId);
            if (activeProfile.id === profileToRemoveId && fallbackProfile) {
                setActiveProfileId(fallbackProfile.id);
            }
            setProfileToRemoveId(null);
        } catch (error) {
            console.error('Failed to remove profile:', error);
            setRemoveError((error as { code?: string })?.code === 'removal_disabled_history_is_retained'
                ? 'This server keeps every profile’s history, so profiles can’t be removed.'
                : 'Couldn’t remove this person. Try again.');
        } finally {
            setIsRemovingProfile(false);
        }
    };
    const profileToRemove = profiles.find((profile) => profile.id === profileToRemoveId) || null;

    return (
        <div>
            <header className="page-heading">
                <h1>Settings</h1>
            </header>

            {profileRequiresReconnect(activeProfile) ? (
                <section className="settings-section" aria-labelledby="connection-heading">
                    <h2 id="connection-heading">Oura connection</h2>
                    <div className="panel">
                        <div className="panel-row">
                            <div>
                                <strong>Reconnect Oura</strong>
                                <small>Syncing has stopped until you connect again.</small>
                            </div>
                            <Button size="sm" onClick={login}>
                                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                Reconnect
                            </Button>
                        </div>
                    </div>
                </section>
            ) : null}

            <section className="settings-section" aria-labelledby="profile-heading">
                <h2 id="profile-heading">Profile</h2>
                <form className="panel panel-body" onSubmit={handleSaveProfile}>
                    <div className="form-grid">
                        <Field label="First name">
                            <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
                        </Field>
                        <Field label="Last name">
                            <Input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
                        </Field>
                    </div>
                    <Field label="Email" hint="From your Oura account.">
                        <Input value={activeProfile.email || ''} readOnly disabled />
                    </Field>
                    <div className="form-actions">
                        <NoticeText notice={profileNotice} />
                        <Button type="submit" size="sm" disabled={isSaving || !nameChanged}>
                            {isSaving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </form>
            </section>

            <section className="settings-section" aria-labelledby="breaks-heading">
                <h2 id="breaks-heading">Ring breaks</h2>
                <div className="panel">
                    <div className="panel-row">
                        <div>
                            <strong>Days without the ring</strong>
                            <small>Left out of scores, records, challenges and CSV exports.</small>
                        </div>
                        <p className="exclusion-count m-0">
                            {excludedDayCount}
                            <small>{excludedDayCount === 1 ? 'day' : 'days'}</small>
                        </p>
                    </div>
                    <form className="panel-body" onSubmit={handleAddDataExclusion} style={{ borderBottom: dataExclusionRanges.length ? '1px solid var(--color-line)' : undefined }}>
                        <div className="form-grid">
                            <Field label="From">
                                <Input type="date" value={exclusionStartDay} onChange={(event) => setExclusionStartDay(event.target.value)} />
                            </Field>
                            <Field label="To">
                                <Input type="date" value={exclusionEndDay} onChange={(event) => setExclusionEndDay(event.target.value)} />
                            </Field>
                        </div>
                        <Field label="Note (optional)">
                            <Input value={exclusionLabel} onChange={(event) => setExclusionLabel(event.target.value)} placeholder="Travel, charging, illness" />
                        </Field>
                        <div className="form-actions">
                            <NoticeText notice={exclusionNotice} />
                            <Button type="submit" size="sm" variant="secondary" disabled={isSavingExclusion}>
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                {isSavingExclusion ? 'Saving…' : 'Add break'}
                            </Button>
                        </div>
                    </form>
                    {dataExclusionRanges.map((range) => {
                        const isSingleDay = range.startDay === range.endDay;
                        const dayCount = getDataExclusionRangeDayCount(range);
                        return (
                            <div key={range.id} className="panel-row">
                                <div>
                                    <strong>{range.label || (isSingleDay ? 'One day' : 'Ring break')}</strong>
                                    <small>
                                        {isSingleDay ? shortDate(range.startDay) : `${shortDate(range.startDay)} to ${shortDate(range.endDay)}`}
                                        {` · ${dayCount} ${dayCount === 1 ? 'day' : 'days'}`}
                                    </small>
                                </div>
                                <Button
                                    variant="quiet"
                                    size="sm"
                                    onClick={() => void handleRemoveDataExclusion(range.id)}
                                    disabled={isSavingExclusion}
                                    aria-label={`Remove ${range.label || 'break'} starting ${shortDate(range.startDay)}`}
                                >
                                    Remove
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="settings-section" aria-labelledby="people-heading">
                <h2 id="people-heading">People</h2>
                <div className="panel">
                    {profiles.map((profile) => {
                        const isActive = profile.id === activeProfile.id;
                        const name = getProfileDisplayName(profile);
                        return (
                            <div key={profile.id} className="person-row">
                                <span className="person-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
                                <span className="person-row__name">
                                    <strong>{name}</strong>
                                </span>
                                {isActive ? (
                                    <Badge tone="accent">Viewing</Badge>
                                ) : (
                                    <Button variant="quiet" size="sm" onClick={() => setActiveProfileId(profile.id)} aria-label={`View as ${name}`}>
                                        View
                                    </Button>
                                )}
                                {PROFILE_REMOVAL_AVAILABLE && profiles.length > 1 ? (
                                    <Button variant="quiet" size="sm" onClick={() => setProfileToRemoveId(profile.id)} aria-label={`Remove ${name}`}>
                                        Remove
                                    </Button>
                                ) : null}
                            </div>
                        );
                    })}
                    <div className="panel-row">
                        <Button variant="secondary" size="sm" onClick={login}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Connect another Oura account
                        </Button>
                    </div>
                </div>
            </section>

            <section className="settings-section" aria-labelledby="invite-heading">
                <h2 id="invite-heading">Invite</h2>
                <div className="panel panel--padded">
                    <p className="m-0 mb-3 text-[0.8125rem] leading-6 text-ink-secondary">
                        Friends join by connecting their Oura account. Anyone with this link can see the board, so share it only with people you trust.
                    </p>
                    <InviteLinkCard />
                </div>
            </section>

            <section className="settings-section" aria-labelledby="data-heading">
                <h2 id="data-heading">Data</h2>
                <div className="panel">
                    <button type="button" className="export-row" onClick={() => navigate('/settings/export')}>
                        <Download size={18} aria-hidden="true" />
                        <span>
                            <strong>Export data</strong>
                            <small>Everything saved from Oura, as JSON or CSV</small>
                        </span>
                        <ChevronRight size={16} aria-hidden="true" />
                    </button>
                </div>
            </section>

            <p className="page-footnote">Not a medical device.</p>

            <Dialog
                isOpen={Boolean(profileToRemoveId)}
                title="Remove this person?"
                description="Their profile and saved history are deleted from this app."
                onClose={closeRemoveDialog}
                busy={isRemovingProfile}
            >
                <p className="m-0 text-[0.9375rem] leading-6 text-ink-secondary">
                    Remove <strong className="text-ink">{profileToRemove ? getProfileDisplayName(profileToRemove) : 'this person'}</strong>? This can’t be undone.
                </p>
                {removeError ? <p className="status-note status-note--error" role="alert">{removeError}</p> : null}
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <Button variant="secondary" onClick={closeRemoveDialog} disabled={isRemovingProfile}>
                        Keep
                    </Button>
                    <Button variant="danger" onClick={handleRemoveProfile} disabled={isRemovingProfile} data-autofocus>
                        {isRemovingProfile ? 'Removing…' : 'Remove'}
                    </Button>
                </div>
            </Dialog>
        </div>
    );
};

export default Settings;
