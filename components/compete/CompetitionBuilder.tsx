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
            let target: number | null = null;

            if (metric.inputMode === 'time') {
                target = timeInputToMinutes(rule.targetText);
            } else {
                const parsed = Number(rule.targetText);
                target = Number.isFinite(parsed) ? parsed : null;
            }

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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/20 px-4 py-6 backdrop-blur-sm sm:px-6">
            <div className="mx-auto max-w-5xl rounded-[2rem] border border-[rgba(0,0,0,0.10)] bg-[#F2EDE8] shadow-[0_30px_120px_rgba(0,0,0,0.12)]">
                <div className="flex items-start justify-between gap-4 border-b border-[rgba(0,0,0,0.06)] px-5 py-5 sm:px-7">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[#6B9E8A]">Compete Builder</p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#2D2A26]">Set it once, start tomorrow</h2>
                        <p className="mt-2 max-w-2xl text-sm text-[#7A756E]">
                            Pick a format, choose the metrics, and invite friends. Oura data starts scoring on the next calendar day.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[rgba(0,0,0,0.08)] bg-white text-[#7A756E] transition-colors hover:text-[#2D2A26]"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="grid gap-6 px-5 py-5 sm:px-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
                    <div className="space-y-6">
                        <section>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Templates</p>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                {COMPETITION_TEMPLATES.map((template) => (
                                    <button
                                        key={template.id}
                                        type="button"
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
                                                ? 'border-[rgba(107,158,138,0.3)] bg-[rgba(107,158,138,0.06)]'
                                                : 'border-[rgba(0,0,0,0.06)] bg-white hover:border-[rgba(0,0,0,0.10)]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span
                                                className="h-3 w-3 rounded-full"
                                                style={{ backgroundColor: template.accentColor }}
                                            />
                                            <span className="text-[11px] uppercase tracking-[0.14em] text-[#A8A29E]">{template.format}</span>
                                        </div>
                                        <h3 className="mt-3 text-base font-semibold" style={{ color: '#2D2A26' }}>{template.title}</h3>
                                        <p className="mt-2 text-sm leading-relaxed" style={{ color: '#7A756E' }}>{template.description}</p>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section className="grid gap-4 md:grid-cols-2">
                            <label className="block">
                                <span className="mb-2 block text-sm font-medium text-[#4A4540]">Title</span>
                                <input
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    className="w-full rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3 text-[#2D2A26] outline-none transition-colors focus:border-[#6B9E8A]"
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
                                <span className="mb-2 block text-sm font-medium text-[#4A4540]">Description</span>
                                <textarea
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    rows={3}
                                    className="w-full rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3 text-[#2D2A26] outline-none transition-colors focus:border-[#6B9E8A]"
                                    placeholder="Highest total progress wins."
                                />
                            </label>
                        </section>

                        <section className="grid gap-4 md:grid-cols-3">
                            <div className="rounded-[1.25rem] border border-[rgba(0,0,0,0.06)] bg-white p-4">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#A8A29E]">
                                    <Users className="h-3.5 w-3.5" />
                                    Mode
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    {(['solo', 'friends'] as CompetitionMode[]).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setMode(option)}
                                            className={`rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                                                mode === option
                                                    ? 'bg-[#6B9E8A] text-white'
                                                    : 'bg-[#FAF7F4] text-[#7A756E]'
                                            }`}
                                        >
                                            {option === 'solo' ? 'Solo Goal' : 'Friends'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-[1.25rem] border border-[rgba(0,0,0,0.06)] bg-white p-4">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#A8A29E]">
                                    <Target className="h-3.5 w-3.5" />
                                    Format
                                </div>
                                <div className="mt-3 grid gap-2">
                                    {(['goal', 'race', 'combo'] as CompetitionFormat[]).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setFormat(option)}
                                            className={`rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors ${
                                                format === option
                                                    ? 'bg-[#6B9E8A] text-white'
                                                    : 'bg-[#FAF7F4] text-[#7A756E]'
                                            }`}
                                        >
                                            {option === 'goal' ? 'Daily Goal' : option === 'race' ? 'Race' : 'Combo'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-[1.25rem] border border-[rgba(0,0,0,0.06)] bg-white p-4">
                                <div className="text-xs uppercase tracking-[0.16em] text-[#A8A29E]">Duration</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {DURATIONS.map((days) => (
                                        <button
                                            key={days}
                                            type="button"
                                            onClick={() => setDurationDays(days)}
                                            className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                                                durationDays === days
                                                    ? 'bg-[#6B9E8A] text-white'
                                                    : 'bg-[#FAF7F4] text-[#7A756E]'
                                            }`}
                                        >
                                            {days}d
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {mode === 'friends' ? (
                            <section className="rounded-[1.35rem] border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Invite existing friends</p>
                                        <h3 className="mt-2 text-lg font-semibold text-[#2D2A26]">Pre-load the participant list</h3>
                                    </div>
                                    <span className="rounded-full border border-[rgba(0,0,0,0.06)] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-[#7A756E]">
                                        {selectedParticipantIds.length} selected
                                    </span>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {selectableProfiles.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-[rgba(0,0,0,0.08)] bg-white px-4 py-4 text-sm text-[#A8A29E]">
                                            No other profiles yet. You can still create the competition and share the invite link after.
                                        </div>
                                    ) : selectableProfiles.map((profile) => {
                                        const isSelected = selectedParticipantIds.includes(profile.id);
                                        return (
                                            <button
                                                key={profile.id}
                                                type="button"
                                                onClick={() => toggleParticipant(profile.id)}
                                                className={`rounded-full px-3 py-2 text-sm transition-colors ${
                                                    isSelected
                                                        ? 'bg-[rgba(107,158,138,0.12)] text-[#6B9E8A]'
                                                        : 'bg-[#FAF7F4] text-[#7A756E]'
                                                }`}
                                            >
                                                {getProfileDisplayName(profile)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        ) : null}

                        <section className="rounded-[1.35rem] border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Rules</p>
                                    <h3 className="mt-2 text-lg font-semibold text-[#2D2A26]">Pick the metrics that decide the outcome</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={addRule}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[rgba(107,158,138,0.25)] bg-[rgba(107,158,138,0.08)] px-3.5 text-sm font-medium text-[#6B9E8A]"
                                >
                                    <Plus className="h-4 w-4" />
                                    Add Rule
                                </button>
                            </div>

                            <div className="mt-4 space-y-3">
                                {rules.map((rule, index) => {
                                    const metric = getCompetitionMetricDefinition(rule.metricId as any);

                                    return (
                                        <div key={rule.id} className="rounded-[1.15rem] border border-[rgba(0,0,0,0.06)] bg-white p-4">
                                            <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_auto]">
                                                <label className="block">
                                                    <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[#A8A29E]">Metric</span>
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
                                                        className="w-full rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAF7F4] px-3 py-3 text-sm text-[#2D2A26] outline-none focus:border-[#6B9E8A]"
                                                    >
                                                        {COMPETITION_METRICS.map((option) => (
                                                            <option key={option.id} value={option.id}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>

                                                <label className="block">
                                                    <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[#A8A29E]">Operator</span>
                                                    <select
                                                        value={rule.operator}
                                                        onChange={(event) => updateRule(rule.id, { operator: event.target.value as 'gte' | 'lte' })}
                                                        className="w-full rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAF7F4] px-3 py-3 text-sm text-[#2D2A26] outline-none focus:border-[#6B9E8A]"
                                                    >
                                                        <option value="gte">At least</option>
                                                        <option value="lte">At most</option>
                                                    </select>
                                                </label>

                                                <label className="block">
                                                    <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[#A8A29E]">Target</span>
                                                    <input
                                                        type={metric.inputMode === 'time' ? 'time' : 'number'}
                                                        step={metric.inputMode === 'time' ? undefined : (metric.step || 1)}
                                                        min={metric.inputMode === 'time' ? undefined : metric.min}
                                                        max={metric.inputMode === 'time' ? undefined : metric.max}
                                                        value={rule.targetText}
                                                        onChange={(event) => updateRule(rule.id, { targetText: event.target.value })}
                                                        className="w-full rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAF7F4] px-3 py-3 text-sm text-[#2D2A26] outline-none focus:border-[#6B9E8A]"
                                                    />
                                                </label>

                                                {format !== 'goal' ? (
                                                    <label className="block">
                                                        <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[#A8A29E]">
                                                            {format === 'combo' ? 'Weight %' : 'Weight'}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            step={1}
                                                            value={rule.weightText}
                                                            onChange={(event) => updateRule(rule.id, { weightText: event.target.value })}
                                                            className="w-full rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAF7F4] px-3 py-3 text-sm text-[#2D2A26] outline-none focus:border-[#6B9E8A]"
                                                        />
                                                    </label>
                                                ) : (
                                                    <label className="block">
                                                        <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[#A8A29E]">Scoring</span>
                                                        <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] px-3 py-3 text-sm text-[#7A756E]">Daily pass / fail</div>
                                                    </label>
                                                )}

                                                <div className="flex items-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeRule(rule.id)}
                                                        disabled={rules.length <= 1}
                                                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAF7F4] text-[#7A756E] disabled:opacity-40"
                                                        title={`Remove rule ${index + 1}`}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {format !== 'goal' ? (
                                                <label className="mt-3 block">
                                                    <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-[#A8A29E]">Aggregation</span>
                                                    <select
                                                        value={rule.aggregation}
                                                        onChange={(event) => updateRule(rule.id, { aggregation: event.target.value as RuleDraft['aggregation'] })}
                                                        className="w-full rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAF7F4] px-3 py-3 text-sm text-[#2D2A26] outline-none focus:border-[#6B9E8A]"
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
                        <div className="rounded-[1.35rem] border border-[rgba(0,0,0,0.06)] bg-[radial-gradient(circle_at_top_right,rgba(107,158,138,0.16),transparent_35%),#FFFFFF] p-5">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#6B9E8A]">Live Summary</p>
                            <h3 className="mt-3 text-xl font-semibold text-[#2D2A26]">{title || 'New Competition'}</h3>
                            <p className="mt-3 text-sm leading-relaxed text-[#7A756E]">{previewCopy}</p>
                            <div className="mt-4 rounded-2xl border border-[rgba(107,158,138,0.2)] bg-[rgba(107,158,138,0.06)] px-4 py-3 text-sm text-[#6B9E8A]">
                                {mode === 'friends'
                                    ? 'A share link will be generated automatically after creation.'
                                    : 'Solo goals stay private to this profile.'}
                            </div>
                        </div>

                        <div className="rounded-[1.35rem] border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] p-5">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Checklist</p>
                            <div className="mt-4 space-y-3 text-sm text-[#7A756E]">
                                <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3">
                                    Starts on <span className="text-[#2D2A26]">{formatISODateForDisplay(startDate, 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                </div>
                                <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3">
                                    Runs for <span className="text-[#2D2A26]">{durationDays} day{durationDays === 1 ? '' : 's'}</span>
                                </div>
                                <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3">
                                    {mode === 'friends'
                                        ? `${selectedParticipantIds.length} existing friend${selectedParticipantIds.length === 1 ? '' : 's'} pre-selected`
                                        : 'Solo tracking only'}
                                </div>
                            </div>
                        </div>

                        {errorMessage ? (
                            <div className="rounded-[1.25rem] border border-[rgba(212,137,123,0.3)] bg-[#FAF7F4] px-4 py-3 text-sm text-[#D4897B]">
                                {errorMessage}
                            </div>
                        ) : null}

                        <div className="flex flex-col gap-3">
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={isSubmitting}
                                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#6B9E8A] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                            >
                                {isSubmitting ? 'Creating...' : 'Create Competition'}
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[rgba(0,0,0,0.08)] px-5 py-3 text-sm font-medium text-[#2D2A26] transition-colors hover:bg-[#FAF7F4]"
                            >
                                Cancel
                            </button>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default CompetitionBuilder;
