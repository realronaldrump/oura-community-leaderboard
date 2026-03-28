import React from 'react';
import { X, Award, Flame, Heart, Moon, Zap, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { IOSModal, IOSButton, IOSListItem } from './ios';
import { LeaderboardEntry, formatDuration } from '../types';

interface LeaderboardUserDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: LeaderboardEntry | null;
}

const LeaderboardUserDetailModal: React.FC<LeaderboardUserDetailModalProps> = ({ isOpen, onClose, user }) => {
    if (!isOpen || !user) return null;

    const getScoreCategory = (score: number) => {
        if (score >= 85) return { label: 'Excellent', color: '#7BC4A0' };
        if (score >= 70) return { label: 'Great', color: '#7BA8D4' };
        if (score >= 55) return { label: 'Good', color: '#D4A574' };
        if (score >= 40) return { label: 'Fair', color: '#D4B87B' };
        return { label: 'Needs Improvement', color: '#D4897B' };
    };

    const readinessCategory = getScoreCategory(user.readiness);
    const sleepCategory = getScoreCategory(user.sleep);
    const activityCategory = getScoreCategory(user.activity);
    const averageCategory = getScoreCategory(user.average);

    return (
        <IOSModal isOpen={isOpen} onClose={onClose} title={`${user.name.split('@')[0]}'s Stats`}>
            <div className="space-y-6 overflow-y-auto ios-scroll max-h-[70vh]">
                {/* Average Score */}
                <div className="flex items-center justify-between p-6 bg-[#F2EDE8] rounded-xl border border-[rgba(0,0,0,0.06)]">
                    <div className="flex items-center gap-4">
                        <div className="text-5xl font-bold" style={{ color: averageCategory.color }}>
                            {user.average}
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Overall Average</p>
                            <p className="text-xs font-medium" style={{ color: averageCategory.color }}>
                                {averageCategory.label}
                            </p>
                        </div>
                    </div>
                    <Award className="w-16 h-16 text-[#FFD700]" />
                </div>

                {/* Score Breakdown */}
                <div className="grid grid-cols-3 gap-4">
                    <IOSListItem
                        title="Readiness"
                        subtitle={`${user.readiness} - ${readinessCategory.label}`}
                        icon={<div className="text-[#7BC4A0]"><Heart className="w-5 h-5" /></div>}
                        rightElement={
                            <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: readinessCategory.color }} />
                        }
                    />
                    <IOSListItem
                        title="Sleep"
                        subtitle={`${user.sleep} - ${sleepCategory.label}`}
                        icon={<div className="text-[#7BA8D4]"><Moon className="w-5 h-5" /></div>}
                        rightElement={
                            <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: sleepCategory.color }} />
                        }
                    />
                    <IOSListItem
                        title="Activity"
                        subtitle={`${user.activity} - ${activityCategory.label}`}
                        icon={<div className="text-[#D4A574]"><Zap className="w-5 h-5" /></div>}
                        rightElement={
                            <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: activityCategory.color }} />
                        }
                    />
                </div>

                {/* Detailed Metrics */}
                <div>
                    <h4 className="text-xs text-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Detailed Metrics
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                        {user.steps !== undefined && (
                            <IOSListItem
                                title="Steps"
                                subtitle={user.steps?.toLocaleString()}
                                icon={<div className="text-[#7BA8D4]"><Activity className="w-4 h-4" /></div>}
                            />
                        )}
                        {user.activeCalories !== undefined && (
                            <IOSListItem
                                title="Active Calories"
                                subtitle={`${user.activeCalories?.toLocaleString()} kcal`}
                                icon={<div className="text-[#D4A574]"><Flame className="w-4 h-4" /></div>}
                            />
                        )}
                        {user.sleepDuration !== undefined && (
                            <IOSListItem
                                title="Sleep Duration"
                                subtitle={formatDuration(user.sleepDuration)}
                                icon={<div className="text-[#7BA8D4]"><Moon className="w-4 h-4" /></div>}
                            />
                        )}
                        {user.averageHrv !== undefined && (
                            <IOSListItem
                                title="Avg HRV (Sleep)"
                                subtitle={`${user.averageHrv} ms`}
                                icon={<div className="text-[#A08BBE]"><Heart className="w-4 h-4" /></div>}
                            />
                        )}
                        {user.restingHeartRate !== undefined && (
                            <IOSListItem
                                title="Lowest HR (Sleep)"
                                subtitle={`${user.restingHeartRate} bpm`}
                                icon={<div className="text-[#D4897B]"><Heart className="w-4 h-4" /></div>}
                            />
                        )}
                    </div>
                </div>

                {/* Score Distribution */}
                <div className="bg-[#F2EDE8] p-4 rounded-xl border border-[rgba(0,0,0,0.06)]">
                    <h4 className="text-sm font-medium text-[#2D2A26] mb-4">Score Distribution</h4>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-text-secondary">Readiness</span>
                                <span className="font-mono" style={{ color: readinessCategory.color }}>{user.readiness}</span>
                            </div>
                            <div className="h-2 bg-[#F0EBE5] rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${user.readiness}%`, backgroundColor: readinessCategory.color }}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-text-secondary">Sleep</span>
                                <span className="font-mono" style={{ color: sleepCategory.color }}>{user.sleep}</span>
                            </div>
                            <div className="h-2 bg-[#F0EBE5] rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${user.sleep}%`, backgroundColor: sleepCategory.color }}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-text-secondary">Activity</span>
                                <span className="font-mono" style={{ color: activityCategory.color }}>{user.activity}</span>
                            </div>
                            <div className="h-2 bg-[#F0EBE5] rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${user.activity}%`, backgroundColor: activityCategory.color }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <IOSButton onClick={onClose} className="w-full" variant="secondary">
                    Close
                </IOSButton>
            </div>
        </IOSModal>
    );
};

export default LeaderboardUserDetailModal;
