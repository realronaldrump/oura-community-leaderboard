import React from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useParallax } from '../hooks/useParallax';

interface ParallaxSectionProps {
    children: React.ReactNode;
    className?: string;
    parallaxSpeed?: number;
    fadeIn?: boolean;
    id?: string;
    title?: string;
    subtitle?: string;
}

const ParallaxSection: React.FC<ParallaxSectionProps> = ({
    children,
    className = '',
    parallaxSpeed = 0.1,
    fadeIn = true,
    id,
    title,
    subtitle,
}) => {
    const [ref, isVisible] = useScrollReveal<HTMLElement>({ threshold: 0.1 });
    const { scrollY } = useParallax();

    // Calculate section-specific parallax offset
    const sectionTop = ref.current?.offsetTop || 0;
    const relativeScroll = scrollY - sectionTop + window.innerHeight;
    const parallaxOffset = relativeScroll * parallaxSpeed;

    return (
        <section
            ref={ref}
            id={id}
            className={`relative py-16 md:py-24 ${className}`}
        >
            {/* Section header */}
            {title && (
                <div className={`mb-12 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-3">
                        {title}
                    </h2>
                    {subtitle && (
                        <p className="text-text-secondary text-lg max-w-2xl">
                            {subtitle}
                        </p>
                    )}
                    {/* Gradient line */}
                    <div
                        className="mt-4 h-1 w-24 rounded-full"
                        style={{
                            background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))',
                        }}
                    />
                </div>
            )}

            {/* Content with parallax */}
            <div
                className={`transition-all duration-700 ${fadeIn && isVisible ? 'opacity-100 translate-y-0' : fadeIn ? 'opacity-0 translate-y-8' : ''}`}
                style={{
                    transform: parallaxSpeed !== 0 ? `translateY(${parallaxOffset}px)` : undefined,
                }}
            >
                {children}
            </div>
        </section>
    );
};

// Section divider with gradient
export const SectionDivider: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <div className={`relative h-32 overflow-hidden ${className}`}>
            <div
                className="absolute inset-0 opacity-30"
                style={{
                    background: 'linear-gradient(180deg, transparent, rgba(0, 212, 255, 0.1), transparent)',
                }}
            />
            <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-16"
                style={{
                    background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.3), transparent)',
                }}
            />
        </div>
    );
};

export default ParallaxSection;
