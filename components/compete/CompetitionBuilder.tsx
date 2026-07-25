import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Target, Users, X } from 'lucide-react';
import { COMPETITION_METRICS, COMPETITION_TEMPLATES, getCompetitionMetricDefinition } from '../../constants/competitionMetrics';
import { UserProfile } from '../../types';
import { CreateCompetitionInput } from '../../services/competitionService';
import { CompetitionFormat, CompetitionMode, CompetitionRule, CompetitionTemplate } from '../../types/competitionTypes';
import { getProfileDisplayName } from '../../utils/profileName';
import { formatISODateForDisplay, shiftLocalISODate } from '../../utils/date';
import { getProfileLocalISODate, getProfileRelativeISODate } from '../../utils/profileTemporal';
import DateRangePicker from '../DateRangePicker';
import { Dialog } from '../ui';

type RuleDraft = {
    id: string;
    metricId: string;
    operator: 'gte' | 'lte';
    targetText: string;
    aggregation: 'daily' | 'total' | 'average';
    weightText: string;
};

interface CompetitionBuilderProps {
    isOpen: boolean;
    activeProfile: UserProfile;
    profiles: UserProfile[];
    initialTemplate?: CompetitionTemplate | null;
    onClose: () => void;
    onCreate: (input: CreateCompetitionInput) => Promise<void>;
}

const DURATIONS = [3, 5, 7, 14, 30];

