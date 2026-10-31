import React, { useId, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Dialog } from './ui';
import { useUser } from '../contexts/UserContext';
import type { DataExclusionSource, UserProfile } from '../types';
import {
    DATA_EXCLUSION_GROUPS, DATA_EXCLUSION_SOURCES, getExclusionSourcesForDay,
    normalizeDataExclusionRanges, restoreDataExclusionDay,
} from '../utils/dataExclusions';
import { formatISODateForDisplay } from '../utils/date';

export function DataTypeChoices({ selected, onChange, disabled = false }: {
    selected: DataExclusionSource[]; onChange: (sources: DataExclusionSource[]) => void; disabled?: boolean;
}) {
    const descriptionId = useId();
    const all = DATA_EXCLUSION_SOURCES.every(source => selected.includes(source));
    return <fieldset className="exclusion-choices" disabled={disabled}>
        <legend>What should be ignored?</legend>
        <label className={`exclusion-choice exclusion-choice--all ${all ? 'is-selected' : ''}`}>
            <input type="checkbox" aria-label="Whole day" checked={all} onChange={() => onChange(all ? [] : [...DATA_EXCLUSION_SOURCES])} />
            <span><strong>Whole day</strong><small>All data types for this day</small></span>
        </label>
        <div className="exclusion-choices__types">
            {DATA_EXCLUSION_GROUPS.map(group => {
                const checked = group.sources.every(source => selected.includes(source));
                const partial = !checked && group.sources.some(source => selected.includes(source));
                return <label key={group.id} className={`exclusion-choice ${checked || partial ? 'is-selected' : ''}`}>
                    <input type="checkbox" aria-label={group.label} aria-describedby={`${descriptionId}-${group.id}`} aria-checked={partial ? 'mixed' : checked}
                        ref={input => { if (input) input.indeterminate = partial; }} checked={checked} onChange={() => onChange(checked || partial
                        ? selected.filter(source => !group.sources.includes(source))
                        : [...new Set([...selected, ...group.sources])])} />
                    <span><strong>{group.label}</strong><small id={`${descriptionId}-${group.id}`}>{group.description}</small></span>
                </label>;
            })}
        </div>
    </fieldset>;
}

/** Mounted with a profile/day key so a draft can never leak to another day or person. */
export default function DataExclusionEditor({ profile, day, initialSources, onClose }: {
    profile: UserProfile; day: string; initialSources?: DataExclusionSource[]; onClose: () => void;
}) {
    const { updateDataExclusions } = useUser();
    const current = getExclusionSourcesForDay(day, profile.dataExclusionRanges);
    const [selected, setSelected] = useState<DataExclusionSource[]>(() => current.length ? current : initialSources || []);
    const [label, setLabel] = useState(() => normalizeDataExclusionRanges(profile.dataExclusionRanges)
        .filter(range => day >= range.startDay && day <= range.endDay).map(range => range.label).filter(Boolean).join('; '));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const inFlight = useRef(false);
    const save = async (sources: DataExclusionSource[]) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setSaving(true); setError('');
        try {
            const now = new Date().toISOString();
            const range = sources.length ? {
                id: crypto.randomUUID(), startDay: day, endDay: day, label: label.trim() || null,
                ...(sources.length === DATA_EXCLUSION_SOURCES.length ? {} : { sources }), createdAt: now, updatedAt: now,
            } : null;
            await updateDataExclusions(profile.id, latest => [...restoreDataExclusionDay(latest, day), ...(range ? [range] : [])]);
            onClose();
        } catch {
            setError('Your changes could not be saved. Please try again.');
        } finally { inFlight.current = false; setSaving(false); }
    };
    const date = formatISODateForDisplay(day, 'en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
    return <Dialog isOpen title="Ignore data" description={`${profile.firstName || 'Your profile'} · ${date}`} onClose={onClose} busy={saving} className="exclusion-dialog">
        <form className="exclusion-form" onSubmit={event => { event.preventDefault(); void save(selected); }}>
            <div className="exclusion-form__fields">
            <p className="exclusion-intro">Choose the data to leave out of scores, trends, records, comparisons, competitions and analysis exports. Everything else stays included.</p>
            <DataTypeChoices selected={selected} onChange={setSelected} disabled={saving} />
            <label className="field-label exclusion-reason">Reason <span className="fine-print">(optional)</span>
                <input value={label} onChange={event => setLabel(event.target.value)} placeholder="Ring died, inaccurate sleep…" disabled={saving} maxLength={300} />
            </label>
            <p className="exclusion-retained"><ShieldCheck size={17} aria-hidden="true" /> Original recordings are kept. You can restore any data type later.</p>
            </div>
            {error && <p role="alert" className="exclusion-error">{error}</p>}
            <div className="exclusion-actions">
                {current.length > 0 && <Button variant="quiet" disabled={saving} onClick={() => void save([])}>Restore this day</Button>}
                <Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={saving || (!selected.length && !current.length)}>{saving ? 'Saving…' : current.length ? 'Save changes' : 'Ignore selected data'}</Button>
            </div>
        </form>
    </Dialog>;
}

export function DayDataControl({ profile, day, source }: { profile: UserProfile; day: string; source?: DataExclusionSource }) {
    const [open, setOpen] = useState(false);
    const ignored = getExclusionSourcesForDay(day, profile.dataExclusionRanges);
    const group = DATA_EXCLUSION_GROUPS.find(group => source && group.sources.includes(source));
    const labels = DATA_EXCLUSION_GROUPS.filter(group => group.sources.some(source => ignored.includes(source))).map(group => group.label);
    return <div className={`day-data-control ${ignored.length ? 'has-exclusions' : ''}`}>
        {ignored.length > 0 && <span><ShieldCheck size={16} aria-hidden="true" /> {ignored.length === DATA_EXCLUSION_SOURCES.length ? 'Whole day ignored' : `Ignored: ${labels.join(', ')}`}</span>}
        <button type="button" className="text-action" onClick={() => setOpen(true)}>{ignored.length ? 'Manage ignored data' : 'Ignore data'}</button>
        {open && <DataExclusionEditor key={`${profile.id}:${day}`} profile={profile} day={day} initialSources={group?.sources} onClose={() => setOpen(false)} />}
    </div>;
}
