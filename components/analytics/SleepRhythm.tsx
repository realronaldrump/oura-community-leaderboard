import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DailyStats, SleepSession, formatDuration } from '../../types';
import InfoTooltip from './InfoTooltip';
import { getProfileDisplayName } from '../../utils/profileName';
import { Moon, Sunrise, BedDouble, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
    extractIsoDayFromTimestamp,
    getLocalMinutesOfDayFromIso,
    formatClockTimeFromHourMinute,
    isISODateString,
} from '../../utils/temporal';
import { formatISODateForDisplay } from '../../utils/date';

// ============================================================================
// Sleep Rhythm — an immersive view of WHEN and HOW LONG a person sleeps.
//
// Three things, beautifully: bedtimes, wake times, and total sleep duration —
// as individual nights and as averages across preset windows.
// ============================================================================

interface SleepRhythmProps {
    profiles: Array<{ id: string; firstName?: string | null; lastName?: string | null; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

type Night = {
    day: string;
    bedMinutes: number;   // minutes-of-day (0..1440) of bedtime_start, local wall clock
    wakeMinutes: number;  // minutes-of-day (0..1440) of bedtime_end, local wall clock
    bedNorm: number;      // minutes from noon (0 = 12:00, 720 = midnight, 1440 = next noon)
    wakeNorm: number;     // minutes from noon (may exceed 1440 if it wraps past next noon)
    durationSec: number;  // total_sleep_duration
    efficiency: number | null;
};

const PRESETS = [
    { key: '7', label: '7 nights', short: '7D', days: 7 },
    { key: '30', label: '30 nights', short: '30D', days: 30 },
    { key: '90', label: '90 nights', short: '90D', days: 90 },
    { key: '365', label: '1 year', short: '1Y', days: 365 },
    { key: 'all', label: 'All time', short: 'All', days: null },
] as const;

type PresetKey = typeof PRESETS[number]['key'];

const MINUTES_PER_DAY = 1440;
const TWO_PI = Math.PI * 2;

// --- session selection ------------------------------------------------------

const getSessionDay = (session: SleepSession): string | undefined => {
    if (isISODateString(session.day)) return session.day;
    return extractIsoDayFromTimestamp(session.bedtime_end)
        || extractIsoDayFromTimestamp(session.bedtime_start)
        || undefined;
};

const pickPrimarySessionsByDay = (sessions: SleepSession[] | undefined): Night[] => {
    if (!sessions?.length) return [];
    const byDay = new Map<string, SleepSession[]>();
    sessions.forEach((session) => {
        if (session.type === 'deleted') return;
        const day = getSessionDay(session);
        if (!day) return;
        const list = byDay.get(day) || [];
        list.push(session);
        byDay.set(day, list);
    });

    const nights: Night[] = [];
    byDay.forEach((daySessions, day) => {
        const best = [...daySessions].sort((a, b) => {
            const bDur = b.total_sleep_duration ?? b.time_in_bed ?? 0;
            const aDur = a.total_sleep_duration ?? a.time_in_bed ?? 0;
            if (bDur !== aDur) return bDur - aDur;
            return new Date(b.bedtime_end || 0).getTime() - new Date(a.bedtime_end || 0).getTime();
        })[0];

        const bedMinutes = getLocalMinutesOfDayFromIso(best.bedtime_start);
        const wakeMinutes = getLocalMinutesOfDayFromIso(best.bedtime_end);
        const durationSec = best.total_sleep_duration ?? 0;
        if (bedMinutes == null || wakeMinutes == null || durationSec <= 0) return;

        const bedNorm = ((bedMinutes - 720) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        let wakeNorm = ((wakeMinutes - 720) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        if (wakeNorm < bedNorm) wakeNorm += MINUTES_PER_DAY; // crossed past the next noon

        nights.push({
            day,
            bedMinutes,
            wakeMinutes,
            bedNorm,
            wakeNorm,
            durationSec,
            efficiency: typeof best.efficiency === 'number' ? best.efficiency : null,
        });
    });

    return nights.sort((a, b) => a.day.localeCompare(b.day));
};

// --- circular statistics (for times that wrap around midnight) --------------

type CircularStat = { meanMinutes: number; spreadMinutes: number };

const circularStat = (minutes: number[]): CircularStat | null => {
    if (minutes.length === 0) return null;
    let sx = 0;
    let sy = 0;
    minutes.forEach((m) => {
        const angle = (m / MINUTES_PER_DAY) * TWO_PI;
        sx += Math.cos(angle);
        sy += Math.sin(angle);
    });
    const n = minutes.length;
    let mean = Math.atan2(sy / n, sx / n);
    if (mean < 0) mean += TWO_PI;
    const R = Math.min(1, Math.sqrt(sx * sx + sy * sy) / n);
    // circular standard deviation, converted back into minutes
    const spread = R > 0 ? Math.sqrt(-2 * Math.log(R)) / TWO_PI * MINUTES_PER_DAY : MINUTES_PER_DAY / 4;
    return {
        meanMinutes: (mean / TWO_PI) * MINUTES_PER_DAY,
        spreadMinutes: spread,
    };
};

// shortest signed difference between two clock minutes (b - a), range -720..720
const circularDelta = (a: number, b: number): number => {
    let d = (b - a) % MINUTES_PER_DAY;
    if (d > MINUTES_PER_DAY / 2) d -= MINUTES_PER_DAY;
    if (d < -MINUTES_PER_DAY / 2) d += MINUTES_PER_DAY;
    return d;
};

const mean = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;

// --- formatting -------------------------------------------------------------

const formatClockFromMinutes = (minutes: number): string => {
    const normalized = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const hour = Math.floor(normalized / 60);
    const minute = normalized % 60;
    return formatClockTimeFromHourMinute(hour, minute);
};

// compact axis label, always on the hour — e.g. "11 PM", "2 AM"
const formatClockHourLabel = (minutes: number): string => {
    const normalized = ((Math.round(minutes / 60) % 24) + 24) % 24;
    const ampm = normalized < 12 ? 'AM' : 'PM';
    const h12 = normalized % 12 === 0 ? 12 : normalized % 12;
    return `${h12} ${ampm}`;
};

const formatSpread = (minutes: number): string => {
    if (!Number.isFinite(minutes)) return '--';
    const rounded = Math.round(minutes);
    if (rounded >= 60) {
        const h = Math.floor(rounded / 60);
        const m = rounded % 60;
        return m > 0 ? `±${h}h ${m}m` : `±${h}h`;
    }
    return `±${rounded} min`;
};

const formatDurationShort = (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds / 60));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
};

const formatSignedMinutes = (minutes: number): string => {
    const rounded = Math.round(Math.abs(minutes));
    if (rounded >= 60) {
        const h = Math.floor(rounded / 60);
        const m = rounded % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${rounded} min`;
};

// --- duration → color (the visual heartbeat of the chart) -------------------

const durationColor = (seconds: number): string => {
    const hours = seconds / 3600;
    if (hours < 6) return '#C66F5F';      // short — warm red
    if (hours < 7) return '#D4A574';      // a little short — amber
    if (hours <= 9) return '#6B9E8A';     // middle duration band — accent green
    return '#7BA8D4';                      // long — calm blue
};

const DURATION_LEGEND = [
    { color: '#C66F5F', label: '< 6h' },
    { color: '#D4A574', label: '6–7h' },
    { color: '#6B9E8A', label: '7–9h' },
    { color: '#7BA8D4', label: '9h +' },
];

// --- SVG polar helpers ------------------------------------------------------

// angle measured clockwise from the top (12 o'clock). 0 = midnight at top.
const polarPoint = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
        x: cx + r * Math.sin(rad),
        y: cy - r * Math.cos(rad),
    };
};

const arcPath = (cx: number, cy: number, r: number, startDeg: number, endDeg: number): string => {
    let sweep = endDeg - startDeg;
    if (sweep <= 0) sweep += 360;
    const adjustedEnd = startDeg + sweep;
    const start = polarPoint(cx, cy, r, startDeg);
    const end = polarPoint(cx, cy, r, adjustedEnd);
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
};

// clock minutes (0..1440, 0 = midnight) → angle clockwise from top
const minutesToAngle = (minutes: number): number => (minutes / MINUTES_PER_DAY) * 360;

// ============================================================================
// Radial 24-hour dial — the immersive centerpiece
// ============================================================================

const RadialClock: React.FC<{
    nights: Night[];
    avgBed: CircularStat | null;
    avgWake: CircularStat | null;
    avgDurationSec: number | null;
}> = ({ nights, avgBed, avgWake, avgDurationSec }) => {
    const size = 260;
    const cx = size / 2;
    const cy = size / 2;
    const r = 96;

    const hourTicks = [
        { m: 0, label: '12a' },
        { m: 180, label: '3a' },
        { m: 360, label: '6a' },
        { m: 540, label: '9a' },
        { m: 720, label: '12p' },
        { m: 900, label: '3p' },
        { m: 1080, label: '6p' },
        { m: 1260, label: '9p' },
    ];

    // limit the density-cloud to a manageable number of recent nights
    const cloudNights = nights.slice(-180);

    const avgArc = (avgBed && avgWake)
        ? arcPath(cx, cy, r, minutesToAngle(avgBed.meanMinutes), minutesToAngle(avgWake.meanMinutes))
        : null;

    const bedPoint = avgBed ? polarPoint(cx, cy, r, minutesToAngle(avgBed.meanMinutes)) : null;
    const wakePoint = avgWake ? polarPoint(cx, cy, r, minutesToAngle(avgWake.meanMinutes)) : null;

    return (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[260px]" role="img" aria-label="Average sleep window on a 24-hour dial">
            <defs>
                <linearGradient id="sleepArcGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#A08BBE" />
                    <stop offset="55%" stopColor="#6B9E8A" />
                    <stop offset="100%" stopColor="#D4A574" />
                </linearGradient>
                <filter id="sleepArcGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* base ring */}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={14} />

            {/* hour ticks + labels */}
            {hourTicks.map((tick) => {
                const angle = minutesToAngle(tick.m);
                const inner = polarPoint(cx, cy, r - 9, angle);
                const outer = polarPoint(cx, cy, r + 9, angle);
                const labelPos = polarPoint(cx, cy, r + 22, angle);
                const isNoonMidnight = tick.m === 0 || tick.m === 720;
                return (
                    <g key={tick.m}>
                        <line
                            x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                            stroke={isNoonMidnight ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.12)'}
                            strokeWidth={isNoonMidnight ? 1.5 : 1}
                        />
                        <text
                            x={labelPos.x} y={labelPos.y}
                            textAnchor="middle" dominantBaseline="central"
                            fontSize={9.5}
                            fill={isNoonMidnight ? '#7A756E' : '#A8A29E'}
                            fontWeight={isNoonMidnight ? 600 : 400}
                        >
                            {tick.label}
                        </text>
                    </g>
                );
            })}

            {/* density cloud — every night faintly overlaid builds a band of habit */}
            {cloudNights.map((night) => {
                const startA = minutesToAngle(night.bedMinutes);
                const endA = minutesToAngle(night.wakeMinutes);
                return (
                    <path
                        key={night.day}
                        d={arcPath(cx, cy, r, startA, endA)}
                        fill="none"
                        stroke="#6B9E8A"
                        strokeWidth={3}
                        strokeLinecap="round"
                        opacity={0.10}
                    />
                );
            })}

            {/* the average sleep arc */}
            {avgArc && (
                <path
                    d={avgArc}
                    fill="none"
                    stroke="url(#sleepArcGradient)"
                    strokeWidth={12}
                    strokeLinecap="round"
                    filter="url(#sleepArcGlow)"
                />
            )}

            {/* bedtime + wake markers */}
            {bedPoint && (
                <g>
                    <circle cx={bedPoint.x} cy={bedPoint.y} r={6} fill="#A08BBE" stroke="#FFFFFF" strokeWidth={2.5} />
                </g>
            )}
            {wakePoint && (
                <g>
                    <circle cx={wakePoint.x} cy={wakePoint.y} r={6} fill="#D4A574" stroke="#FFFFFF" strokeWidth={2.5} />
                </g>
            )}

            {/* center readout */}
            <text x={cx} y={cy - 14} textAnchor="middle" fontSize={10} fill="#A8A29E" letterSpacing={0.5}>
                AVG ASLEEP
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize={26} fontWeight={700} fill="#2D2A26">
                {avgDurationSec != null ? formatDurationShort(avgDurationSec) : '--'}
            </text>
            {avgBed && avgWake && (
                <text x={cx} y={cy + 30} textAnchor="middle" fontSize={10} fill="#7A756E">
                    {formatClockFromMinutes(avgBed.meanMinutes)} → {formatClockFromMinutes(avgWake.meanMinutes)}
                </text>
            )}
        </svg>
    );
};

// ============================================================================
// Sleep raster — every night as a vertical band on a noon→noon time axis
// ============================================================================

type HoverState = { index: number; x: number } | null;

const SleepRaster: React.FC<{ nights: Night[] }> = ({ nights }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(680);
    const [hover, setHover] = useState<HoverState>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w) setWidth(Math.max(320, w));
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const height = 320;
    const padLeft = 54;
    const padRight = 14;
    const padTop = 14;
    const padBottom = 26;
    const plotW = Math.max(1, width - padLeft - padRight);
    const plotH = height - padTop - padBottom;

    const { domainMin, domainMax } = useMemo(() => {
        if (nights.length === 0) return { domainMin: 360, domainMax: 1320 };
        let lo = Infinity;
        let hi = -Infinity;
        nights.forEach((n) => {
            lo = Math.min(lo, n.bedNorm);
            hi = Math.max(hi, n.wakeNorm);
        });
        lo = Math.max(0, lo - 45);
        hi = Math.min(MINUTES_PER_DAY + 360, hi + 45);
        if (hi - lo < 240) hi = lo + 240;
        return { domainMin: lo, domainMax: hi };
    }, [nights]);

    const yFor = (norm: number) => padTop + ((norm - domainMin) / (domainMax - domainMin)) * plotH;

    const colWidth = plotW / Math.max(1, nights.length);
    const barWidth = Math.max(1.5, Math.min(26, colWidth * 0.74));

    // y-axis time ticks every 2h within the visible domain
    const yTicks = useMemo(() => {
        const ticks: Array<{ norm: number; label: string }> = [];
        const startTick = Math.ceil(domainMin / 120) * 120;
        for (let norm = startTick; norm <= domainMax; norm += 120) {
            const clockMinutes = ((norm + 720) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
            ticks.push({ norm, label: formatClockHourLabel(clockMinutes) });
        }
        return ticks;
    }, [domainMin, domainMax]);

    // x-axis date labels — a handful, evenly spaced
    const xLabels = useMemo(() => {
        if (nights.length === 0) return [];
        const maxLabels = Math.max(2, Math.min(7, Math.floor(plotW / 90)));
        const step = Math.max(1, Math.ceil(nights.length / maxLabels));
        const labels: Array<{ x: number; label: string }> = [];
        for (let i = 0; i < nights.length; i += step) {
            labels.push({
                x: padLeft + (i + 0.5) * colWidth,
                label: formatISODateForDisplay(nights[i].day, undefined, { month: 'short', day: 'numeric' }),
            });
        }
        return labels;
    }, [nights, colWidth, plotW]);

    const midnightNorm = 720;
    const showMidnight = midnightNorm >= domainMin && midnightNorm <= domainMax;

    const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const scaleX = width / rect.width;
        const localX = (e.clientX - rect.left) * scaleX;
        const idx = Math.floor((localX - padLeft) / colWidth);
        if (idx >= 0 && idx < nights.length) {
            setHover({ index: idx, x: padLeft + (idx + 0.5) * colWidth });
        } else {
            setHover(null);
        }
    };

    const hovered = hover ? nights[hover.index] : null;

    return (
        <div ref={containerRef} className="relative w-full">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full"
                style={{ height }}
                onMouseMove={handleMove}
                onMouseLeave={() => setHover(null)}
                role="img"
                aria-label="Nightly sleep windows"
            >
                {/* midnight reference band */}
                {showMidnight && (
                    <line
                        x1={padLeft} y1={yFor(midnightNorm)} x2={width - padRight} y2={yFor(midnightNorm)}
                        stroke="rgba(0,0,0,0.16)" strokeWidth={1} strokeDasharray="3 3"
                    />
                )}

                {/* y gridlines + labels */}
                {yTicks.map((tick) => (
                    <g key={tick.norm}>
                        <line
                            x1={padLeft} y1={yFor(tick.norm)} x2={width - padRight} y2={yFor(tick.norm)}
                            stroke="rgba(0,0,0,0.05)" strokeWidth={1}
                        />
                        <text
                            x={padLeft - 8} y={yFor(tick.norm)}
                            textAnchor="end" dominantBaseline="central"
                            fontSize={10} fill="#A8A29E"
                        >
                            {tick.label}
                        </text>
                    </g>
                ))}

                {/* hover column highlight */}
                {hover && (
                    <rect
                        x={hover.x - colWidth / 2} y={padTop}
                        width={colWidth} height={plotH}
                        fill="rgba(107,158,138,0.08)"
                    />
                )}

                {/* nightly bars */}
                {nights.map((night, i) => {
                    const x = padLeft + (i + 0.5) * colWidth - barWidth / 2;
                    const yTop = yFor(night.bedNorm);
                    const yBottom = yFor(night.wakeNorm);
                    const h = Math.max(2, yBottom - yTop);
                    const isHovered = hover?.index === i;
                    return (
                        <rect
                            key={night.day}
                            x={x} y={yTop}
                            width={barWidth} height={h}
                            rx={Math.min(barWidth / 2, 4)}
                            fill={durationColor(night.durationSec)}
                            opacity={hover && !isHovered ? 0.45 : 0.9}
                        />
                    );
                })}

                {/* x date labels */}
                {xLabels.map((label, idx) => (
                    <text
                        key={idx}
                        x={label.x} y={height - 8}
                        textAnchor="middle" fontSize={10} fill="#A8A29E"
                    >
                        {label.label}
                    </text>
                ))}
            </svg>

            {/* hover tooltip */}
            {hovered && (
                <div
                    className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-xl border border-line bg-surface-raised px-3 py-2 shadow-card"
                    style={{
                        left: `${(hover!.x / width) * 100}%`,
                        top: 6,
                    }}
                >
                    <div className="text-[11px] font-semibold text-ink whitespace-nowrap">
                        {formatISODateForDisplay(hovered.day, undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-secondary whitespace-nowrap">
                        <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-metric-insight" />{formatClockFromMinutes(hovered.bedMinutes)}</span>
                        <span className="flex items-center gap-1"><Sunrise className="w-3 h-3 text-[#D4A574]" />{formatClockFromMinutes(hovered.wakeMinutes)}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium whitespace-nowrap" style={{ color: durationColor(hovered.durationSec) }}>
                        {formatDuration(hovered.durationSec)} asleep{hovered.efficiency != null ? ` · ${hovered.efficiency}% eff` : ''}
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// Stat tile — bedtime / wake / duration with consistency + trend
// ============================================================================

const TrendPill: React.FC<{ deltaMinutes: number; suffix: string }> = ({ deltaMinutes, suffix }) => {
    const rounded = Math.round(deltaMinutes);
    if (Math.abs(rounded) < 3) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                <Minus className="w-3 h-3" /> steady
            </span>
        );
    }
    const later = rounded > 0;
    const Icon = later ? TrendingUp : TrendingDown;
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-secondary">
            <Icon className="w-3 h-3" />
            {formatSignedMinutes(deltaMinutes)} {suffix}
        </span>
    );
};

const StatTile: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    accent: string;
    consistency?: string;
    trend?: React.ReactNode;
}> = ({ icon, label, value, accent, consistency, trend }) => (
    <div className="rounded-2xl border border-line bg-[var(--bg-elevated)] p-4">
        <div className="flex items-center gap-2 mb-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}22`, color: accent }}>
                {icon}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</span>
        </div>
        <div className="text-2xl font-bold text-ink leading-none">{value}</div>
        <div className="mt-2 flex items-center justify-between gap-2">
            {consistency
                ? <span className="text-[11px] text-ink-secondary">{consistency} typical</span>
                : <span />}
            {trend}
        </div>
    </div>
);

// ============================================================================
// Main component
// ============================================================================

const computeAverages = (nights: Night[]) => {
    const bed = circularStat(nights.map((n) => n.bedMinutes));
    const wake = circularStat(nights.map((n) => n.wakeMinutes));
    const duration = mean(nights.map((n) => n.durationSec));
    return { bed, wake, duration };
};

const SleepRhythm: React.FC<SleepRhythmProps> = ({ profiles, usersData }) => {
    const [selectedProfileIdx, setSelectedProfileIdx] = useState(0);
    const [preset, setPreset] = useState<PresetKey>('30');

    const safeIdx = selectedProfileIdx < profiles.length ? selectedProfileIdx : 0;
    const allNights = useMemo(
        () => pickPrimarySessionsByDay(usersData[safeIdx]?.data?.session),
        [usersData, safeIdx],
    );

    const activePreset = PRESETS.find((p) => p.key === preset) || PRESETS[1];

    // current-window nights (most recent N)
    const windowNights = useMemo(() => {
        if (activePreset.days == null) return allNights;
        return allNights.slice(-activePreset.days);
    }, [allNights, activePreset]);

    // previous comparable window, for trend arrows
    const previousNights = useMemo(() => {
        if (activePreset.days == null) return [];
        const end = allNights.length - activePreset.days;
        if (end <= 0) return [];
        return allNights.slice(Math.max(0, end - activePreset.days), end);
    }, [allNights, activePreset]);

    const current = useMemo(() => computeAverages(windowNights), [windowNights]);
    const previous = useMemo(() => computeAverages(previousNights), [previousNights]);

    // averages across every preset, for the at-a-glance table
    const presetSummaries = useMemo(() => PRESETS.map((p) => {
        const subset = p.days == null ? allNights : allNights.slice(-p.days);
        const { bed, wake, duration } = computeAverages(subset);
        return { preset: p, count: subset.length, bed, wake, duration };
    }), [allNights]);

    const hasData = allNights.length > 0;
    const multiProfile = profiles.length > 1;

    const bedTrend = (current.bed && previous.bed)
        ? circularDelta(previous.bed.meanMinutes, current.bed.meanMinutes) : null;
    const wakeTrend = (current.wake && previous.wake)
        ? circularDelta(previous.wake.meanMinutes, current.wake.meanMinutes) : null;
    const durationTrend = (current.duration != null && previous.duration != null)
        ? (current.duration - previous.duration) / 60 : null;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h3 className="section-header mb-0">Sleep Rhythm</h3>
                        <InfoTooltip
                            title="Sleep Rhythm"
                            description="Your bedtimes, wake times, and total sleep — for each night and averaged across preset windows."
                            calculation="Averages for times use circular statistics so they behave correctly around midnight. 'Typical' shows how much your timing varies night-to-night. Trend arrows compare this window to the one immediately before it."
                        />
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                        When you sleep, and for how long
                    </p>
                </div>
                {multiProfile && (
                    <select
                        value={safeIdx}
                        onChange={(e) => setSelectedProfileIdx(Number(e.target.value))}
                        aria-label="Sleep-rhythm profile"
                        className="min-h-11 rounded-lg border border-[rgba(0,0,0,0.1)] bg-[var(--bg-elevated)] px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[#6B9E8A]/30"
                    >
                        {profiles.map((p, idx) => (
                            <option key={p.id} value={idx}>{getProfileDisplayName(p)}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Timeframe segmented control */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 hide-scrollbar" role="group" aria-label="Sleep-rhythm timeframe">
                {PRESETS.map((p) => (
                    <button
                        key={p.key}
                        type="button"
                        aria-pressed={preset === p.key}
                        onClick={() => setPreset(p.key)}
                        className={`min-h-11 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                            preset === p.key
                                ? 'bg-accent text-white shadow-sm'
                                : 'text-ink-muted hover:text-ink-secondary bg-[var(--bg-elevated)] hover:bg-surface-subtle'
                        }`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {!hasData ? (
                <div className="card p-10 text-center">
                    <div className="flex justify-center mb-4">
                        <BedDouble className="w-12 h-12 text-[var(--text-muted)]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No sleep data yet</h3>
                    <p className="text-[var(--text-muted)] text-sm">
                        More Oura history will appear here automatically.
                    </p>
                </div>
            ) : (
                <>
                    {/* Hero: dial + averages */}
                    <div className="card p-5 sm:p-6">
                        <div className="grid gap-6 lg:grid-cols-[260px_1fr] lg:items-center">
                            <div className="flex justify-center">
                                <RadialClock
                                    nights={windowNights}
                                    avgBed={current.bed}
                                    avgWake={current.wake}
                                    avgDurationSec={current.duration}
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <StatTile
                                    icon={<Moon className="w-3.5 h-3.5" />}
                                    label="Avg bedtime"
                                    accent="#A08BBE"
                                    value={current.bed ? formatClockFromMinutes(current.bed.meanMinutes) : '--'}
                                    consistency={current.bed ? formatSpread(current.bed.spreadMinutes) : undefined}
                                    trend={bedTrend != null
                                        ? <TrendPill deltaMinutes={bedTrend} suffix={bedTrend > 0 ? 'later' : 'earlier'} />
                                        : undefined}
                                />
                                <StatTile
                                    icon={<Sunrise className="w-3.5 h-3.5" />}
                                    label="Avg wake"
                                    accent="#D4A574"
                                    value={current.wake ? formatClockFromMinutes(current.wake.meanMinutes) : '--'}
                                    consistency={current.wake ? formatSpread(current.wake.spreadMinutes) : undefined}
                                    trend={wakeTrend != null
                                        ? <TrendPill deltaMinutes={wakeTrend} suffix={wakeTrend > 0 ? 'later' : 'earlier'} />
                                        : undefined}
                                />
                                <StatTile
                                    icon={<BedDouble className="w-3.5 h-3.5" />}
                                    label="Avg duration"
                                    accent="#6B9E8A"
                                    value={current.duration != null ? formatDurationShort(current.duration) : '--'}
                                    consistency={`${windowNights.length} ${windowNights.length === 1 ? 'night' : 'nights'}`}
                                    trend={durationTrend != null
                                        ? <TrendPill deltaMinutes={durationTrend} suffix={durationTrend > 0 ? 'more' : 'less'} />
                                        : undefined}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Raster */}
                    <div className="card p-5 sm:p-6">
                        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <h4 className="text-sm font-bold text-ink">Night by night</h4>
                                <p className="text-xs text-[var(--text-muted)]">Each bar is one night, noon to noon · color shows duration</p>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                {DURATION_LEGEND.map((item) => (
                                    <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary">
                                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                        {item.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <SleepRaster nights={windowNights} />
                    </div>

                    {/* Averages across every preset window */}
                    <div className="card p-5 sm:p-6">
                        <h4 className="text-sm font-bold text-ink mb-3">Averages by window</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[11px] uppercase tracking-wide text-ink-muted">
                                        <th className="text-left font-medium pb-2">Window</th>
                                        <th className="text-center font-medium pb-2">Nights</th>
                                        <th className="text-center font-medium pb-2">Bedtime</th>
                                        <th className="text-center font-medium pb-2">Wake</th>
                                        <th className="text-right font-medium pb-2">Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {presetSummaries.map(({ preset: p, count, bed, wake, duration }) => {
                                        const isActive = p.key === preset;
                                        return (
                                            <tr
                                                key={p.key}
                                                role="button"
                                                tabIndex={0}
                                                aria-pressed={isActive}
                                                onClick={() => setPreset(p.key)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        setPreset(p.key);
                                                    }
                                                }}
                                                className={`cursor-pointer border-t border-[rgba(0,0,0,0.05)] transition-colors ${
                                                    isActive ? 'bg-accent/8' : 'hover:bg-[var(--bg-hover)]'
                                                }`}
                                            >
                                                <td className="py-2.5 text-left font-medium text-ink">
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accent' : 'bg-transparent'}`} />
                                                        {p.label}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 text-center text-ink-secondary font-mono">{count}</td>
                                                <td className="py-2.5 text-center text-ink font-mono">{bed ? formatClockFromMinutes(bed.meanMinutes) : '--'}</td>
                                                <td className="py-2.5 text-center text-ink font-mono">{wake ? formatClockFromMinutes(wake.meanMinutes) : '--'}</td>
                                                <td className="py-2.5 text-right font-mono font-medium" style={{ color: duration != null ? durationColor(duration) : '#A8A29E' }}>
                                                    {duration != null ? formatDurationShort(duration) : '--'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default SleepRhythm;
