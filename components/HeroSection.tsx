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
}

const HeroSection: React.FC<HeroSectionProps> = ({
    title,
    subtitle,
    scores,
    userName,
    onScrollDown,
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
            {/* Background gradient mesh */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `
            radial-gradient(ellipse 100% 80% at 50% 0%, rgba(0, 212, 255, 0.12), transparent 50%),
            radial-gradient(ellipse 80% 60% at 80% 50%, rgba(168, 85, 247, 0.08), transparent 50%),
            radial-gradient(ellipse 60% 50% at 20% 80%, rgba(16, 185, 129, 0.06), transparent 50%)
          `,
                    transform: `translateY(${orbOffset}px)`,
                }}
            />

            {/* Floating orbs */}
            <FloatingOrb
                size={120}
                color="rgba(0, 212, 255, 0.15)"
                glowColor="rgba(0, 212, 255, 0.3)"
                delay={0}
                style={{
                    top: '15%',
                    left: '10%',
                    transform: `translateY(${-orbOffset * 1.5}px)`,
                }}
            />
            <FloatingOrb
                size={80}
                color="rgba(168, 85, 247, 0.15)"
                glowColor="rgba(168, 85, 247, 0.3)"
                delay={2}
                style={{
                    top: '25%',
                    right: '15%',
                    transform: `translateY(${-orbOffset * 1.2}px)`,
                }}
            />
            <FloatingOrb
                size={60}
                color="rgba(16, 185, 129, 0.15)"
                glowColor="rgba(16, 185, 129, 0.3)"
                delay={4}
                style={{
                    bottom: '30%',
                    left: '20%',
                    transform: `translateY(${-orbOffset}px)`,
                }}
            />
            <FloatingOrb
                size={100}
                color="rgba(245, 158, 11, 0.12)"
                glowColor="rgba(245, 158, 11, 0.25)"
                delay={1}
                duration={8}
                style={{
                    bottom: '20%',
                    right: '10%',
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
                        className="text-text-secondary text-lg mb-2 animate-fade-in"
                        style={{ animationDelay: '0.1s' }}
                    >
                        Welcome back, <span className="text-accent-cyan">{userName}</span>
                    </p>
                )}

                {/* Title */}
                <h1
                    className="text-5xl md:text-7xl font-bold mb-4 tracking-tight animate-fade-in-up"
                    style={{ animationDelay: '0.2s' }}
                >
                    <span className="gradient-text">{title}</span>
                </h1>

                {/* Subtitle */}
                {subtitle && (
                    <p
                        className="text-text-secondary text-lg md:text-xl max-w-2xl mx-auto mb-12 animate-fade-in-up"
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
                                color="#10B981"
                            />
                        )}
                        {scores.sleep != null && (
                            <ScoreOrb
                                score={scores.sleep}
                                label="Sleep"
                                color="#3B82F6"
                            />
                        )}
                        {scores.activity != null && (
                            <ScoreOrb
                                score={scores.activity}
                                label="Activity"
                                color="#F59E0B"
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
                <span className="text-text-muted text-sm group-hover:text-text-secondary transition-colors">
                    Scroll to explore
                </span>
                <div className="w-6 h-10 border-2 border-text-muted rounded-full p-1 group-hover:border-text-secondary transition-colors">
                    <div className="w-1.5 h-1.5 bg-text-muted rounded-full mx-auto animate-bounce group-hover:bg-text-secondary" />
                </div>
            </div>
        </section>
    );
};

// Mini score orb component
interface ScoreOrbProps {
    score: number;
    label: string;
    color: string;
}

const ScoreOrb: React.FC<ScoreOrbProps> = ({ score, label, color }) => {
    return (
        <div className="flex flex-col items-center group cursor-pointer">
            <div
                className="relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                style={{
                    background: `radial-gradient(circle at 30% 30%, ${color}20, ${color}05)`,
                    boxShadow: `0 0 30px ${color}40, inset 0 0 20px ${color}10`,
                    border: `2px solid ${color}40`,
                }}
            >
                {/* Animated ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                        cx="50%"
                        cy="50%"
                        r="45%"
                        fill="none"
                        stroke={color}
                        strokeWidth="3"
                        strokeDasharray={`${score * 2.83} 283`}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out-expo"
                        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
                    />
                </svg>

                <span
                    className="font-mono text-2xl md:text-3xl font-bold"
                    style={{ color }}
                >
                    {score}
                </span>
            </div>
            <span className="mt-2 text-xs uppercase tracking-wider text-text-muted group-hover:text-text-secondary transition-colors">
                {label}
            </span>
        </div>
    );
};

export default HeroSection;
