import React, { useRef, useState } from 'react';
import { Check, Footprints, Moon, Sun } from 'lucide-react';
import { COMPETITION_TEMPLATES, getSoloChallengeDescription } from '../../constants/competitionMetrics';
import { UserProfile } from '../../types';
import type { CreateCompetitionInput } from '../../services/competitionService';
import { CompetitionMode } from '../../types/competitionTypes';
import { getProfileDisplayName } from '../../utils/profileName';
import { formatISODateForDisplay, shiftLocalISODate } from '../../utils/date';
import { getCompetitionTodayISODate } from '../../utils/profileTemporal';
import { Button, Dialog } from '../ui';

interface CompetitionBuilderProps {
    isOpen: boolean;
    activeProfile: UserProfile;
    profiles: UserProfile[];
    onClose: () => void;
    onCreate: (input: CreateCompetitionInput) => Promise<void>;
}

const challengeIcons = [Footprints, Moon, Sun];
const challengeLabels = ['Steps', 'Sleep', 'Readiness'];

const CompetitionForm: React.FC<CompetitionBuilderProps> = ({ activeProfile, profiles, onClose, onCreate }) => {
    const [templateId, setTemplateId] = useState(COMPETITION_TEMPLATES[0].id);
    const [mode, setMode] = useState<CompetitionMode>('friends');
    const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submitting = useRef(false);
    const template = COMPETITION_TEMPLATES.find((item) => item.id === templateId)!;
    const selectableProfiles = profiles.filter((profile) => profile.id !== activeProfile.id);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startDate = shiftLocalISODate(getCompetitionTodayISODate({ timeZone }), 1);
    const endDate = shiftLocalISODate(startDate, 6);
    const description = mode === 'solo' ? getSoloChallengeDescription(template) : template.description;

    const handleCreate = async (event: React.FormEvent) => {
        event.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        setIsSubmitting(true);
        setError(null);
        const now = new Date().toISOString();
        // Derive dates again on submit in case the dialog stayed open past midnight.
        const starts = shiftLocalISODate(getCompetitionTodayISODate({ timeZone }), 1);
        try {
            await onCreate({
                title: template.title,
                description,
                mode,
                format: mode === 'solo' ? 'goal' : 'race',
                ...(mode === 'friends' ? { scoring: template.scoring } : {}),
                createdByProfileId: activeProfile.id,
                startDate: starts,
                endDate: shiftLocalISODate(starts, 6),
                timeZone,
                rules: template.rules.map((rule) => ({
                    ...rule,
                    id: crypto.randomUUID(),
                    aggregation: mode === 'solo' ? 'daily' : rule.aggregation,
                    capAtTarget: mode === 'solo',
                })),
                participants: [
                    {
                        profileId: activeProfile.id,
                        displayName: getProfileDisplayName(activeProfile),
                        status: 'accepted',
                        invitedAt: now,
                        joinedAt: now,
                        respondedAt: now,
                        source: 'creator',
                    },
                    ...(mode === 'friends' ? selectableProfiles
                        .filter((profile) => selectedParticipantIds.includes(profile.id))
                        .map((profile) => ({
                            profileId: profile.id,
                            displayName: getProfileDisplayName(profile),
                            status: 'invited' as const,
                            invitedAt: now,
                            joinedAt: null,
                            respondedAt: null,
                            source: 'selected' as const,
                        })) : []),
                ],
                templateId: template.id,
                createShareInvite: mode === 'friends',
            });
            onClose();
        } catch (createError) {
            console.error('Failed to create competition:', createError);
            setError('Couldn’t create the challenge. Try again.');
        } finally {
            submitting.current = false;
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog isOpen onClose={onClose} title="New challenge" className="!w-[min(100%,30rem)]" busy={isSubmitting}>
            <form onSubmit={handleCreate} className="space-y-6">
                <fieldset disabled={isSubmitting}>
                    <legend className="form-legend">Measure</legend>
                    <div className="grid grid-cols-3 gap-2">
                        {COMPETITION_TEMPLATES.map((option, index) => {
                            const Icon = challengeIcons[index];
                            const selected = template.id === option.id;
                            return (
                                <label key={option.id} className="relative cursor-pointer">
                                    <input
                                        data-autofocus={index === 0 ? true : undefined}
                                        type="radio"
                                        name="challenge"
                                        value={option.id}
                                        checked={selected}
                                        onChange={() => setTemplateId(option.id)}
                                        className="peer sr-only"
                                    />
                                    <span className="challenge-option">
                                        <Icon className="h-6 w-6" aria-hidden="true" />
                                        {challengeLabels[index]}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>

                <fieldset disabled={isSubmitting}>
                    <legend className="form-legend">Who’s in</legend>
                    <div className="grid grid-cols-2 gap-2">
                        {(['friends', 'solo'] as const).map((option) => (
                            <label key={option} className="cursor-pointer">
                                <input type="radio" name="participants" value={option} checked={mode === option} onChange={() => setMode(option)} className="peer sr-only" />
                                <span className="challenge-option challenge-option--compact">
                                    {option === 'friends' ? 'With friends' : 'Just me'}
                                </span>
                            </label>
                        ))}
                    </div>
                    {mode === 'friends' && selectableProfiles.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Invite friends">
                            {selectableProfiles.map((profile) => {
                                const selected = selectedParticipantIds.includes(profile.id);
                                return (
                                    <button
                                        key={profile.id}
                                        type="button"
                                        disabled={isSubmitting}
                                        aria-pressed={selected}
                                        onClick={() => setSelectedParticipantIds((current) => selected ? current.filter((id) => id !== profile.id) : [...current, profile.id])}
                                        className="challenge-option challenge-option--compact challenge-option--chip"
                                    >
                                        {selected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                                        {getProfileDisplayName(profile)}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                    {mode === 'friends' ? <p className="fine-print">You can also share an invite link afterwards.</p> : null}
                </fieldset>

                <div className="challenge-preview">
                    <strong>{template.title}</strong>
                    <p>{description}</p>
                    <small>
                        Starts tomorrow · 7 days · {formatISODateForDisplay(startDate, 'en-US', { month: 'short', day: 'numeric' })} to {formatISODateForDisplay(endDate, 'en-US', { month: 'short', day: 'numeric' })}
                    </small>
                </div>

                {error ? <p role="alert" className="status-note status-note--error">{error}</p> : null}
                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating…' : 'Create challenge'}
                </Button>
            </form>
        </Dialog>
    );
};

const CompetitionBuilder: React.FC<CompetitionBuilderProps> = (props) => props.isOpen
    ? <CompetitionForm key={props.activeProfile.id} {...props} />
    : null;

export default CompetitionBuilder;
