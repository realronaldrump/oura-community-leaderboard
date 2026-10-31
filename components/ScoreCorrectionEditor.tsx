import React, { useRef, useState } from 'react';
import { Button, Dialog, Field, Input } from './ui';
import { useUser } from '../contexts/UserContext';
import type { UserProfile } from '../types';
import { SCORE_CORRECTION_FIELDS, normalizeScoreCorrections, validCorrectionScore } from '../utils/scoreCorrections';
import { formatISODateForDisplay } from '../utils/date';

export default function ScoreCorrectionEditor({ profile, day, onClose }: {
    profile: UserProfile; day: string; onClose: () => void;
}) {
    const { updateScoreCorrections } = useUser();
    const current = normalizeScoreCorrections(profile.scoreCorrections).find(correction => correction.day === day);
    const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
        SCORE_CORRECTION_FIELDS.map(field => [field.key, current?.[field.key] == null ? '' : String(current[field.key])])));
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const inFlight = useRef(false);
    const save = async (remove = false) => {
        if (inFlight.current) return;
        const fields = SCORE_CORRECTION_FIELDS.filter(field => values[field.key].trim() !== '');
        if (!remove && (!fields.length || fields.some(field => !validCorrectionScore(Number(values[field.key]))))) {
            setError('Enter at least one whole-number score from 1 to 100.');
            return;
        }
        inFlight.current = true;
        setSaving(true); setError('');
        const id = current?.id || crypto.randomUUID();
        const now = new Date().toISOString();
        try {
            await updateScoreCorrections(profile.id, latest => [
                ...latest.filter(correction => correction.day !== day),
                ...(remove ? [] : [{
                    id, day, source: 'oura_app' as const,
                    ...Object.fromEntries(fields.map(field => [field.key, Number(values[field.key])])),
                    createdAt: current?.createdAt || now, updatedAt: now,
                }]),
            ]);
            onClose();
        } catch {
            setError('The scores could not be saved. Please try again.');
        } finally { inFlight.current = false; setSaving(false); }
    };
    return (
        <Dialog isOpen title="Scores from Oura" description={`${profile.firstName || 'Your profile'} · ${formatISODateForDisplay(day, 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
            onClose={onClose} busy={saving}>
            <form onSubmit={event => { event.preventDefault(); void save(); }} className="score-correction-form">
                <p>Enter the scores shown in Oura for this date. These fill gaps in what Oura sends to this app. Scores later sent by Oura take priority.</p>
                <p className="fine-print">Fill only the scores you have checked. Saved exclusions still apply.</p>
                {SCORE_CORRECTION_FIELDS.map(field => (
                    <Field key={field.key} label={field.label} hint="Optional · 1–100">
                        <Input type="number" inputMode="numeric" min={1} max={100} step={1} value={values[field.key]} disabled={saving}
                            onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))} />
                    </Field>
                ))}
                {error && <p className="status-note status-note--error" role="alert">{error}</p>}
                <div className="form-actions">
                    {current && <Button variant="quiet" disabled={saving} onClick={() => void save(true)}>Remove correction</Button>}
                    <Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
                    <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save scores'}</Button>
                </div>
            </form>
        </Dialog>
    );
}
