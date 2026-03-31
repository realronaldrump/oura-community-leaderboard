import React, { useState } from 'react';
import { useUser } from '../../contexts/UserContext';
import { CHALLENGE_DEFINITIONS } from '../../services/analyticsService';
import { ChallengeDefinition, ChallengeType } from '../../types/analyticsTypes';
import { Crown, Zap, Footprints, Moon, Play, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { formatISODateForDisplay } from '../../utils/date';
import { getProfileLocalISODate, getProfileRelativeISODate } from '../../utils/profileTemporal';

const ChallengeManager: React.FC = () => {
    const { activeProfile, updateProfile } = useUser();
    const [isJoining, setIsJoining] = useState<string | null>(null);

    if (!activeProfile) return null;

    // Use a safe accessor for challenges to avoid type issues if not yet defined
    // @ts-ignore
    const userChallenges = (activeProfile.challenges || []) as Array<{
        id: string;
        challengeId: string;
        userId: string;
        startDate: string;
        endDate: string;
        status: 'active' | 'completed' | 'failed';
        progress: number;
        history: Record<string, boolean>;
    }>;

    const activeChallenges = userChallenges.filter(c => c.status === 'active');
    const pastChallenges = userChallenges.filter(c => c.status !== 'active');

    const handleJoin = async (challengeDef: ChallengeDefinition) => {
        setIsJoining(challengeDef.id);
        try {
            const startDate = getProfileLocalISODate(activeProfile);
            const endDate = getProfileRelativeISODate(activeProfile, challengeDef.durationDays - 1);

            const newChallenge = {
                id: crypto.randomUUID(),
                challengeId: challengeDef.id,
                userId: activeProfile.id,
                startDate,
                endDate,
                status: 'active' as const,
                progress: 0,
                history: {}
            };

            const updatedChallenges = [...userChallenges, newChallenge];
            await updateProfile({ challenges: updatedChallenges } as any);
        } catch (error) {
            console.error("Failed to join challenge", error);
        } finally {
            setIsJoining(null);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'sleep_consistency': return <Crown className="w-5 h-5 text-[#D4B87B]" />;
            case 'readiness_streak': return <Zap className="w-5 h-5 text-[#7BC4A0]" />;
            case 'step_goal': return <Footprints className="w-5 h-5 text-[#7BA8D4]" />;
            case 'early_bedtime': return <Moon className="w-5 h-5 text-[#A08BBE]" />;
            default: return <Crown className="w-5 h-5" />;
        }
    };

    return (
        <div className="space-y-8">
            {/* Active Challenges */}
            <div>
                <h3 className="section-header flex items-center gap-2">
                    <Zap className="w-5 h-5 text-[var(--accent)]" />
                    Active Challenges
                </h3>
                {activeChallenges.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-[var(--border-subtle)] rounded-xl bg-[var(--bg-card)]">
                        <p className="text-[var(--text-muted)]">No active challenges. Start one below!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeChallenges.map(challenge => {
                            const def = CHALLENGE_DEFINITIONS.find(d => d.id === challenge.challengeId);
                            if (!def) return null;
                            const progressPercent = (challenge.progress / def.durationDays) * 100;

                            return (
                                <div key={challenge.id} className="card p-4 border-l-4 border-l-[var(--accent)]">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            {getIcon(def.type)}
                                            <h4 className="font-bold text-[var(--text-primary)]">{def.name}</h4>
                                        </div>
                                        <span className="text-xs font-mono bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-1 rounded">
                                            Day {challenge.progress + 1}/{def.durationDays}
                                        </span>
                                    </div>
                                    <p className="text-sm text-[var(--text-muted)] mb-3">{def.description}</p>

                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-[var(--text-muted)]">
                                            <span>Progress</span>
                                            <span>{Math.round(progressPercent)}%</span>
                                        </div>
                                        <div className="w-full bg-[var(--bg-elevated)] h-2 rounded-full overflow-hidden">
                                            <div
                                                className="bg-[var(--accent)] h-full transition-all duration-500"
                                                style={{ width: `${progressPercent}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Available Challenges */}
            <div>
                <h3 className="section-header flex items-center gap-2">
                    <Crown className="w-5 h-5 text-[#D4B87B]" />
                    Available Challenges
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {CHALLENGE_DEFINITIONS.map(def => {
                        const isActive = activeChallenges.some(c => c.challengeId === def.id);
                        return (
                            <div key={def.id} className="card p-4 hover:bg-[var(--bg-hover)] transition-all">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 rounded-lg bg-[var(--bg-elevated)]">
                                        {getIcon(def.type)}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-[var(--text-primary)] text-sm">{def.name}</h4>
                                        <p className="text-xs text-[var(--text-muted)]">{def.durationDays} Days</p>
                                    </div>
                                </div>
                                <p className="text-sm text-[var(--text-secondary)] mb-4 min-h-[40px]">
                                    {def.description}
                                </p>
                                <button
                                    onClick={() => handleJoin(def)}
                                    disabled={isActive || isJoining === def.id}
                                    className={`w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${isActive
                                            ? 'bg-[#7BC4A0]/20 text-[#7BC4A0] cursor-default'
                                            : 'btn-primary'
                                        }`}
                                >
                                    {isActive ? (
                                        <>
                                            <CheckCircle className="w-4 h-4" /> Active
                                        </>
                                    ) : isJoining === def.id ? (
                                        <span className="animate-pulse">Joining...</span>
                                    ) : (
                                        <>
                                            <Play className="w-4 h-4" /> Start Challenge
                                        </>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Past Challenges History */}
            {pastChallenges.length > 0 && (
                <div>
                    <h3 className="section-header flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-[#C8C2BB]" />
                        History
                    </h3>
                    <div className="space-y-2">
                        {pastChallenges.map(c => {
                            const def = CHALLENGE_DEFINITIONS.find(d => d.id === c.challengeId);
                            return (
                                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                                    <div className="flex items-center gap-3">
                                        {c.status === 'completed'
                                            ? <CheckCircle className="w-5 h-5 text-[#7BC4A0]" />
                                            : <XCircle className="w-5 h-5 text-[#D4897B]" />
                                        }
                                        <div>
                                            <p className="font-medium text-[var(--text-primary)]">{def?.name || 'Unknown Challenge'}</p>
                                            <p className="text-xs text-[var(--text-muted)]">
                                                {formatISODateForDisplay(c.startDate)} - {formatISODateForDisplay(c.endDate)}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${c.status === 'completed' ? 'bg-[#7BC4A0]/10 text-[#7BC4A0]' : 'bg-[#D4897B]/10 text-[#D4897B]'
                                        }`}>
                                        {c.status}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChallengeManager;
