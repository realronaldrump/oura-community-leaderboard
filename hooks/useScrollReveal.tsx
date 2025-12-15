import { useState, useEffect, useRef, useCallback } from 'react';

interface ScrollRevealOptions {
    threshold?: number;
    rootMargin?: string;
    triggerOnce?: boolean;
}

export function useScrollReveal<T extends HTMLElement>(
    options: ScrollRevealOptions = {}
): [React.RefObject<T>, boolean] {
    const { threshold = 0.1, rootMargin = '0px 0px -50px 0px', triggerOnce = true } = options;

    const ref = useRef<T>(null);
    const [isVisible, setIsVisible] = useState(false);
    const hasTriggered = useRef(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        // Check for reduced motion preference
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    if (triggerOnce && hasTriggered.current) return;
                    setIsVisible(true);
                    hasTriggered.current = true;

                    if (triggerOnce) {
                        observer.unobserve(element);
                    }
                } else if (!triggerOnce) {
                    setIsVisible(false);
                }
            },
            { threshold, rootMargin }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [threshold, rootMargin, triggerOnce]);

    return [ref, isVisible];
}

// Hook for staggered children reveal
export function useStaggerReveal<T extends HTMLElement>(
    childCount: number,
    staggerDelay: number = 100
): [React.RefObject<T>, boolean, number[]] {
    const [ref, isVisible] = useScrollReveal<T>();

    const delays = Array.from({ length: childCount }, (_, i) => i * staggerDelay);

    return [ref, isVisible, delays];
}

// Component wrapper for scroll reveal
interface RevealProps {
    children: React.ReactNode;
    className?: string;
    animation?: 'fade-up' | 'fade-left' | 'fade-right' | 'scale' | 'fade';
    delay?: number;
    threshold?: number;
}

export function Reveal({
    children,
    className = '',
    animation = 'fade-up',
    delay = 0,
    threshold = 0.1
}: RevealProps) {
    const [ref, isVisible] = useScrollReveal<HTMLDivElement>({ threshold });

    const animationClasses: Record<string, string> = {
        'fade-up': 'reveal',
        'fade-left': 'reveal-left',
        'fade-right': 'reveal-right',
        'scale': 'reveal-scale',
        'fade': 'reveal',
    };

    const baseClass = animationClasses[animation] || 'reveal';
    const visibleClass = isVisible ? 'visible' : '';

    return (
        <div
            ref={ref}
            className={`${baseClass} ${visibleClass} ${className}`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {children}
        </div>
    );
}

export default useScrollReveal;
