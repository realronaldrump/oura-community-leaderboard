import React, { useMemo, useState, useRef } from 'react';
import { DailyStats, formatDuration } from '../../types';
import { DailySnapshotData } from '../../types/analyticsTypes';
import { generateDailySnapshot } from '../../services/analyticsService';
import html2canvas from 'html2canvas';
import { Camera, ChevronLeft, ChevronRight, Image, Pin, BedDouble, Zap, Flame, Footprints, Clock, Trophy, BarChart2 } from 'lucide-react';

interface DailySnapshotProps {
    profiles: Array<{ id: string; email?: string | null }>;
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

    const snapshot = useMemo((): DailySnapshotData | null => {
        const usersDataFormatted = profiles.map((profile, idx) => ({
            userId: profile.id,
            userName: (profile.email || 'User').split('@')[0],
            data: usersData[idx]?.data as DailyStats
        })).filter(u => u.data);

        if (usersDataFormatted.length === 0) return null;

        const snap = generateDailySnapshot(selectedDate, usersDataFormatted);
        snap.note = note || undefined;
        return snap;
    }, [profiles, usersData, selectedDate, note]);

    const handleExport = async () => {
        if (!cardRef.current) return;

        setIsExporting(true);
        try {
            const canvas = await html2canvas(cardRef.current, {
                backgroundColor: '#0C0C0C',
                scale: 2,
                logging: false
            });

            const link = document.createElement('a');
            link.download = `daily-snapshot-${selectedDate}.png`;
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

    const isPinned = pinnedSnapshots.some(s => s.date === selectedDate);

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
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                    <h3 className="section-header mb-0">Daily Snapshot</h3>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Create shareable daily comparison cards
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const idx = availableDates.indexOf(selectedDate);
                            if (idx < availableDates.length - 1) {
                                setSelectedDate(availableDates[idx + 1]);
                            }
                        }}
                        disabled={availableDates.indexOf(selectedDate) >= availableDates.length - 1}
                        className="p-2 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-30 transition-all"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    >
                        {availableDates.map(date => (
                            <option key={date} value={date}>
                                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric'
                                })}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => {
                            const idx = availableDates.indexOf(selectedDate);
                            if (idx > 0) {
                                setSelectedDate(availableDates[idx - 1]);
                            }
                        }}
                        disabled={availableDates.indexOf(selectedDate) <= 0}
                        className="p-2 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-30 transition-all"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Snapshot Card (Exportable) */}
                <div>
                    <div
                        ref={cardRef}
                        className="card p-6 relative overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, #0C0C0C 0%, #1a1a2e 100%)' }}
                    >
                        {/* Decorative elements */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/10 rounded-full blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl" />

                        {/* Header */}
                        <div className="relative mb-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-[var(--accent)] uppercase tracking-wider font-medium">
                                        Daily Snapshot
                                    </p>
                                    <h4 className="text-xl font-bold text-[var(--text-primary)]">
                                        {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                                            weekday: 'long',
                                            month: 'long',
                                            day: 'numeric',
                                            year: 'numeric'
                                        })}
                                    </h4>
                                </div>
                                <BarChart2 className="w-10 h-10 text-[var(--accent)]" />
                            </div>
                        </div>

                        {/* User Scores */}
                        {snapshot && (
                            <div className="relative space-y-4 mb-6">
                                {snapshot.users.map((user, idx) => (
                                    <div
                                        key={user.userId}
                                        className="flex items-center gap-4 p-3 rounded-lg bg-white/5"
                                    >
                                        <div
                                            className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
                                            style={{
                                                background: idx === 0
                                                    ? 'linear-gradient(135deg, #00C896, #00A896)'
                                                    : 'linear-gradient(135deg, #A855F7, #7C3AED)'
                                            }}
                                        >
                                            {user.userName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1">
                                            <h5 className="font-semibold text-[var(--text-primary)]">
                                                {user.userName}
                                            </h5>
                                            <div className="flex gap-4 text-sm mt-1">
                                                <span className="text-blue-400 flex items-center gap-1">
                                                    <BedDouble className="w-3 h-3" /> {user.sleep}
                                                </span>
                                                <span className="text-green-400 flex items-center gap-1">
                                                    <Zap className="w-3 h-3" /> {user.readiness}
                                                </span>
                                                <span className="text-amber-400 flex items-center gap-1">
                                                    <Flame className="w-3 h-3" /> {user.activity}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold font-mono text-[var(--text-primary)]">
                                                {user.average}
                                            </p>
                                            <p className="text-xs text-[var(--text-muted)]">avg</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Highlights */}
                        {snapshot && snapshot.highlights.length > 0 && (
                            <div className="relative mb-6">
                                <div className="flex flex-wrap gap-2">
                                    {snapshot.highlights.map((highlight, idx) => (
                                        <span
                                            key={idx}
                                            className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${highlight.type === 'winner'
                                                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                                                : 'bg-white/10 text-[var(--text-secondary)]'
                                                }`}
                                        >
                                            {getCategoryIcon(highlight.category)} {highlight.description}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Note */}
                        {note && (
                            <div className="relative bg-white/5 rounded-lg p-3 mb-4">
                                <p className="text-sm text-[var(--text-secondary)] italic">
                                    "{note}"
                                </p>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="relative flex items-center justify-between text-xs text-[var(--text-muted)] pt-4 border-t border-white/10">
                            <span>Davis Watches You Sleep</span>
                            <span>oura-community.app</span>
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
                                className={`card p-3 text-left hover:border-[var(--accent)]/50 transition-all ${selectedDate === snap.date ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5' : ''
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
