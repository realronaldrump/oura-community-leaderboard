import React from 'react';
import { useParallax } from '../hooks/useParallax';
import FloatingOrb from './FloatingOrb';

interface HeroSectionProps {
    title: string;
    subtitle?: string;
    scores?: {
        readiness?: number | null;
        sleep?: number | null;
        activity?: number | null;
    };
    userName?: string;
    onScrollDown?: () => void;
    onScoreClick?: (scoreType: 'readiness' | 'sleep' | 'activity') => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({
    title,
    subtitle,
    scores,
    userName,
    onScrollDown,
    onScoreClick,
}) => {
    const { scrollY } = useParallax();

    // Parallax effects
    const titleOffset = scrollY * 0.3;
    const subtitleOffset = scrollY * 0.4;
    const orbOffset = scrollY * 0.2;
    const opacity = Math.max(0, 1 - scrollY / 600);

    return (
        <section
            className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4"
            style={{ opacity }}
        >
            {/* Soft background blobs */}
            <FloatingOrb
                size={200}
                color="rgba(107, 158, 138, 0.08)"
                delay={0}
                style={{
                    top: '10%',
                    left: '5%',
                    transform: `translateY(${-orbOffset * 1.5}px)`,
                }}
            />
            <FloatingOrb
                size={160}
                color="rgba(123, 168, 212, 0.08)"
                delay={2}
                style={{
                    top: '20%',
                    right: '10%',
                    transform: `translateY(${-orbOffset * 1.2}px)`,
                }}
            />
            <FloatingOrb
                size={120}
                color="rgba(212, 184, 123, 0.08)"
                delay={4}
                style={{
                    bottom: '25%',
                    left: '15%',
                    transform: `translateY(${-orbOffset}px)`,
                }}
            />
            <FloatingOrb
                size={180}
                color="rgba(160, 139, 190, 0.06)"
                delay={1}
                duration={8}
                style={{
                    bottom: '15%',
                    right: '8%',
                    transform: `translateY(${-orbOffset * 0.8}px)`,
                }}
            />

            {/* Main content */}
            <div
                className="relative z-10 text-center max-w-4xl"
                style={{ transform: `translateY(${titleOffset}px)` }}
            >
                {/* Greeting */}
                {userName && (
                    <p
                        className="text-[#7A756E] text-lg mb-2 animate-fade-in"
                        style={{ animationDelay: '0.1s' }}
                    >
                        Welcome back, <span className="text-[#6B9E8A] font-semibold">{userName}</span>
                    </p>
                )}

                {/* Title */}
                <h1
                    className="text-5xl md:text-7xl font-extrabold mb-4 tracking-tight animate-fade-in-up text-[#2D2A26]"
                    style={{ animationDelay: '0.2s' }}
                >
                    {title}
                </h1>

                {/* Subtitle */}
                {subtitle && (
                    <p
                        className="text-[#7A756E] text-lg md:text-xl max-w-2xl mx-auto mb-12 animate-fade-in-up"
                        style={{
                            transform: `translateY(${subtitleOffset - titleOffset}px)`,
                            animationDelay: '0.3s',
                        }}
                    >
                        {subtitle}
                    </p>
                )}

                {/* Score preview orbs */}
                {scores && (
                    <div
                        className="flex items-center justify-center gap-6 md:gap-10 animate-fade-in-up"
                        style={{ animationDelay: '0.4s' }}
                    >
                        {scores.readiness != null && (
                            <ScoreOrb
                                score={scores.readiness}
                                label="Readiness"
                                color="#7BC4A0"
                                onClick={() => onScoreClick?.('readiness')}
                            />
                        )}
                        {scores.sleep != null && (
                            <ScoreOrb
                                score={scores.sleep}
                                label="Sleep"
                                color="#7BA8D4"
                                onClick={() => onScoreClick?.('sleep')}
                            />
                        )}
                        {scores.activity != null && (
                            <ScoreOrb
                                score={scores.activity}
                                label="Activity"
                                color="#D4B87B"
                                onClick={() => onScoreClick?.('activity')}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Scroll indicator */}
            <div
                className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 cursor-pointer group"
                onClick={onScrollDown}
                style={{ opacity: Math.max(0, 1 - scrollY / 200) }}
            >
                <span className="text-[#A8A29E] text-sm group-hover:text-[#7A756E] transition-colors">
                    Scroll to explore
                </span>
                <div className="w-6 h-10 border-2 border-[#C8C2BB] rounded-full p-1 group-hover:border-[#7A756E] transition-colors">
                    <div className="w-1.5 h-1.5 bg-[#A8A29E] rounded-full mx-auto animate-bounce group-hover:bg-[#7A756E]" />
                </div>
            </div>
        </section>
    );
};

// Mini score orb component - clay style
interface ScoreOrbProps {
    score: number;
    label: string;
    color: string;
    onClick?: () => void;
}

const ScoreOrb: React.FC<ScoreOrbProps> = ({ score, label, color, onClick }) => {
    return (
        <div className="flex flex-col items-center group cursor-pointer" onClick={onClick}>
            <div
                className="relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-105"
                style={{
                    background: '#FFFFFF',
                    boxShadow: '6px 6px 12px rgba(0,0,0,0.08), -6px -6px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.8), inset -1px -1px 3px rgba(0,0,0,0.04)',
                    border: `2px solid ${color}30`,
                }}
            >
                {/* Animated ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                        cx="50%"
                        cy="50%"
                        r="42%"
                        fill="none"
                        stroke={`${color}20`}
                        strokeWidth="4"
                    />
                    <circle
                        cx="50%"
                        cy="50%"
                        r="42%"
                        fill="none"
                        stroke={color}
                        strokeWidth="4"
                        strokeDasharray={`${score * 2.64} 264`}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                        style={{ opacity: 0.8 }}
                    />
                </svg>

                <span
                    className="font-mono text-2xl md:text-3xl font-bold"
                    style={{ color }}
                >
                    {score}
                </span>
            </div>
            <span className="mt-2 text-xs uppercase tracking-wider text-[#A8A29E] font-semibold group-hover:text-[#7A756E] transition-colors">
                {label}
            </span>
        </div>
    );
};

export default HeroSection;
