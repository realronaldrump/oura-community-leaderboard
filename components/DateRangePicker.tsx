import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatISODateForDisplay } from '../utils/date';
import { getUTCDateFromISODate } from '../utils/temporal';

/* ─── Types ──────────────────────────────────────────────────────── */

type QuickRange = { key: string; label: string; days: number };

type DateRangePickerProps = {
    /** Sorted newest-first array of available ISO day strings.
     *  When omitted every day within min/max is selectable. */
    dates?: string[];
    selectedDate?: string;
    onSelectDate: (date: string) => void;
    range?: { start: string; end: string };
    onRangeChange?: (range: { start: string; end: string }) => void;
    mode?: 'date' | 'range';
    className?: string;
    showStepper?: boolean;
    /** Earliest selectable day (ISO). Falls back to oldest entry in `dates`. */
    min?: string;
    /** Latest selectable day (ISO). Falls back to newest entry in `dates`. */
    max?: string;
    /** Optional label shown above the trigger when rendered as a form field. */
    label?: string;
    /** "dropdown" (default) = trigger + flyout panel. "field" = inline form field. */
    variant?: 'dropdown' | 'field';
    /** Optional profile-local "today" ISO day for highlights and calendar anchoring. */
    todayIsoDay?: string;
};

/* ─── Constants ──────────────────────────────────────────────────── */

const QUICK_RANGES: QuickRange[] = [
    { key: '7d', label: '7D', days: 7 },
    { key: '30d', label: '30D', days: 30 },
    { key: '90d', label: '90D', days: 90 },
    { key: '1y', label: '1Y', days: 365 },
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/* ─── Helpers ────────────────────────────────────────────────────── */

const toDateMs = (isoDay: string): number => getUTCDateFromISODate(isoDay)?.getTime() || 0;

const pad2 = (n: number) => String(n).padStart(2, '0');

const isoFromParts = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

const formatDayLong = (isoDay: string): string =>
    formatISODateForDisplay(isoDay, 'en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });

const formatDayShort = (isoDay: string): string =>
    formatISODateForDisplay(isoDay, 'en-US', { month: 'short', day: 'numeric' });

const clampRange = (start: string, end: string) =>
    start <= end ? { start, end } : { start: end, end: start };

const findClosestDay = (target: string, dates: string[]): string | undefined => {
    if (!target || dates.length === 0) return undefined;
    if (dates.includes(target)) return target;
    const tMs = toDateMs(target);
    let best = dates[0];
    let bestD = Math.abs(toDateMs(best) - tMs);
    for (let i = 1; i < dates.length; i++) {
        const d = Math.abs(toDateMs(dates[i]) - tMs);
        if (d < bestD) { best = dates[i]; bestD = d; }
    }
    return best;
};

/** Build the list of ISO day strings for every cell in a month grid. */
const buildMonthGrid = (year: number, month: number): (string | null)[] => {
    const first = new Date(Date.UTC(year, month, 1, 12, 0, 0, 0));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0, 0)).getUTCDate();
    const startDow = first.getUTCDay();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(isoFromParts(year, month, d));
    return cells;
};

/* ─── Component ──────────────────────────────────────────────────── */

