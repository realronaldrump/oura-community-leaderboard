import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';

type QuickRange = {
    key: string;
    label: string;
    days: number;
};

type MonthBucket = {
    key: string;
    label: string;
    year: string;
    newest: string;
    oldest: string;
    dayCount: number;
};

type DateRangePickerProps = {
    dates: string[];
    selectedDate?: string;
    onSelectDate: (date: string) => void;
    range?: { start: string; end: string };
    onRangeChange?: (range: { start: string; end: string }) => void;
    mode?: 'date' | 'range';
    className?: string;
};

const QUICK_RANGES: QuickRange[] = [
    { key: '30d', label: '30D', days: 30 },
    { key: '90d', label: '90D', days: 90 },
    { key: '1y', label: '1Y', days: 365 },
];

const toDateMs = (isoDay: string): number => new Date(`${isoDay}T12:00:00`).getTime();

const formatDayShort = (isoDay: string): string => (
    new Date(`${isoDay}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
);

const formatDayLong = (isoDay: string): string => (
    new Date(`${isoDay}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
);

const formatMonthLabel = (monthKey: string): string => (
    new Date(`${monthKey}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short' })
);

const clampRange = (start: string, end: string): { start: string; end: string } => {
    if (start <= end) return { start, end };
    return { start: end, end: start };
};

const findClosestDay = (targetDay: string, dates: string[]): string | undefined => {
    if (dates.length === 0) return undefined;
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
}) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const newestDay = dates[0];
    const oldestDay = dates[dates.length - 1];

    const isRangeMode = mode === 'range';
    const [isOpen, setIsOpen] = useState(false);
    const [rangeStart, setRangeStart] = useState(oldestDay || '');
    const [rangeEnd, setRangeEnd] = useState(newestDay || '');
    const [yearFilter, setYearFilter] = useState(newestDay?.slice(0, 4) || '');

    useEffect(() => {
        if (!dates.length) {
            setRangeStart('');
            setRangeEnd('');
            setYearFilter('');
            return;
        }

        setRangeStart((previous) => (previous && dates.includes(previous) ? previous : dates[dates.length - 1]));
        setRangeEnd((previous) => (previous && dates.includes(previous) ? previous : dates[0]));
        setYearFilter((previous) => previous || dates[0].slice(0, 4));
    }, [dates]);

    useEffect(() => {
        if (!isRangeMode || !range) return;
        setRangeStart((previous) => (previous === range.start ? previous : range.start));
        setRangeEnd((previous) => (previous === range.end ? previous : range.end));
        setYearFilter((previous) => previous || range.start.slice(0, 4));
    }, [isRangeMode, range]);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const orderedRange = useMemo(() => {
        if (!isRangeMode) {
            return { start: oldestDay || '', end: newestDay || '' };
        }
        if (!rangeStart || !rangeEnd) {
            return { start: oldestDay || '', end: newestDay || '' };
        }
        return clampRange(rangeStart, rangeEnd);
    }, [isRangeMode, newestDay, oldestDay, rangeEnd, rangeStart]);

    const rangeDatesDescending = useMemo(() => {
        if (!isRangeMode) return dates;
        if (!orderedRange.start || !orderedRange.end) return [];
        return dates.filter((day) => day >= orderedRange.start && day <= orderedRange.end);
    }, [dates, isRangeMode, orderedRange.end, orderedRange.start]);

    const rangeDatesAscending = useMemo(
        () => [...rangeDatesDescending].reverse(),
        [rangeDatesDescending]
    );

    const activeDay = selectedDate && dates.includes(selectedDate) ? selectedDate : newestDay;
    const selectedInRange = activeDay && rangeDatesDescending.includes(activeDay) ? activeDay : rangeDatesDescending[0];

    useEffect(() => {
        if (!selectedInRange) return;
        if (selectedDate === selectedInRange) return;
        onSelectDate(selectedInRange);
    }, [onSelectDate, selectedDate, selectedInRange]);

    const monthBuckets = useMemo<MonthBucket[]>(() => {
        const monthMap = new Map<string, MonthBucket>();

        dates.forEach((day) => {
            const monthKey = day.slice(0, 7);
            const existing = monthMap.get(monthKey);

            if (!existing) {
                monthMap.set(monthKey, {
                    key: monthKey,
                    label: formatMonthLabel(monthKey),
                    year: day.slice(0, 4),
                    newest: day,
                    oldest: day,
                    dayCount: 1,
                });
                return;
            }

            existing.oldest = day;
            existing.dayCount += 1;
        });

        return Array.from(monthMap.values()).sort((a, b) => b.key.localeCompare(a.key));
    }, [dates]);

    const availableYears = useMemo(() => {
        const years = new Set(monthBuckets.map((month) => month.year));
        return Array.from(years).sort((a, b) => Number(b) - Number(a));
    }, [monthBuckets]);

    const visibleMonths = useMemo(
        () => monthBuckets.filter((month) => month.year === yearFilter),
        [monthBuckets, yearFilter]
    );

    const applyRange = (start: string, end: string) => {
        const ordered = clampRange(start, end);
        if (!isRangeMode) return;
        setRangeStart(ordered.start);
        setRangeEnd(ordered.end);
        onRangeChange?.(ordered);

        const nextRangeDates = dates.filter((day) => day >= ordered.start && day <= ordered.end);
        if (!nextRangeDates.length) return;

        if (!selectedDate || !nextRangeDates.includes(selectedDate)) {
            onSelectDate(nextRangeDates[0]);
        }
    };

    const applyQuickRange = (days: number) => {
        if (!isRangeMode) return;
        if (!dates.length) return;
        const endDay = dates[0];
        const startIndex = Math.min(days - 1, dates.length - 1);
        const startDay = dates[startIndex];
        applyRange(startDay, endDay);
        setYearFilter(startDay.slice(0, 4));
    };

    const applyAllTimeRange = () => {
        if (!isRangeMode) return;
        if (!dates.length) return;
        applyRange(dates[dates.length - 1], dates[0]);
        setYearFilter(dates[dates.length - 1].slice(0, 4));
    };

    const selectMonth = (month: MonthBucket) => {
        if (!isRangeMode) {
            onSelectDate(month.newest);
            return;
        }
        applyRange(month.oldest, month.newest);
        setYearFilter(month.year);
    };

    const sliderIndex = selectedInRange
        ? Math.max(0, rangeDatesAscending.indexOf(selectedInRange))
        : Math.max(0, rangeDatesAscending.length - 1);

    const handleSliderChange = (value: number) => {
        const nextDate = rangeDatesAscending[value];
        if (nextDate) onSelectDate(nextDate);
    };

    const triggerLabel = isRangeMode
        ? (
            orderedRange.start && orderedRange.end
                ? `${formatDayShort(orderedRange.start)} – ${formatDayShort(orderedRange.end)}`
                : 'Select range'
        )
        : (selectedInRange ? formatDayLong(selectedInRange) : 'Select date');

    const isDisabled = dates.length === 0;
    const activeMonthKey = isRangeMode
        ? (
            orderedRange.start && orderedRange.end && orderedRange.start.slice(0, 7) === orderedRange.end.slice(0, 7)
                ? orderedRange.start.slice(0, 7)
                : ''
        )
        : (selectedInRange?.slice(0, 7) || '');

    // Determine which quick range pill is active
    const activeQuickRange = useMemo(() => {
        if (!isRangeMode || !orderedRange.start || !orderedRange.end || !dates.length) return '';
        const endDay = dates[0];
        if (orderedRange.end !== endDay) return '';
        for (const qr of QUICK_RANGES) {
            const startIndex = Math.min(qr.days - 1, dates.length - 1);
            if (orderedRange.start === dates[startIndex]) return qr.key;
        }
        if (orderedRange.start === dates[dates.length - 1] && orderedRange.end === dates[0]) return 'all';
        return '';
    }, [isRangeMode, orderedRange, dates]);

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            {/* ── Trigger ── */}
            <button
                type="button"
                disabled={isDisabled}
                onClick={() => setIsOpen((open) => !open)}
                className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                    isDisabled
                        ? 'cursor-not-allowed border-[#2A2A2A] bg-[#141414] text-[#555]'
                        : 'border-[#2B2B2B] bg-[#141414] hover:border-[#3A3A3A] hover:bg-[#181818] text-[#E0E0E0]'
                }`}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
            >
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#00C896]" />
                <span className="truncate font-medium">{triggerLabel}</span>
                <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 text-[#666] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* ── Dropdown ── */}
            {isOpen && (
                <div
                    role="dialog"
                    aria-label="Date picker"
                    className="date-picker-panel absolute right-0 z-50 mt-2 w-[min(90vw,26rem)] overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#111111] shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
                >
                    {/* Accent top edge */}
                    <div className="h-[2px] bg-gradient-to-r from-[#00C896]/60 via-[#00C896]/20 to-transparent" />

                    <div className="space-y-3 p-4">
                        {/* ── Range mode: quick ranges + range summary ── */}
                        {isRangeMode && (
                            <>
                                {/* Quick range pills */}
                                <div className="flex items-center gap-1.5">
                                    {QUICK_RANGES.map((quickRange) => (
                                        <button
                                            key={quickRange.key}
                                            type="button"
                                            onClick={() => applyQuickRange(quickRange.days)}
                                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                                activeQuickRange === quickRange.key
                                                    ? 'bg-[#00C896]/15 text-[#00C896] border border-[#00C896]/30'
                                                    : 'bg-[#1A1A1A] text-[#999] border border-[#252525] hover:border-[#333] hover:text-[#CCC]'
                                            }`}
                                        >
                                            {quickRange.label}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={applyAllTimeRange}
                                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                            activeQuickRange === 'all'
                                                ? 'bg-[#00C896]/15 text-[#00C896] border border-[#00C896]/30'
                                                : 'bg-[#1A1A1A] text-[#999] border border-[#252525] hover:border-[#333] hover:text-[#CCC]'
                                        }`}
                                    >
                                        All
                                    </button>
                                    <span className="ml-auto text-[11px] text-[#555] font-mono tabular-nums">
                                        {rangeDatesDescending.length}d
                                    </span>
                                </div>

                                {/* Range summary line */}
                                <div className="flex items-center gap-2 rounded-lg bg-[#181818] border border-[#222] px-3 py-2 text-xs">
                                    <span className="text-[#777]">From</span>
                                    <span className="font-medium text-[#D0D0D0]">{orderedRange.start ? formatDayShort(orderedRange.start) : '—'}</span>
                                    <span className="text-[#444]">→</span>
                                    <span className="text-[#777]">To</span>
                                    <span className="font-medium text-[#D0D0D0]">{orderedRange.end ? formatDayShort(orderedRange.end) : '—'}</span>
                                </div>
                            </>
                        )}

                        {/* ── Date mode: single date input ── */}
                        {!isRangeMode && (
                            <input
                                type="date"
                                min={oldestDay}
                                max={newestDay}
                                value={selectedInRange || ''}
                                onChange={(event) => {
                                    const closestAvailableDay = findClosestDay(event.target.value, dates);
                                    if (closestAvailableDay) onSelectDate(closestAvailableDay);
                                }}
                                className="w-full rounded-lg border border-[#2D2D2D] bg-[#181818] px-3 py-2 text-sm text-[#EFEFEF] outline-none transition-colors focus:border-[#00C896]/60"
                            />
                        )}

                        {/* ── Month grid ── */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                    {availableYears.map((year) => (
                                        <button
                                            key={year}
                                            type="button"
                                            onClick={() => setYearFilter(year)}
                                            className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                                yearFilter === year
                                                    ? 'bg-[#222] text-[#EAEAEA]'
                                                    : 'text-[#666] hover:text-[#AAA]'
                                            }`}
                                        >
                                            {year}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!newestDay) return;
                                        onSelectDate(newestDay);
                                        if (isRangeMode) {
                                            applyRange(oldestDay || newestDay, newestDay);
                                        }
                                        setIsOpen(false);
                                    }}
                                    className="text-[11px] text-[#00C896]/70 hover:text-[#00C896] transition-colors font-medium"
                                >
                                    Latest
                                </button>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                                {visibleMonths.map((month) => {
                                    const isMonthActive = activeMonthKey === month.key;
                                    return (
                                        <button
                                            key={month.key}
                                            type="button"
                                            onClick={() => selectMonth(month)}
                                            className={`rounded-lg px-2 py-2 text-left transition-colors ${
                                                isMonthActive
                                                    ? 'bg-[#00C896]/12 text-[#B0F0DB]'
                                                    : 'bg-[#161616] text-[#999] hover:bg-[#1E1E1E] hover:text-[#CCC]'
                                            }`}
                                        >
                                            <span className="block text-xs font-medium">{month.label}</span>
                                            <span className="text-[10px] text-[#555] font-mono">{month.dayCount}d</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── Day slider ── */}
                        <div className="rounded-lg bg-[#161616] border border-[#222] px-3 py-2.5">
                            <input
                                type="range"
                                min={0}
                                max={Math.max(0, rangeDatesAscending.length - 1)}
                                value={sliderIndex}
                                onChange={(event) => handleSliderChange(Number(event.target.value))}
                                className="day-range-slider w-full"
                                disabled={rangeDatesAscending.length <= 1}
                            />
                            <div className="mt-1.5 flex items-center justify-between text-[10px]">
                                <span className="text-[#555]">{rangeDatesAscending[0] ? formatDayShort(rangeDatesAscending[0]) : '—'}</span>
                                <span className="font-medium text-[#D0D0D0] text-[11px]">
                                    {selectedInRange ? formatDayShort(selectedInRange) : '—'}
                                </span>
                                <span className="text-[#555]">{rangeDatesAscending.length > 0 ? formatDayShort(rangeDatesAscending[rangeDatesAscending.length - 1]) : '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;
