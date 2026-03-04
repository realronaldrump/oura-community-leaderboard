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

    const handleBoundaryChange = (boundary: 'start' | 'end', inputValue: string) => {
        if (!inputValue) return;
        const closestAvailableDay = findClosestDay(inputValue, dates);
        if (!closestAvailableDay) return;

        if (boundary === 'start') {
            applyRange(closestAvailableDay, rangeEnd || newestDay || closestAvailableDay);
            return;
        }

        applyRange(rangeStart || oldestDay || closestAvailableDay, closestAvailableDay);
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

    const rangeLabel = isRangeMode
        ? (
            orderedRange.start && orderedRange.end
                ? `${formatDayShort(orderedRange.start)} - ${formatDayShort(orderedRange.end)}`
                : 'Select date range'
        )
        : (selectedInRange ? formatDayShort(selectedInRange) : 'Select date');

    const selectedLabel = selectedInRange ? formatDayLong(selectedInRange) : 'No data available';

    const isDisabled = dates.length === 0;
    const activeMonthKey = isRangeMode
        ? (
            orderedRange.start && orderedRange.end && orderedRange.start.slice(0, 7) === orderedRange.end.slice(0, 7)
                ? orderedRange.start.slice(0, 7)
                : ''
        )
        : (selectedInRange?.slice(0, 7) || '');

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <button
                type="button"
                disabled={isDisabled}
                onClick={() => setIsOpen((open) => !open)}
                className={`group w-full sm:w-[18.5rem] min-h-[2.75rem] rounded-xl border px-3 py-2 text-left transition-all ${
                    isDisabled
                        ? 'cursor-not-allowed border-[#2A2A2A] bg-[#141414] text-[#555]'
                        : 'border-[#2B2B2B] bg-[#141414] hover:border-[#3A3A3A] hover:bg-[#181818] text-[#FAFAFA]'
                }`}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
            >
                <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                        <span className="mb-0.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-[#5A5A5A]">
                            <CalendarDays className="h-3.5 w-3.5 text-[#00C896]" />
                            {isRangeMode ? 'Range Picker' : 'Date Picker'}
                        </span>
                        <span className="block truncate text-sm font-medium leading-tight">{selectedLabel}</span>
                        <span className="block truncate font-mono text-[11px] text-[#7C7C7C]">{rangeLabel}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-[#888] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </span>
            </button>

            {isOpen && (
                <div
                    role="dialog"
                    aria-label="Date range picker"
                    className="absolute right-0 z-50 mt-3 w-[min(92vw,32rem)] overflow-hidden rounded-2xl border border-[#2C2C2C] bg-[#0F0F0F]/95 shadow-[0_20px_40px_rgba(0,0,0,0.5)] backdrop-blur"
                >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,200,150,0.12),transparent_45%)]" />
                    <div className="relative space-y-4 p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.16em] text-[#5E5E5E]">Navigate History</p>
                                <p className="text-sm text-[#D8D8D8]">
                                    {rangeDatesDescending.length.toLocaleString()} days {isRangeMode ? 'in range' : 'available'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!newestDay) return;
                                    onSelectDate(newestDay);
                                    setIsOpen(false);
                                }}
                                className="min-h-[2.75rem] rounded-lg border border-[#2F2F2F] px-3 py-2 text-xs font-medium text-[#D4D4D4] transition-colors hover:border-[#00C89666] hover:text-[#FAFAFA]"
                            >
                                Jump to Latest
                            </button>
                        </div>

                        {isRangeMode && (
                            <>
                                <div className="flex flex-wrap gap-2">
                                    {QUICK_RANGES.map((quickRange) => (
                                        <button
                                            key={quickRange.key}
                                            type="button"
                                            onClick={() => applyQuickRange(quickRange.days)}
                                            className="min-h-[2.5rem] rounded-lg border border-[#2E2E2E] px-3 py-1.5 text-xs font-medium text-[#CFCFCF] transition-colors hover:border-[#3D3D3D] hover:bg-[#181818]"
                                        >
                                            Last {quickRange.label}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={applyAllTimeRange}
                                        className="min-h-[2.5rem] rounded-lg border border-[#2E2E2E] px-3 py-1.5 text-xs font-medium text-[#CFCFCF] transition-colors hover:border-[#3D3D3D] hover:bg-[#181818]"
                                    >
                                        All Time
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <label className="space-y-1">
                                        <span className="text-[11px] uppercase tracking-[0.14em] text-[#5F5F5F]">From</span>
                                        <input
                                            type="date"
                                            min={oldestDay}
                                            max={newestDay}
                                            value={orderedRange.start}
                                            onChange={(event) => handleBoundaryChange('start', event.target.value)}
                                            className="w-full min-h-[2.75rem] rounded-lg border border-[#2D2D2D] bg-[#131313] px-3 text-sm text-[#EFEFEF] outline-none transition-colors focus:border-[#00C89699]"
                                        />
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-[11px] uppercase tracking-[0.14em] text-[#5F5F5F]">To</span>
                                        <input
                                            type="date"
                                            min={oldestDay}
                                            max={newestDay}
                                            value={orderedRange.end}
                                            onChange={(event) => handleBoundaryChange('end', event.target.value)}
                                            className="w-full min-h-[2.75rem] rounded-lg border border-[#2D2D2D] bg-[#131313] px-3 text-sm text-[#EFEFEF] outline-none transition-colors focus:border-[#00C89699]"
                                        />
                                    </label>
                                </div>
                            </>
                        )}

                        {!isRangeMode && (
                            <label className="space-y-1">
                                <span className="text-[11px] uppercase tracking-[0.14em] text-[#5F5F5F]">Select Date</span>
                                <input
                                    type="date"
                                    min={oldestDay}
                                    max={newestDay}
                                    value={selectedInRange || ''}
                                    onChange={(event) => {
                                        const closestAvailableDay = findClosestDay(event.target.value, dates);
                                        if (closestAvailableDay) onSelectDate(closestAvailableDay);
                                    }}
                                    className="w-full min-h-[2.75rem] rounded-lg border border-[#2D2D2D] bg-[#131313] px-3 text-sm text-[#EFEFEF] outline-none transition-colors focus:border-[#00C89699]"
                                />
                            </label>
                        )}

                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] uppercase tracking-[0.14em] text-[#5F5F5F]">Jump by Month</p>
                                <select
                                    value={yearFilter}
                                    onChange={(event) => setYearFilter(event.target.value)}
                                    className="min-h-[2.5rem] rounded-lg border border-[#2D2D2D] bg-[#131313] px-3 text-xs text-[#EAEAEA] outline-none focus:border-[#00C89699]"
                                >
                                    {availableYears.map((year) => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                                {visibleMonths.map((month) => {
                                    const isMonthActive = activeMonthKey === month.key;
                                    return (
                                        <button
                                            key={month.key}
                                            type="button"
                                            onClick={() => selectMonth(month)}
                                            className={`min-h-[2.5rem] rounded-lg border px-2 py-1.5 text-left transition-colors ${
                                                isMonthActive
                                                    ? 'border-[#00C89699] bg-[#00C8961A] text-[#E8FFF7]'
                                                    : 'border-[#2D2D2D] bg-[#131313] text-[#C9C9C9] hover:border-[#3E3E3E]'
                                            }`}
                                        >
                                            <span className="block text-xs font-medium">{month.label}</span>
                                            <span className="font-mono text-[10px] text-[#757575]">{month.dayCount}d</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded-xl border border-[#2A2A2A] bg-[#121212] p-3">
                            <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-[#7A7A7A]">
                                <span className="font-mono">{rangeDatesAscending[0] || '--'}</span>
                                <span className="font-mono">{rangeDatesAscending[rangeDatesAscending.length - 1] || '--'}</span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={Math.max(0, rangeDatesAscending.length - 1)}
                                value={sliderIndex}
                                onChange={(event) => handleSliderChange(Number(event.target.value))}
                                className="day-range-slider w-full"
                                disabled={rangeDatesAscending.length <= 1}
                            />
                            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#8A8A8A]">
                                <span>Oldest</span>
                                <span className="font-medium text-[#DADADA]">{selectedInRange ? formatDayShort(selectedInRange) : '--'}</span>
                                <span>Newest</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;