const DateRangePicker: React.FC<DateRangePickerProps> = ({
    dates: datesProp,
    selectedDate,
    onSelectDate,
    range,
    onRangeChange,
    mode = 'range',
    className = '',
    showStepper = false,
    min: minProp,
    max: maxProp,
    label,
    variant = 'dropdown',
    todayIsoDay,
}) => {
    const dates = datesProp ?? [];
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelId = useId();
    const newestDay = dates[0] || '';
    const oldestDay = dates[dates.length - 1] || '';

    const minDay = minProp || oldestDay;
    const maxDay = maxProp || newestDay;

    const isRangeMode = mode === 'range';
    const isField = variant === 'field';
    const [isOpen, setIsOpen] = useState(false);

    // Build a Set for O(1) availability lookups
    const availableSet = useMemo(() => new Set(dates), [dates]);
    // Omitting `dates` means every day inside min/max is available. Passing an
    // explicit empty array means the caller has no available days yet.
    const hasDateConstraint = datesProp !== undefined;

    /* ── Range state ──────────────────────────────── */

    const fallbackRange = useMemo(
        () => ({ start: oldestDay, end: newestDay }),
        [newestDay, oldestDay],
    );

    const effectiveRange = useMemo(() => {
        if (!isRangeMode || !dates.length) return fallbackRange;
        const iStart = range?.start || fallbackRange.start;
        const iEnd = range?.end || fallbackRange.end;
        const cStart = findClosestDay(iStart, dates) || oldestDay;
        const cEnd = findClosestDay(iEnd, dates) || newestDay;
        return clampRange(cStart, cEnd);
    }, [dates, fallbackRange, isRangeMode, newestDay, oldestDay, range?.end, range?.start]);

    const [draftStart, setDraftStart] = useState(effectiveRange.start);
    const [draftEnd, setDraftEnd] = useState(effectiveRange.end);

    useEffect(() => {
        setDraftStart(effectiveRange.start);
        setDraftEnd(effectiveRange.end);
    }, [effectiveRange.end, effectiveRange.start]);

    const normalizedDraftRange = useMemo(() => {
        if (!isRangeMode) return fallbackRange;
        if (!draftStart || !draftEnd) return effectiveRange;
        return clampRange(draftStart, draftEnd);
    }, [draftEnd, draftStart, effectiveRange, fallbackRange, isRangeMode]);

    const scopedDates = useMemo(() => {
        if (!isRangeMode) return dates;
        if (!normalizedDraftRange.start || !normalizedDraftRange.end) return [];
        return dates.filter((d) => d >= normalizedDraftRange.start && d <= normalizedDraftRange.end);
    }, [dates, isRangeMode, normalizedDraftRange.end, normalizedDraftRange.start]);

    /* ── Active day ───────────────────────────────── */

    const activeDay = useMemo(() => {
        if (selectedDate) {
            if (!hasDateConstraint) return selectedDate;
            if (dates.includes(selectedDate)) {
                if (!isRangeMode || scopedDates.includes(selectedDate)) return selectedDate;
            }
        }
        if (scopedDates.length > 0) return scopedDates[0];
        return newestDay;
    }, [dates, hasDateConstraint, isRangeMode, newestDay, scopedDates, selectedDate]);

    useEffect(() => {
        if (!activeDay) return;
        if (selectedDate === activeDay) return;
        onSelectDate(activeDay);
    }, [activeDay, onSelectDate, selectedDate]);

    /* ── Range commit helpers ─────────────────────── */

    const commitRange = useCallback((startInput: string, endInput: string) => {
        if (!isRangeMode || !dates.length) return;
        const nStart = findClosestDay(startInput, dates) || oldestDay;
        const nEnd = findClosestDay(endInput, dates) || newestDay;
        const ordered = clampRange(nStart, nEnd);
        setDraftStart(ordered.start);
        setDraftEnd(ordered.end);
        onRangeChange?.(ordered);
        const next = dates.filter((d) => d >= ordered.start && d <= ordered.end);
        if (!next.length) return;
        const nd = selectedDate && next.includes(selectedDate) ? selectedDate : next[0];
        if (nd && nd !== selectedDate) onSelectDate(nd);
    }, [dates, isRangeMode, newestDay, oldestDay, onRangeChange, onSelectDate, selectedDate]);

    const applyQuickRange = useCallback((days: number) => {
        if (!dates.length) return;
        commitRange(dates[Math.min(days - 1, dates.length - 1)], dates[0]);
    }, [commitRange, dates]);

    const applyFullRange = useCallback(() => {
        if (!dates.length) return;
        commitRange(oldestDay, newestDay);
    }, [commitRange, newestDay, oldestDay, dates.length]);

    const activeQuickRange = useMemo(() => {
        if (!isRangeMode || !dates.length) return '';
        if (normalizedDraftRange.end !== newestDay) return '';
        if (normalizedDraftRange.start === oldestDay) return 'all';
        for (const qr of QUICK_RANGES) {
            const si = Math.min(qr.days - 1, dates.length - 1);
            if (normalizedDraftRange.start === dates[si]) return qr.key;
        }
        return '';
    }, [dates, isRangeMode, newestDay, normalizedDraftRange.end, normalizedDraftRange.start, oldestDay]);

    /* ── Stepper ──────────────────────────────────── */

    const activeIndex = activeDay ? scopedDates.indexOf(activeDay) : -1;
    const canStepOlder = activeIndex >= 0 && activeIndex < scopedDates.length - 1;
    const canStepNewer = activeIndex > 0;

    const stepDate = (dir: 'older' | 'newer') => {
        if (activeIndex < 0) return;
        if (dir === 'older' && canStepOlder) onSelectDate(scopedDates[activeIndex + 1]);
        if (dir === 'newer' && canStepNewer) onSelectDate(scopedDates[activeIndex - 1]);
    };

    /* ── Calendar month state ─────────────────────── */

    const anchorDay = activeDay || maxDay || todayIsoDay || '';
    const anchorDate = anchorDay ? (getUTCDateFromISODate(anchorDay) || new Date()) : new Date();
    const [viewYear, setViewYear] = useState(anchorDate.getUTCFullYear());
    const [viewMonth, setViewMonth] = useState(anchorDate.getUTCMonth());

    // Reset calendar view when the panel opens
    useEffect(() => {
        if (isOpen) {
            const d = anchorDay ? (getUTCDateFromISODate(anchorDay) || new Date()) : new Date();
            setViewYear(d.getUTCFullYear());
            setViewMonth(d.getUTCMonth());
        }
    }, [isOpen]);

    const navigateMonth = (delta: number) => {
        const d = new Date(Date.UTC(viewYear, viewMonth + delta, 1, 12, 0, 0, 0));
        setViewYear(d.getUTCFullYear());
        setViewMonth(d.getUTCMonth());
    };

    const monthGrid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

    /* ── Day click handler ────────────────────────── */

    const handleDayClick = (isoDay: string) => {
        if (isRangeMode) {
            // In range mode, clicking a day sets the start of the range to that day
            commitRange(isoDay, newestDay);
        } else {
            if (hasDateConstraint) {
                const closest = findClosestDay(isoDay, dates);
                if (closest) onSelectDate(closest);
            } else {
                onSelectDate(isoDay);
            }
            setIsOpen(false);
            window.requestAnimationFrame(() => triggerRef.current?.focus());
        }
    };

    const isDaySelectable = (isoDay: string) => {
        if (minDay && isoDay < minDay) return false;
        if (maxDay && isoDay > maxDay) return false;
        if (hasDateConstraint) return availableSet.has(isoDay);
        return true;
    };

    const isDayInRange = (isoDay: string) => {
        if (!isRangeMode) return false;
        return isoDay >= normalizedDraftRange.start && isoDay <= normalizedDraftRange.end;
    };

    const isDaySelected = (isoDay: string) => {
        if (isRangeMode) {
            return isoDay === normalizedDraftRange.start || isoDay === normalizedDraftRange.end;
        }
        return isoDay === activeDay;
    };

    /* ── Close on outside click / escape ──────────── */

    useEffect(() => {
        if (!isOpen) return;
        const focusTimer = window.setTimeout(() => {
            panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        }, 0);
        const onPointer = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey, true);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [isOpen]);

    /* ── Labels ───────────────────────────────────── */

    const triggerLabel = isRangeMode
        ? (normalizedDraftRange.start && normalizedDraftRange.end
            ? `${formatDayShort(normalizedDraftRange.start)} – ${formatDayShort(normalizedDraftRange.end)}`
            : 'Select range')
        : (activeDay ? formatDayLong(activeDay) : 'Select date');

    const isDisabled = hasDateConstraint && dates.length === 0;

    /* ── Calendar grid (shared between modes) ────── */

    const calendarGrid = (
        <div className="dp-calendar">
            {/* Month navigation */}
            <div className="dp-month-nav">
                <button type="button" onClick={() => navigateMonth(-1)} className="dp-month-btn min-h-11 min-w-11" aria-label="Previous month">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="dp-month-label">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button type="button" onClick={() => navigateMonth(1)} className="dp-month-btn min-h-11 min-w-11" aria-label="Next month">
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>

            <div
                className="dp-calendar-viewport"
                role="region"
                aria-label="Calendar dates"
                tabIndex={0}
            >
                {/* Weekday headers */}
                <div className="dp-weekdays">
                    {WEEKDAYS.map((wd) => (
                        <span key={wd} className="dp-weekday">{wd}</span>
                    ))}
                </div>

                {/* Day cells */}
                <div className="dp-days">
                    {monthGrid.map((isoDay, i) => {
                        if (!isoDay) return <span key={`empty-${i}`} className="dp-cell-empty" />;
                        const dayNum = Number(isoDay.slice(8));
                        const selectable = isDaySelectable(isoDay);
                        const selected = isDaySelected(isoDay);
                        const inRange = isDayInRange(isoDay);
                        const isToday = todayIsoDay ? isoDay === todayIsoDay : false;

                        return (
                            <button
                                key={isoDay}
                                type="button"
                                disabled={!selectable}
                                onClick={() => handleDayClick(isoDay)}
                                className={[
                                    'dp-cell min-h-11 min-w-11',
                                    selected && 'is-selected',
                                    inRange && !selected && 'is-in-range',
                                    isToday && !selected && 'is-today',
                                    !selectable && 'is-unavailable',
                                ].filter(Boolean).join(' ')}
                                aria-label={formatDayLong(isoDay)}
                                aria-pressed={selected}
                            >
                                {dayNum}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );

    /* ─── Render: field variant ───────────────────── */

    if (isField) {
        return (
            <div ref={rootRef} className={`relative ${className}`}>
                {label && (
                    <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">{label}</span>
                )}
                <button
                    ref={triggerRef}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => setIsOpen((o) => !o)}
                    className={`date-picker-trigger dp-field-trigger ${isDisabled ? 'is-disabled' : ''}`}
                    aria-expanded={isOpen}
                    aria-haspopup="dialog"
                    aria-controls={isOpen ? panelId : undefined}
                >
                    <CalendarDays className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                    <span className="truncate font-medium">{activeDay ? formatDayLong(activeDay) : 'Pick a date'}</span>
                    <ChevronDown aria-hidden="true" className={`ml-auto h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                    <div
                        id={panelId}
                        ref={panelRef}
                        role="dialog"
                        aria-label="Date picker"
                        className="date-picker-panel date-picker-panel--field absolute left-0 z-50 mt-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-raised)] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.12)]"
                    >
                        {calendarGrid}
                    </div>
                )}
            </div>
        );
    }

    /* ─── Render: dropdown variant (default) ─────── */

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                disabled={isDisabled}
                onClick={() => setIsOpen((o) => !o)}
                className={`date-picker-trigger group ${isDisabled ? 'is-disabled' : ''}`}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                aria-controls={isOpen ? panelId : undefined}
            >
                <CalendarDays className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                <span className="truncate font-medium">{triggerLabel}</span>
                <ChevronDown aria-hidden="true" className={`ml-auto h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {showStepper && (
                <div className="mt-2 flex items-center justify-end gap-1.5">
                    <button type="button" onClick={() => stepDate('older')} disabled={!canStepOlder} className="date-picker-step" aria-label="Select older date">
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="min-w-[7.25rem] text-center font-mono text-xs text-[var(--text-muted)] tabular-nums">
                        {activeDay || '--'}
                    </span>
                    <button type="button" onClick={() => stepDate('newer')} disabled={!canStepNewer} className="date-picker-step" aria-label="Select newer date">
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}

            {isOpen && (
                <div
                    id={panelId}
                    ref={panelRef}
                    role="dialog"
                    aria-label={isRangeMode ? 'Date range picker' : 'Date picker'}
                    className="date-picker-panel absolute right-0 z-50 mt-2 w-[min(92vw,22rem)] rounded-xl border border-[var(--border-default)] bg-[var(--bg-raised)] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.12)]"
                >
                    {isRangeMode ? (
                        <div className="space-y-3">
                            {/* Quick range chips */}
                            <div className="flex flex-wrap gap-1.5">
                                {QUICK_RANGES.map((qr) => (
                                    <button
                                        key={qr.key}
                                        type="button"
                                        onClick={() => applyQuickRange(qr.days)}
                                        aria-pressed={activeQuickRange === qr.key}
                                        className={`date-picker-chip min-h-11 ${activeQuickRange === qr.key ? 'is-active' : ''}`}
                                    >
                                        {qr.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={applyFullRange}
                                    aria-pressed={activeQuickRange === 'all'}
                                    className={`date-picker-chip min-h-11 ${activeQuickRange === 'all' ? 'is-active' : ''}`}
                                >
                                    Max
                                </button>
                            </div>

                            {/* Calendar */}
                            {calendarGrid}

                            {/* Summary */}
                            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                                <span className="font-medium text-[var(--text-primary)]">{scopedDates.length.toLocaleString()} days</span>
                                {' '}from {formatDayShort(normalizedDraftRange.start)} to {formatDayShort(normalizedDraftRange.end)}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Quick buttons */}
                            <div className="flex flex-wrap gap-1.5">
                                <button type="button" onClick={() => newestDay && onSelectDate(newestDay)} className="date-picker-chip min-h-11">Latest</button>
                                <button type="button" onClick={() => oldestDay && onSelectDate(oldestDay)} className="date-picker-chip min-h-11">Oldest</button>
                            </div>

                            {/* Calendar */}
                            {calendarGrid}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;
