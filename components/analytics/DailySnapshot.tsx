import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DailyStats, formatDuration } from '../../types';
import { DailySnapshotData } from '../../types/analyticsTypes';
import { generateDailySnapshot, CHALLENGE_DEFINITIONS } from '../../services/analyticsService';
import html2canvas from 'html2canvas';
import { Camera, Image, Pin, BedDouble, Zap, Flame, Footprints, Clock, Trophy, Crown } from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import DateRangePicker from '../DateRangePicker';

interface DailySnapshotProps {
    profiles: Array<{ id: string; email?: string | null; challenges?: any[] }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

const DailySnapshot: React.FC<DailySnapshotProps> = ({ profiles, usersData }) => {
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const today = new Date();
        today.setDate(today.getDate() - 1);
        return today.toISOString().split('T')[0];
    });
    const [note, setNote] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [pinnedSnapshots, setPinnedSnapshots] = useState<DailySnapshotData[]>([]);
    const cardRef = useRef<HTMLDivElement>(null);

    const availableDates = useMemo(() => {
        const dates = new Set<string>();
        usersData.forEach(({ data }) => {
            data?.sleep?.forEach(s => dates.add(s.day));
            data?.readiness?.forEach(r => dates.add(r.day));
            data?.activity?.forEach(a => dates.add(a.day));
        });
        return [...dates].sort().reverse().slice(0, 60);
    }, [usersData]);

    useEffect(() => {
        if (!availableDates.length) return;
        if (!availableDates.includes(selectedDate)) {
            setSelectedDate(availableDates[0]);
        }
    }, [availableDates, selectedDate]);

    const activeDate = useMemo(
        () => (availableDates.includes(selectedDate) ? selectedDate : (availableDates[0] || '')),
        [availableDates, selectedDate]
    );

    const snapshot = useMemo((): DailySnapshotData | null => {
        const usersDataFormatted = profiles.map((profile, idx) => ({
            userId: profile.id,
            userName: (profile.email || 'User').split('@')[0],
            data: usersData[idx]?.data as DailyStats
        })).filter(u => u.data);

        if (usersDataFormatted.length === 0 || !activeDate) return null;

        const snap = generateDailySnapshot(activeDate, usersDataFormatted);
        snap.note = note || undefined;
        return snap;
    }, [activeDate, note, profiles, usersData]);

    const formattedSelectedDate = useMemo(() => {
        if (!activeDate) return 'No date selected';
        return new Date(activeDate + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    }, [activeDate]);

    const rankedUsers = useMemo(() => {
        if (!snapshot) return [];
        return [...snapshot.users].sort((a, b) => b.average - a.average);
    }, [snapshot]);

    const topPerformer = rankedUsers[0];

    const handleExport = async () => {
        if (!cardRef.current) return;

        setIsExporting(true);
        try {
            const exportScale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
            const canvas = await html2canvas(cardRef.current, {
                backgroundColor: '#05070d',
                scale: exportScale,
                logging: false,
                useCORS: true
            });

            const link = document.createElement('a');
            link.download = `daily-snapshot-${activeDate || 'snapshot'}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    const handlePin = () => {
        if (!snapshot) return;

        const exists = pinnedSnapshots.some(s => s.date === snapshot.date);
        if (exists) {
            setPinnedSnapshots(pinnedSnapshots.filter(s => s.date !== snapshot.date));
        } else {
            setPinnedSnapshots([{ ...snapshot, isPinned: true }, ...pinnedSnapshots].slice(0, 10));
        }
    };

    const isPinned = activeDate ? pinnedSnapshots.some(s => s.date === activeDate) : false;

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'sleep': return <BedDouble className="w-3 h-3" />;
            case 'readiness': return <Zap className="w-3 h-3" />;
            case 'activity': return <Flame className="w-3 h-3" />;
            case 'steps': return <Footprints className="w-3 h-3" />;
            default: return <Trophy className="w-3 h-3" />;
        }
    };

    if (usersData.every(u => !u.data)) {
        return (
            <div className="card p-8 text-center">
                <div className="flex justify-center mb-4">
                    <Camera className="w-12 h-12 text-[var(--text-muted)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No Data Available</h3>
                <p className="text-[var(--text-muted)] text-sm">
                    Sync your data to create shareable daily snapshots.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h3 className="section-header mb-0">Daily Snapshot</h3>
                        <InfoTooltip
                            title="Daily Snapshot"
                            description="A shareable card summarizing the day's performance for all users. Perfect for sharing progress or friendly competition."
                            calculation="Aggregates sleep, readiness, and activity scores. Highlights are automatically awarded to the user with the highest score in each category."
                        />
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                        Create shareable daily comparison cards
                    </p>
                </div>
                <DateRangePicker
                    mode="date"
                    dates={availableDates}
                    selectedDate={activeDate}
                    onSelectDate={setSelectedDate}
                    showStepper
                    className="w-full lg:w-auto lg:shrink-0"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Snapshot Card (Exportable) */}
                <div>
                    <div
                        ref={cardRef}
                        className="daily-snapshot-export"
                    >
                        <div className="daily-snapshot-export__glow daily-snapshot-export__glow--top" />
                        <div className="daily-snapshot-export__glow daily-snapshot-export__glow--bottom" />
                        <div className="daily-snapshot-export__mesh" />
                        <div className="daily-snapshot-export__content">
                            <div className="daily-snapshot-export__header">
                                <div>
                                    <p className="daily-snapshot-export__eyebrow">
                                        Daily Snapshot
                                    </p>
                                    <h4 className="daily-snapshot-export__date">
                                        {formattedSelectedDate}
                                    </h4>
                                </div>
                                <div className="daily-snapshot-export__mark" aria-hidden>
                                    <span />
                                    <span />
                                    <span />
                                </div>
                            </div>

                            {/* User Scores */}
                            {snapshot && (
                                <div className="daily-snapshot-export__rows">
                                    {rankedUsers.map((user, idx) => {
                                        const profile = profiles.find(p => p.id === user.userId);
                                        const activeChallenge = profile?.challenges?.find((c: any) => c.status === 'active');
                                        const challengeDefinition = activeChallenge
                                            ? CHALLENGE_DEFINITIONS.find(d => d.id === activeChallenge.challengeId)
                                            : undefined;
                                        const hitTarget = Boolean(activeChallenge?.history?.[activeDate]);

                                        return (
                                            <div
                                                key={user.userId}
                                                className={`daily-snapshot-export__row ${idx === 0 ? 'is-leading' : ''}`}
                                            >
                                                <div className="daily-snapshot-export__rank">{idx + 1}</div>
                                                <div className="daily-snapshot-export__identity">
                                                    <h5 className="daily-snapshot-export__name">{user.userName}</h5>
                                                    <div className="daily-snapshot-export__metrics">
                                                        <span className="daily-snapshot-export__metric daily-snapshot-export__metric--sleep">
                                                            <BedDouble className="w-3 h-3" /> {user.sleep}
                                                        </span>
                                                        <span className="daily-snapshot-export__metric daily-snapshot-export__metric--readiness">
                                                            <Zap className="w-3 h-3" /> {user.readiness}
                                                        </span>
                                                        <span className="daily-snapshot-export__metric daily-snapshot-export__metric--activity">
                                                            <Flame className="w-3 h-3" /> {user.activity}
                                                        </span>
                                                    </div>

                                                    {challengeDefinition && (
                                                        <div className="daily-snapshot-export__challenge">
                                                            <Crown className="w-3 h-3 text-yellow-400" />
                                                            <span>{challengeDefinition.name}</span>
                                                            <span className={hitTarget ? 'text-green-300' : 'text-[var(--text-secondary)]'}>
                                                                {hitTarget ? 'target hit' : `day ${activeChallenge.progress + 1}`}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="daily-snapshot-export__avg">
                                                    <p className="daily-snapshot-export__avg-value">{user.average}</p>
                                                    <p className="daily-snapshot-export__avg-label">avg</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Highlights */}
                            {snapshot && snapshot.highlights.length > 0 && (
                                <div className="daily-snapshot-export__highlights">
                                    {snapshot.highlights.slice(0, 4).map((highlight, idx) => (
                                        <span
                                            key={idx}
                                            className={`daily-snapshot-export__highlight ${highlight.type === 'winner' ? 'is-winner' : ''}`}
                                        >
                                            {getCategoryIcon(highlight.category)}
                                            {highlight.description}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Note */}
                            {note && (
                                <div className="daily-snapshot-export__note">
                                    <p>"{note}"</p>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="daily-snapshot-export__footer">
                                <span>
                                    {topPerformer
                                        ? `${topPerformer.userName} leads with ${topPerformer.average}`
                                        : 'Daily community leaderboard'}
                                </span>
                                <span>oura-community.app</span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
                        >
                            {isExporting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    <Image className="w-5 h-5" />
                                    Export as PNG
                                </>
                            )}
                        </button>
                        <button
                            onClick={handlePin}
                            className={`px-4 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${isPinned
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                : 'btn-secondary'
                                }`}
                        >
                            <Pin className={`w-4 h-4 ${isPinned ? 'fill-current' : ''}`} />
                            {isPinned ? 'Pinned' : 'Pin'}
                        </button>
                    </div>
                </div>

                {/* Note Input & Preview Stats */}
                <div className="space-y-4">
                    {/* Quick Note */}
                    <div className="card p-4">
                        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                            Add a Note (Optional)
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="e.g., 'Tough workout today!' or 'Best sleep in weeks!'"
                            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
                            rows={2}
                            maxLength={100}
                        />
                        <p className="text-xs text-[var(--text-muted)] mt-1 text-right">
                            {note.length}/100
                        </p>
                    </div>

                    {/* Detailed Stats */}
                    {snapshot && (
                        <div className="card p-4">
                            <h4 className="section-header mb-4">Detailed Breakdown</h4>
                            <div className="space-y-3">
                                {snapshot.users.map((user, idx) => (
                                    <div key={user.userId} className="space-y-2">
                                        <h5 className="font-medium text-[var(--text-primary)] flex items-center gap-2">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: idx === 0 ? '#00C896' : '#A855F7' }}
                                            />
                                            {user.userName}
                                        </h5>
                                        <div className="grid grid-cols-3 gap-2 text-sm">
                                            <div className="bg-[var(--bg-elevated)] rounded p-2">
                                                <p className="text-xs text-[var(--text-muted)]">Sleep</p>
                                                <p className="font-mono font-medium text-blue-400">{user.sleep}</p>
                                            </div>
                                            <div className="bg-[var(--bg-elevated)] rounded p-2">
                                                <p className="text-xs text-[var(--text-muted)]">Readiness</p>
                                                <p className="font-mono font-medium text-green-400">{user.readiness}</p>
                                            </div>
                                            <div className="bg-[var(--bg-elevated)] rounded p-2">
                                                <p className="text-xs text-[var(--text-muted)]">Activity</p>
                                                <p className="font-mono font-medium text-amber-400">{user.activity}</p>
                                            </div>
                                        </div>
                                        {user.steps != null && (
                                            <div className="flex gap-4 text-xs text-[var(--text-muted)]">
                                                <span className="flex items-center gap-1">
                                                    <Footprints className="w-3 h-3" /> {user.steps.toLocaleString()} steps
                                                </span>
                                                {user.sleepDuration != null && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" /> {formatDuration(user.sleepDuration)} sleep
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Pinned Highlight Reel */}
            {pinnedSnapshots.length > 0 && (
                <div>
                    <h4 className="section-header flex items-center gap-2">
                        <Pin className="w-5 h-5 text-yellow-400" /> Highlight Reel
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {pinnedSnapshots.map(snap => (
                            <button
                                key={snap.date}
                                onClick={() => setSelectedDate(snap.date)}
                                className={`card p-3 text-left hover:border-[var(--accent)]/50 transition-all ${activeDate === snap.date ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5' : ''
                                    }`}
                            >
                                <p className="text-xs text-[var(--text-muted)]">
                                    {new Date(snap.date + 'T12:00:00').toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric'
                                    })}
                                </p>
                                <div className="flex items-baseline gap-1 mt-1">
                                    {snap.users.slice(0, 2).map((u, idx) => (
                                        <span
                                            key={u.userId}
                                            className="text-lg font-bold font-mono"
                                            style={{ color: idx === 0 ? '#00C896' : '#A855F7' }}
                                        >
                                            {u.average}
                                        </span>
                                    ))}
                                </div>
                                {snap.note && (
                                    <p className="text-[10px] text-[var(--text-muted)] mt-1 truncate">
                                        {snap.note}
                                    </p>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DailySnapshot;
