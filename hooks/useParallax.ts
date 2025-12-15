import { useState, useEffect, useCallback, useRef } from 'react';

interface ParallaxState {
    scrollY: number;
    scrollProgress: number;
    direction: 'up' | 'down' | null;
}

export function useParallax(): ParallaxState {
    const [state, setState] = useState<ParallaxState>({
        scrollY: 0,
        scrollProgress: 0,
        direction: null,
    });

    const lastScrollY = useRef(0);
    const ticking = useRef(false);

    const updateScroll = useCallback(() => {
        const scrollY = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const scrollProgress = maxScroll > 0 ? scrollY / maxScroll : 0;
        const direction = scrollY > lastScrollY.current ? 'down' : scrollY < lastScrollY.current ? 'up' : null;

        lastScrollY.current = scrollY;

        setState({
            scrollY,
            scrollProgress,
            direction,
        });

        // Update CSS custom property for CSS-based parallax
        document.documentElement.style.setProperty('--scroll-y', scrollY.toString());

        ticking.current = false;
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            if (!ticking.current) {
                requestAnimationFrame(updateScroll);
                ticking.current = true;
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        updateScroll(); // Initial call

        return () => window.removeEventListener('scroll', handleScroll);
    }, [updateScroll]);

    return state;
}

interface ParallaxOffset {
    transform: string;
    opacity?: number;
}

export function useParallaxOffset(
    speed: number = 0.5,
    fadeOut: boolean = false,
    startOffset: number = 0
): ParallaxOffset {
    const { scrollY } = useParallax();

    const offset = (scrollY - startOffset) * speed;
    const opacity = fadeOut ? Math.max(0, 1 - scrollY / 500) : undefined;

    return {
        transform: `translateY(${offset}px)`,
        opacity,
    };
}

export default useParallax;