const minutesToTimeInput = (value: number): string => {
    const normalized = value >= (24 * 60) ? value - (24 * 60) : value;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const timeInputToMinutes = (value: string): number | null => {
    const [hoursRaw, minutesRaw] = value.split(':');
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    const raw = (hours * 60) + minutes;
    return raw < (12 * 60) ? raw + (24 * 60) : raw;
};

const buildRuleDraft = (metricId: string, weight: number, overrides: Partial<RuleDraft> = {}): RuleDraft => {
    const metric = getCompetitionMetricDefinition(metricId as any);
    const targetText = metric.inputMode === 'time'
        ? minutesToTimeInput(metric.defaultTarget)
        : `${metric.defaultTarget}`;

    return {
        id: crypto.randomUUID(),
        metricId,
        operator: metric.defaultOperator === 'lte' ? 'lte' : 'gte',
        targetText,
        aggregation: metric.defaultAggregation,
        weightText: `${weight}`,
        ...overrides,
    };
};

const buildDraftFromTemplate = (template?: CompetitionTemplate | null) => {
    const templateToUse = template || COMPETITION_TEMPLATES[0];
    const weights = templateToUse.rules.length > 0
        ? templateToUse.rules.map((rule) => Math.round(rule.weight * 100))
        : [100];

    return {
        title: templateToUse.title,
        description: templateToUse.description,
        mode: templateToUse.mode,
        format: templateToUse.format,
        startDate: '',
        durationDays: templateToUse.durationDays,
        selectedParticipantIds: [] as string[],
        templateId: templateToUse.id,
        rules: templateToUse.rules.map((rule, index) => {
            const metric = getCompetitionMetricDefinition(rule.metricId);
            return buildRuleDraft(rule.metricId, weights[index] || 100, {
                operator: rule.operator === 'lte' ? 'lte' : 'gte',
                aggregation: rule.aggregation,
                targetText: metric.inputMode === 'time'
                    ? minutesToTimeInput(rule.target)
                    : `${rule.target}`,
            });
        }),
    };
};

const CompetitionBuilder: React.FC<CompetitionBuilderProps> = ({
    isOpen,
    activeProfile,
    profiles,
    initialTemplate = null,
    onClose,
    onCreate,
}) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [mode, setMode] = useState<CompetitionMode>('solo');
    const [format, setFormat] = useState<CompetitionFormat>('goal');
    const [startDate, setStartDate] = useState(() => getProfileRelativeISODate(activeProfile, 1));
    const [durationDays, setDurationDays] = useState(7);
    const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
    const [templateId, setTemplateId] = useState<string | null>(null);
    const [rules, setRules] = useState<RuleDraft[]>([buildRuleDraft('steps', 100)]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const next = buildDraftFromTemplate(initialTemplate);
        setTitle(next.title);
        setDescription(next.description);
        setMode(next.mode);
        setFormat(next.format);
        setStartDate(next.startDate || getProfileRelativeISODate(activeProfile, 1));
        setDurationDays(next.durationDays);
        setSelectedParticipantIds(next.selectedParticipantIds);
        setTemplateId(next.templateId);
        setRules(next.rules);
        setErrorMessage(null);
        setIsSubmitting(false);
    }, [initialTemplate, isOpen]);

    const selectableProfiles = useMemo(() => (
        profiles.filter((profile) => profile.id !== activeProfile.id)
    ), [activeProfile.id, profiles]);

    const ruleSummary = useMemo(() => {
        if (!rules.length) return 'Choose at least one metric.';
        return rules.map((rule) => {
            const metric = getCompetitionMetricDefinition(rule.metricId as any);
            const targetLabel = metric.inputMode === 'time'
                ? rule.targetText
                : metric.formatTarget(Number(rule.targetText));
            return `${metric.shortLabel} ${rule.operator === 'lte' ? '<=' : '>='} ${targetLabel}`;
        }).join(' + ');
    }, [rules]);

    const previewCopy = useMemo(() => {
        const startLabel = formatISODateForDisplay(startDate, 'en-US', { month: 'short', day: 'numeric' });
        return `Starts ${startLabel} for ${durationDays} day${durationDays === 1 ? '' : 's'}. ${ruleSummary}.`;
    }, [durationDays, ruleSummary, startDate]);

    if (!isOpen) return null;

    const toggleParticipant = (profileId: string) => {
        setSelectedParticipantIds((current) => current.includes(profileId)
            ? current.filter((id) => id !== profileId)
            : [...current, profileId]
        );
    };

    const updateRule = (ruleId: string, patch: Partial<RuleDraft>) => {
        setRules((current) => current.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule));
    };

    const addRule = () => {
        const evenWeight = Math.max(10, Math.round(100 / (rules.length + 1)));
        setRules((current) => [...current, buildRuleDraft('steps', evenWeight)]);
    };

    const removeRule = (ruleId: string) => {
        setRules((current) => current.length <= 1 ? current : current.filter((rule) => rule.id !== ruleId));
    };

    const handleCreate = async () => {
        setErrorMessage(null);

        if (!title.trim()) {
            setErrorMessage('Give the competition a name.');
            return;
        }

        if (!rules.length) {
            setErrorMessage('Add at least one metric.');
            return;
        }

        const parsedRules: CompetitionRule[] = [];
        for (const rule of rules) {
            const metric = getCompetitionMetricDefinition(rule.metricId as any);
            const parsed = Number(rule.targetText);
            const target = metric.inputMode === 'time'
                ? timeInputToMinutes(rule.targetText)
                : Number.isFinite(parsed) ? parsed : null;

            if (target == null) {
                setErrorMessage(`Enter a valid target for ${metric.label}.`);
                return;
            }

            const weight = format === 'goal'
                ? 1
                : Math.max(1, Number(rule.weightText) || 0);

            parsedRules.push({
                id: rule.id,
                metricId: metric.id,
                label: metric.label,
                operator: rule.operator,
                target,
                secondaryTarget: null,
                weight,
                aggregation: format === 'goal' ? 'daily' : rule.aggregation,
                capAtTarget: format !== 'race',
            });
        }

        const participants = [
            {
                profileId: activeProfile.id,
                displayName: getProfileDisplayName(activeProfile),
                status: 'accepted' as const,
                invitedAt: new Date().toISOString(),
                joinedAt: new Date().toISOString(),
                respondedAt: new Date().toISOString(),
                source: 'creator' as const,
            },
            ...selectedParticipantIds
                .map((profileId) => selectableProfiles.find((profile) => profile.id === profileId))
                .filter((profile): profile is UserProfile => Boolean(profile))
                .map((profile) => ({
                    profileId: profile.id,
                    displayName: getProfileDisplayName(profile),
                    status: 'invited' as const,
                    invitedAt: new Date().toISOString(),
                    respondedAt: null,
                    joinedAt: null,
                    source: 'selected' as const,
                })),
        ];

        if (mode === 'friends' && participants.length < 1) {
            setErrorMessage('Add at least one participant.');
            return;
        }

        const endDate = shiftLocalISODate(startDate, durationDays - 1);
        setIsSubmitting(true);
        try {
            await onCreate({
                title: title.trim(),
                description: description.trim() || previewCopy,
                mode,
                format,
                createdByProfileId: activeProfile.id,
                startDate,
                endDate,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                rules: parsedRules,
                participants,
                templateId,
                createShareInvite: mode === 'friends',
            });
            onClose();
        } catch (error) {
            console.error('Failed to create competition', error);
            setErrorMessage('Could not create the competition.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title="Create a competition"
            description="Choose a format, metrics, and people. Scoring begins tomorrow."
            className="!w-[min(100%,64rem)] !max-h-[min(92vh,60rem)]"
            busy={isSubmitting}
        >
            <p className="mb-5 text-[11px] uppercase tracking-[0.18em] text-accent">Competition builder</p>
            <div
                className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]"
                aria-busy={isSubmitting}
            >
                    <div className="space-y-6">
                        <section>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Templates</p>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                {COMPETITION_TEMPLATES.map((template) => (
                                    <button
                                        key={template.id}
                                        type="button"
                                        aria-pressed={templateId === template.id}
                                        onClick={() => {
                                            const next = buildDraftFromTemplate(template);
                                            setTitle(next.title);
                                            setDescription(next.description);
                                            setMode(next.mode);
                                            setFormat(next.format);
                                            setDurationDays(next.durationDays);
                                            setTemplateId(next.templateId);
                                            setRules(next.rules);
                                        }}
                                        className={`rounded-[1.25rem] border p-4 text-left transition-colors ${
                                            templateId === template.id
                                                ? 'border-accent/30 bg-accent-soft'
                                                : 'border-line bg-surface-raised hover:border-line-strong'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span
                                                className="h-3 w-3 rounded-full"
                                                style={{ backgroundColor: template.accentColor }}
                                            />
                                            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">{template.format}</span>
                                        </div>
                                        <h3 className="mt-3 text-base font-semibold text-ink">{template.title}</h3>
                                        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{template.description}</p>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section className="grid gap-4 md:grid-cols-2">
                            <label className="block">
                                <span className="mb-2 block text-sm font-medium text-ink">Title</span>
                                <input
                                    data-autofocus
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    className="w-full rounded-2xl border border-line bg-surface-raised px-4 py-3 text-ink outline-none transition-colors focus:border-accent"
                                    placeholder="Balanced Week"
                                />
                            </label>
                            <DateRangePicker
                                mode="date"
                                variant="field"
                                label="Start Date"
                                selectedDate={startDate}
                                onSelectDate={setStartDate}
                                min={getProfileRelativeISODate(activeProfile, 1)}
                                max={getProfileRelativeISODate(activeProfile, 365)}
                                todayIsoDay={getProfileLocalISODate(activeProfile)}
                            />
                            <label className="block md:col-span-2">
                                <span className="mb-2 block text-sm font-medium text-ink">Description</span>
                                <textarea
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    rows={3}
                                    className="w-full rounded-2xl border border-line bg-surface-raised px-4 py-3 text-ink outline-none transition-colors focus:border-accent"
                                    placeholder="Highest total progress wins."
                                />
                            </label>
                        </section>

                        <section className="grid gap-4 md:grid-cols-3">
                            <div className="rounded-[1.25rem] border border-line bg-surface p-4">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-ink-muted">
                                    <Users className="h-3.5 w-3.5" />
                                    Mode
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Competition mode">
                                    {(['solo', 'friends'] as CompetitionMode[]).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            aria-pressed={mode === option}
                                            onClick={() => setMode(option)}
                                            className={`rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                                                mode === option
                                                    ? 'bg-accent text-white'
                                                    : 'bg-surface-raised text-ink-secondary'
                                            }`}
                                        >
                                            {option === 'solo' ? 'Solo Goal' : 'Friends'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-[1.25rem] border border-line bg-surface p-4">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-ink-muted">
                                    <Target className="h-3.5 w-3.5" />
                                    Format
                                </div>
                                <div className="mt-3 grid gap-2" role="group" aria-label="Competition format">
                                    {(['goal', 'race', 'combo'] as CompetitionFormat[]).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            aria-pressed={format === option}
                                            onClick={() => setFormat(option)}
                                            className={`rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors ${
                                                format === option
                                                    ? 'bg-accent text-white'
                                                    : 'bg-surface-raised text-ink-secondary'
                                            }`}
                                        >
                                            {option === 'goal' ? 'Daily Goal' : option === 'race' ? 'Race' : 'Combo'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-[1.25rem] border border-line bg-surface p-4">
                                <div className="text-xs uppercase tracking-[0.16em] text-ink-muted">Duration</div>
                                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Competition duration">
                                    {DURATIONS.map((days) => (
                                        <button
                                            key={days}
                                            type="button"
                                            aria-pressed={durationDays === days}
                                            onClick={() => setDurationDays(days)}
                                            className={`min-h-11 min-w-11 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                                                durationDays === days
                                                    ? 'bg-accent text-white'
                                                    : 'bg-surface-raised text-ink-secondary'
                                            }`}
                                        >
                                            {days}d
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {mode === 'friends' ? (
                            <section className="rounded-[1.35rem] border border-line bg-surface-raised p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Invite existing friends</p>
                                        <h3 className="mt-2 text-lg font-semibold text-ink">Pre-load the participant list</h3>
                                    </div>
                                    <span className="rounded-full border border-line px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-ink-secondary">
                                        {selectedParticipantIds.length} selected
                                    </span>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {selectableProfiles.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-line bg-surface-raised px-4 py-4 text-sm text-ink-muted">
                                            No other profiles yet. You can still create the competition and share the invite link after.
                                        </div>
                                    ) : selectableProfiles.map((profile) => {
                                        const isSelected = selectedParticipantIds.includes(profile.id);
                                        return (
                                            <button
                                                key={profile.id}
                                                type="button"
                                                aria-pressed={isSelected}
                                                onClick={() => toggleParticipant(profile.id)}
                                                className={`min-h-11 rounded-full px-3 py-2 text-sm transition-colors ${
                                                    isSelected
                                                        ? 'bg-accent-soft text-accent'
                                                        : 'bg-surface-raised text-ink-secondary'
                                                }`}
                                            >
                                                {getProfileDisplayName(profile)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        ) : null}

                        <section className="rounded-[1.35rem] border border-line bg-surface-raised p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Rules</p>
                                    <h3 className="mt-2 text-lg font-semibold text-ink">Pick the metrics that decide the outcome</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={addRule}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3.5 text-sm font-medium text-accent"
                                >
                                    <Plus className="h-4 w-4" />
                                    Add Rule
                                </button>
                            </div>

                            <div className="mt-4 space-y-3">
                                {rules.map((rule, index) => {
                                    const metric = getCompetitionMetricDefinition(rule.metricId as any);

                                    return (
                                        <div key={rule.id} className="rounded-[1.15rem] border border-line bg-surface p-4">
                                            <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_auto]">
                                                <label className="block">
                                                    <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-ink-muted">Metric</span>
                                                    <select
                                                        value={rule.metricId}
                                                        onChange={(event) => {
                                                            const nextMetric = getCompetitionMetricDefinition(event.target.value as any);
                                                            updateRule(rule.id, {
                                                                metricId: nextMetric.id,
                                                                operator: nextMetric.defaultOperator === 'lte' ? 'lte' : 'gte',
                                                                targetText: nextMetric.inputMode === 'time'
                                                                    ? minutesToTimeInput(nextMetric.defaultTarget)
                                                                    : `${nextMetric.defaultTarget}`,
                                                                aggregation: nextMetric.defaultAggregation,
                                                            });
                                                        }}
                                                        className="w-full rounded-xl border border-line bg-surface-raised px-3 py-3 text-sm text-ink outline-none focus:border-accent"
                                                    >
                                                        {COMPETITION_METRICS.map((option) => (
                                                            <option key={option.id} value={option.id}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>

                                                <label className="block">
                                                    <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-ink-muted">Operator</span>
                                                    <select
                                                        value={rule.operator}
                                                        onChange={(event) => updateRule(rule.id, { operator: event.target.value as 'gte' | 'lte' })}
                                                        className="w-full rounded-xl border border-line bg-surface-raised px-3 py-3 text-sm text-ink outline-none focus:border-accent"
                                                    >
                                                        <option value="gte">At least</option>
                                                        <option value="lte">At most</option>
                                                    </select>
                                                </label>

                                                <label className="block">
                                                    <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-ink-muted">Target</span>
                                                    <input
                                                        type={metric.inputMode === 'time' ? 'time' : 'number'}
                                                        step={metric.inputMode === 'time' ? undefined : (metric.step || 1)}
                                                        min={metric.inputMode === 'time' ? undefined : metric.min}
                                                        max={metric.inputMode === 'time' ? undefined : metric.max}
                                                        value={rule.targetText}
                                                        onChange={(event) => updateRule(rule.id, { targetText: event.target.value })}
                                                        className="w-full rounded-xl border border-line bg-surface-raised px-3 py-3 text-sm text-ink outline-none focus:border-accent"
                                                    />
                                                </label>

                                                {format !== 'goal' ? (
                                                    <label className="block">
                                                        <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-ink-muted">
                                                            {format === 'combo' ? 'Weight %' : 'Weight'}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            step={1}
                                                            value={rule.weightText}
                                                            onChange={(event) => updateRule(rule.id, { weightText: event.target.value })}
                                                            className="w-full rounded-xl border border-line bg-surface-raised px-3 py-3 text-sm text-ink outline-none focus:border-accent"
                                                        />
                                                    </label>
                                                ) : (
                                                    <label className="block">
                                                        <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-ink-muted">Scoring</span>
                                                        <div className="rounded-xl border border-line bg-surface-raised px-3 py-3 text-sm text-ink-secondary">Daily pass / fail</div>
                                                    </label>
                                                )}

                                                <div className="flex items-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeRule(rule.id)}
                                                        disabled={rules.length <= 1}
                                                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-surface-raised text-ink-secondary disabled:opacity-40"
                                                        aria-label={`Remove rule ${index + 1}`}
                                                    >
                                                        <X className="h-4 w-4" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </div>

                                            {format !== 'goal' ? (
                                                <label className="mt-3 block">
                                                    <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-ink-muted">Aggregation</span>
                                                    <select
                                                        value={rule.aggregation}
                                                        onChange={(event) => updateRule(rule.id, { aggregation: event.target.value as RuleDraft['aggregation'] })}
                                                        className="w-full rounded-xl border border-line bg-surface-raised px-3 py-3 text-sm text-ink outline-none focus:border-accent"
                                                    >
                                                        <option value="daily">Daily progress</option>
                                                        <option value="average">Average across the competition</option>
                                                        <option value="total">Total across the competition</option>
                                                    </select>
                                                </label>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </div>

                    <aside className="space-y-4">
                        <div className="rounded-[1.35rem] border border-line bg-surface p-5 shadow-sm">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-accent">Preview</p>
                            <h3 className="mt-3 text-xl font-semibold text-ink">{title || 'New Competition'}</h3>
                            <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{previewCopy}</p>
                            <div className="mt-4 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent">
                                {mode === 'friends'
                                    ? 'A share link will be generated automatically after creation.'
                                    : 'Solo goals track only this profile.'}
                            </div>
                        </div>

                        <div className="rounded-[1.35rem] border border-line bg-surface-raised p-5">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Checklist</p>
                            <div className="mt-4 space-y-3 text-sm text-ink-secondary">
                                <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
                                    Starts on <span className="text-ink">{formatISODateForDisplay(startDate, 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                </div>
                                <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
                                    Runs for <span className="text-ink">{durationDays} day{durationDays === 1 ? '' : 's'}</span>
                                </div>
                                <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
                                    {mode === 'friends'
                                        ? `${selectedParticipantIds.length} existing friend${selectedParticipantIds.length === 1 ? '' : 's'} pre-selected`
                                        : 'Solo tracking only'}
                                </div>
                            </div>
                        </div>

                        {errorMessage ? (
                            <div
                                className="rounded-[1.25rem] border border-error/30 bg-error-soft px-4 py-3 text-sm text-error"
                                role="alert"
                                aria-live="assertive"
                            >
                                {errorMessage}
                            </div>
                        ) : null}

                        <div className="flex flex-col gap-3">
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={isSubmitting}
                                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                            >
                                {isSubmitting ? 'Creating...' : 'Create Competition'}
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-line px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface-raised"
                            >
                                Cancel
                            </button>
                        </div>
                    </aside>
            </div>
        </Dialog>
    );
};

export default CompetitionBuilder;
