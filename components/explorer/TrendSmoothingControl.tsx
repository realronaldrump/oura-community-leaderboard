import React, { useId, useState } from 'react';
import {
    MAX_SMOOTHING_DAYS,
    SMOOTHING_OPTIONS,
    smoothingDays,
    type ChartSmoothingSettings,
} from '../../utils/chartSmoothing';

export default function TrendSmoothingControl({ settings, onChange }: {
    settings: ChartSmoothingSettings;
    onChange: (settings: ChartSmoothingSettings) => void;
}) {
    const id = useId();
    const [customDraft, setCustomDraft] = useState(String(settings.customDays));
    const days = smoothingDays(settings);
    const setDays = (next: number) => {
        setCustomDraft(String(next));
        onChange({ ...settings, customDays: next });
    };
    const settleDraft = () => {
        const number = customDraft.trim() ? Number(customDraft) : settings.customDays;
        setDays(Number.isFinite(number) ? Math.max(2, Math.min(MAX_SMOOTHING_DAYS, Math.round(number))) : settings.customDays);
    };
    return (
        <div className="trend-smoothing">
            <div className="smoothing-options" role="group" aria-label="Line smoothing">
                {SMOOTHING_OPTIONS.map(option => (
                    <button key={option.mode} type="button" aria-pressed={settings.mode === option.mode}
                        title={option.days === 1 ? 'Daily measurements' : option.days ? `${option.days}-day average` : 'Choose how many days to average'}
                        onClick={() => onChange({ ...settings, mode: option.mode })}>
                        {option.label}
                    </button>
                ))}
            </div>
            {settings.mode === 'custom' && (
                <div className="smoothing-custom">
                    <label htmlFor={`${id}-days`}>Average over</label>
                    <input id={`${id}-days`} aria-label="Days to average" type="number" inputMode="numeric"
                        min={2} max={MAX_SMOOTHING_DAYS} step={1} value={customDraft}
                        onChange={event => {
                            const draft = event.target.value;
                            setCustomDraft(draft);
                            const number = Number(draft);
                            if (draft.trim() && Number.isInteger(number) && number >= 2 && number <= MAX_SMOOTHING_DAYS) {
                                onChange({ ...settings, customDays: number });
                            }
                        }} onBlur={settleDraft}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); settleDraft(); } }} />
                    <span>days</span>
                    <div className="smoothing-slider">
                        <input type="range" aria-label="Smoothing strength" aria-valuetext={`${settings.customDays}-day average`}
                            min={2} max={MAX_SMOOTHING_DAYS} step={1} value={settings.customDays}
                            onChange={event => setDays(Number(event.target.value))} />
                        <div aria-hidden="true"><span>2 days</span><span>1 year</span></div>
                    </div>
                </div>
            )}
            {days > 1 && (
                <div className="smoothing-summary">
                    <span>{days}-day average</span>
                    <label><input type="checkbox" checked={settings.showDaily}
                        onChange={event => onChange({ ...settings, showDaily: event.target.checked })} /> Show daily line</label>
                </div>
            )}
        </div>
    );
}
