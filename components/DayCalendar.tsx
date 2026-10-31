import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DataExclusionRange } from '../types';
import { formatISODateForDisplay, isISODateString, shiftLocalISODate } from '../utils/date';
import { DATA_EXCLUSION_SOURCES, getExclusionSourcesForDay } from '../utils/dataExclusions';

const monthName = (month: string) => formatISODateForDisplay(`${month}-01`, 'en-US', { month: 'long', year: 'numeric' });
const adjacentMonth = (month: string, delta: number) => {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    return date.toISOString().slice(0, 7);
};

/** A date is a tap target, with recent-day shortcuts and visible exclusion markers. */
export default function DayCalendar({ selectedDay, today, onSelect, ranges = [] }: {
    selectedDay: string;
    today: string;
    onSelect: (day: string) => void;
    ranges?: DataExclusionRange[];
}) {
    const selected = isISODateString(selectedDay) && selectedDay <= today ? selectedDay : today;
    const [month, setMonth] = useState(selected.slice(0, 7));
    const focusDay = useRef<string | null>(null);
    const calendar = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (focusDay.current) {
            calendar.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay.current}"]`)?.focus();
            focusDay.current = null;
        }
    }, [month]);
    const firstDay = `${month}-01`;
    const firstWeekday = new Date(`${firstDay}T12:00:00Z`).getUTCDay();
    const dayCount = new Date(`${adjacentMonth(month, 1)}-01T12:00:00Z`).getTime() - new Date(`${firstDay}T12:00:00Z`).getTime();
    const selectRecent = (day: string) => { setMonth(day.slice(0, 7)); onSelect(day); };
    const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>, day: string) => {
        const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday }[event.key];
        if (delta == null) return;
        event.preventDefault();
        const target = shiftLocalISODate(day, delta);
        if (target > today || target < '2000-01-01') return;
        if (target.slice(0, 7) !== month) {
            focusDay.current = target;
            setMonth(target.slice(0, 7));
        } else calendar.current?.querySelector<HTMLButtonElement>(`[data-day="${target}"]`)?.focus();
    };
    return (
        <div className="day-calendar" ref={calendar}>
            <div className="day-calendar__shortcuts" role="group" aria-label="Recent days">
                <button type="button" onClick={() => selectRecent(today)}>Today</button>
                <button type="button" onClick={() => selectRecent(shiftLocalISODate(today, -1))}>Yesterday</button>
                <button type="button" onClick={() => selectRecent(shiftLocalISODate(today, -2))}>2 days ago</button>
            </div>
            <div className="day-calendar__heading">
                <button type="button" aria-label="Previous month" disabled={month <= '2000-01'} onClick={() => setMonth(adjacentMonth(month, -1))}><ChevronLeft size={20} /></button>
                <div>
                    <label><span className="sr-only">Month</span><select aria-label="Month" value={month.slice(5)} onChange={e => setMonth(`${month.slice(0, 4)}-${e.target.value}`)}>
                        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(value => <option key={value} value={value} disabled={`${month.slice(0, 4)}-${value}` > today.slice(0, 7)}>{formatISODateForDisplay(`2000-${value}-01`, 'en-US', { month: 'long' })}</option>)}
                    </select></label>
                    <label><span className="sr-only">Year</span><select aria-label="Year" value={month.slice(0, 4)} onChange={e => setMonth(`${e.target.value}-${e.target.value === today.slice(0, 4) && month.slice(5) > today.slice(5, 7) ? today.slice(5, 7) : month.slice(5)}`)}>
                        {Array.from({ length: Number(today.slice(0, 4)) - 1999 }, (_, i) => String(Number(today.slice(0, 4)) - i)).map(value => <option key={value}>{value}</option>)}
                    </select></label>
                </div>
                <button type="button" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(adjacentMonth(month, 1))}><ChevronRight size={20} /></button>
            </div>
            <div className="day-calendar__grid" role="group" aria-label={monthName(month)}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(weekday => <span className="day-calendar__weekday" key={weekday} aria-hidden="true">{weekday}</span>)}
                {Array.from({ length: firstWeekday }, (_, i) => <span key={`empty-${i}`} aria-hidden="true" />)}
                {Array.from({ length: Math.round(dayCount / 86_400_000) }, (_, i) => {
                    const day = `${month}-${String(i + 1).padStart(2, '0')}`;
                    const count = getExclusionSourcesForDay(day, ranges).length;
                    const ignored = count === DATA_EXCLUSION_SOURCES.length ? 'All data ignored' : count ? 'Some data ignored' : '';
                    return <button key={day} type="button" data-day={day} aria-pressed={selected === day} aria-current={day === today ? 'date' : undefined}
                        aria-label={`${formatISODateForDisplay(day, 'en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${ignored ? ` · ${ignored}` : ''}`}
                        disabled={day > today} onClick={() => onSelect(day)} onKeyDown={event => moveFocus(event, day)}>
                        {i + 1}{count > 0 && <i className={count === DATA_EXCLUSION_SOURCES.length ? 'is-whole-day' : ''} aria-hidden="true" />}
                    </button>;
                })}
            </div>
            {ranges.length > 0 && <p className="day-calendar__legend"><i aria-hidden="true" /> A dot marks a day with ignored data.</p>}
        </div>
    );
}
