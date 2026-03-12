import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

type QuickRange = {
    key: string;
    label: string;
    days: number;
};

type DateRangePickerProps = {
    dates: string[];
    selectedDate?: string;
    onSelectDate: (date: string) => void;
    range?: { start: string; end: string };
    onRangeChange?: (range: { start: string; end: string }) => void;
    mode?: 'date' | 'range';
    className?: string;
    showStepper?: boolean;
};

const QUICK_RANGES: QuickRange[] = [
    { key: '7d', label: '7D', days: 7 },
    { key: '30d', label: '30D', days: 30 },
    { key: '90d', label: '90D', days: 90 },
    { key: '1y', label: '1Y', days: 365 },
];

const toDateMs = (isoDay: string): number => new Date(`${isoDay}T12:00:00`).getTime();

const formatDayLong = (isoDay: string): string => (
    new Date(`${isoDay}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })
);

const formatDayShort = (isoDay: string): string => (
    new Date(`${isoDay}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
);

const clampRange = (start: string, end: string): { start: string; end: string } => {
    if (start <= end) return { start, end };
    return { start: end, end: start };
};

const findClosestDay = (targetDay: string, dates: string[]): string | undefined => {
    if (!targetDay || dates.length === 0) return undefined;
    if (dates.includes(targetDay)) return targetDay;

    const targetMs = toDateMs(targetDay);
    let closestDay = dates[0];
    let closestDistance = Math.abs(toDateMs(closestDay) - targetMs);

    for (let i = 1; i < dates.length; i += 1) {
        const candidateDay = dates[i];
        const distance = Math.abs(toDateMs(candidateDay) - targetMs);
        if (distance < closestDistance) {
            closestDay = candidateDay;
            closestDistance = distance;
        }
    }

    return closestDay;
};

const DateRangePicker: React.FC<DateRangePickerProps> = ({
    dates,
    selectedDate,
    onSelectDate,
    range,
    onRangeChange,
    mode = 'range',
    className = '',
    showStepper = false,
}) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const newestDay = dates[0] || '';
    const oldestDay = dates[dates.length - 1] || '';
    const isRangeMode = mode === 'range';
    const [isOpen, setIsOpen] = useState(false);

    const fallbackRange = useMemo(
        () => ({ start: oldestDay, end: newestDay }),
        [newestDay, oldestDay]
    );

    const effectiveRange = useMemo(() => {
        if (!isRangeMode || !dates.length) return fallbackRange;

        const inputStart = range?.start || fallbackRange.start;
        const inputEnd = range?.end || fallbackRange.end;
        const closestStart = findClosestDay(inputStart, dates) || oldestDay;
        const closestEnd = findClosestDay(inputEnd, dates) || newestDay;
        return clampRange(closestStart, closestEnd);
    }, [dates, fallbackRange, isRangeMode, newestDay, oldestDay, range?.end, range?.start]);

    const [draftStart, setDraftStart] = useState(effectiveRange.start);
    const [draftEnd, setDraftEnd] = useState(effectiveRange.end);

    useEffect(() => {
        setDraftStart(effectiveRange.start);
        setDraftEnd(effectiveRange.end);
    }, [effectiveRange.end, effectiveRange.start]);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    const normalizedDraftRange = useMemo(() => {
        if (!isRangeMode) return fallbackRange;
        if (!draftStart || !draftEnd) return effectiveRange;
        return clampRange(draftStart, draftEnd);
    }, [draftEnd, draftStart, effectiveRange, fallbackRange, isRangeMode]);

    const scopedDates = useMemo(() => {
        if (!isRangeMode) return dates;
        if (!normalizedDraftRange.start || !normalizedDraftRange.end) return [];
        return dates.filter((day) => day >= normalizedDraftRange.start && day <= normalizedDraftRange.end);
    }, [dates, isRangeMode, normalizedDraftRange.end, normalizedDraftRange.start]);

    const activeDay = useMemo(() => {
        if (dates.length === 0) return '';
        if (selectedDate && dates.includes(selectedDate)) {
            if (!isRangeMode || scopedDates.includes(selectedDate)) return selectedDate;
        }
        if (scopedDates.length > 0) return scopedDates[0];
        return newestDay;
    }, [dates, isRangeMode, newestDay, scopedDates, selectedDate]);

    useEffect(() => {
        if (!activeDay) return;
        if (selectedDate === activeDay) return;
        onSelectDate(activeDay);
    }, [activeDay, onSelectDate, selectedDate]);

    const commitRange = (startInput: string, endInput: string) => {
        if (!isRangeMode || !dates.length) return;

        const nextStart = findClosestDay(startInput, dates) || oldestDay;
        const nextEnd = findClosestDay(endInput, dates) || newestDay;
        const ordered = clampRange(nextStart, nextEnd);

        setDraftStart(ordered.start);
        setDraftEnd(ordered.end);
        onRangeChange?.(ordered);

        const nextScopedDates = dates.filter((day) => day >= ordered.start && day <= ordered.end);
        if (!nextScopedDates.length) return;

        const nextActiveDay = selectedDate && nextScopedDates.includes(selectedDate)
            ? selectedDate
            : nextScopedDates[0];

        if (nextActiveDay && nextActiveDay !== selectedDate) {
            onSelectDate(nextActiveDay);
        }
    };

    const applyQuickRange = (days: number) => {
        if (!dates.length) return;
        const startIndex = Math.min(days - 1, dates.length - 1);
        const start = dates[startIndex];
        const end = dates[0];
        commitRange(start, end);
    };

    const applyFullRange = () => {
        if (!dates.length) return;
        commitRange(oldestDay, newestDay);
    };

    const activeQuickRange = useMemo(() => {
        if (!isRangeMode || !dates.length) return '';
        if (normalizedDraftRange.end !== newestDay) return '';

        for (const quickRange of QUICK_RANGES) {
            const startIndex = Math.min(quickRange.days - 1, dates.length - 1);
            if (normalizedDraftRange.start === dates[startIndex]) {
                return quickRange.key;
            }
        }

        if (normalizedDraftRange.start === oldestDay && normalizedDraftRange.end === newestDay) {
            return 'all';
        }

        return '';
    }, [dates, isRangeMode, newestDay, normalizedDraftRange.end, normalizedDraftRange.start, oldestDay]);

    const activeIndex = activeDay ? scopedDates.indexOf(activeDay) : -1;
    const canStepOlder = activeIndex >= 0 && activeIndex < scopedDates.length - 1;
    const canStepNewer = activeIndex > 0;

    const stepDate = (direction: 'older' | 'newer') => {
        if (activeIndex < 0) return;

        if (direction === 'older' && canStepOlder) {
            onSelectDate(scopedDates[activeIndex + 1]);
        }

        if (direction === 'newer' && canStepNewer) {
            onSelectDate(scopedDates[activeIndex - 1]);
        }
    };

    const triggerLabel = isRangeMode
        ? (
            normalizedDraftRange.start && normalizedDraftRange.end
                ? `${formatDayShort(normalizedDraftRange.start)} - ${formatDayShort(normalizedDraftRange.end)}`
                : 'Select range'
        )
        : (activeDay ? formatDayLong(activeDay) : 'Select date');

    const isDisabled = dates.length === 0;
    const recentDates = dates.slice(0, 18);

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <button
                type="button"
                disabled={isDisabled}
                onClick={() => setIsOpen((open) => !open)}
                className={`date-picker-trigger group ${isDisabled ? 'is-disabled' : ''}`}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
            >
                <CalendarDays className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <span className="truncate font-medium">{triggerLabel}</span>
                <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {showStepper && (
                <div className="mt-2 flex items-center justify-end gap-1.5">
                    <button
                        type="button"
                        onClick={() => stepDate('older')}
                        disabled={!canStepOlder}
                        className="date-picker-step"
                        aria-label="Select older date"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="min-w-[7.25rem] text-center font-mono text-xs text-[var(--text-muted)] tabular-nums">
                        {activeDay || '--'}
                    </span>
                    <button
                        type="button"
                        onClick={() => stepDate('newer')}
                        disabled={!canStepNewer}
                        className="date-picker-step"
                        aria-label="Select newer date"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}

            {isOpen && (
                <div
                    role="dialog"
                    aria-label={isRangeMode ? 'Date range picker' : 'Date picker'}
                    className="date-picker-panel absolute right-0 z-50 mt-2 w-[min(92vw,22rem)] rounded-xl border border-[var(--border-default)] bg-[var(--bg-raised)] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.45)]"
                >
                    {isRangeMode ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-1.5">
                                {QUICK_RANGES.map((quickRange) => (
                                    <button
                                        key={quickRange.key}
                                        type="button"
                                        onClick={() => applyQuickRange(quickRange.days)}
                                        className={`date-picker-chip ${activeQuickRange === quickRange.key ? 'is-active' : ''}`}
                                    >
                                        {quickRange.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={applyFullRange}
                                    className={`date-picker-chip ${activeQuickRange === 'all' ? 'is-active' : ''}`}
                                >
                                    Max
                                </button>
                            </div>

                            <label className="date-picker-field">
                                <span>Start</span>
                                <input
                                    type="date"
                                    min={oldestDay}
                                    max={newestDay}
                                    value={normalizedDraftRange.start}
                                    onChange={(event) => commitRange(event.target.value, newestDay)}
                                />
                            </label>

                            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                                <span className="font-medium text-[var(--text-primary)]">{scopedDates.length.toLocaleString()} days</span>
                                {' '}from {formatDayShort(normalizedDraftRange.start)} to {formatDayShort(newestDay)}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <label className="date-picker-field">
                                <span>Day</span>
                                <input
                                    type="date"
                                    min={oldestDay}
                                    max={newestDay}
                                    value={activeDay}
                                    onChange={(event) => {
                                        const nextDay = findClosestDay(event.target.value, dates);
                                        if (nextDay) onSelectDate(nextDay);
                                    }}
                                />
                            </label>

                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => newestDay && onSelectDate(newestDay)}
                                    className="date-picker-chip"
                                >
                                    Latest
                                </button>
                                <button
                                    type="button"
                                    onClick={() => oldestDay && onSelectDate(oldestDay)}
                                    className="date-picker-chip"
                                >
                                    Oldest
                                </button>
                            </div>

                            <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-auto pr-1 sm:grid-cols-2">
                                {recentDates.map((date) => (
                                    <button
                                        key={date}
                                        type="button"
                                        onClick={() => onSelectDate(date)}
                                        className={`date-picker-day ${date === activeDay ? 'is-active' : ''}`}
                                    >
                                        <span className="truncate">{formatDayLong(date)}</span>
                                        <span className="font-mono text-[10px] text-[var(--text-muted)]">{date}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;
