import { useState, useEffect, useCallback, useRef } from 'react';

interface MousePosition {
    x: number;
    y: number;
    normalizedX: number; // -1 to 1
    normalizedY: number; // -1 to 1
}

export function useMousePosition(elementRef?: React.RefObject<HTMLElement>): MousePosition {
    const [position, setPosition] = useState<MousePosition>({
        x: 0,
        y: 0,
        normalizedX: 0,
        normalizedY: 0,
    });

    const ticking = useRef(false);

    const updatePosition = useCallback((clientX: number, clientY: number) => {
        let x = clientX;
        let y = clientY;
        let normalizedX = 0;
        let normalizedY = 0;

        if (elementRef?.current) {
            const rect = elementRef.current.getBoundingClientRect();
            x = clientX - rect.left;
            y = clientY - rect.top;
            normalizedX = (x / rect.width) * 2 - 1;
            normalizedY = (y / rect.height) * 2 - 1;
        } else {
            normalizedX = (clientX / window.innerWidth) * 2 - 1;
            normalizedY = (clientY / window.innerHeight) * 2 - 1;
        }

        setPosition({ x, y, normalizedX, normalizedY });
        ticking.current = false;
    }, [elementRef]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!ticking.current) {
                requestAnimationFrame(() => updatePosition(e.clientX, e.clientY));
                ticking.current = true;
            }
        };

        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [updatePosition]);

    return position;
}

interface TiltTransform {
    transform: string;
    style: React.CSSProperties;
}

export function useTilt(
    ref: React.RefObject<HTMLElement>,
    intensity: number = 10
): TiltTransform {
    const { normalizedX, normalizedY } = useMousePosition(ref);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const handleEnter = () => setIsHovered(true);
        const handleLeave = () => setIsHovered(false);

        element.addEventListener('mouseenter', handleEnter);
        element.addEventListener('mouseleave', handleLeave);

        return () => {
            element.removeEventListener('mouseenter', handleEnter);
            element.removeEventListener('mouseleave', handleLeave);
        };
    }, [ref]);

    const rotateX = isHovered ? -normalizedY * intensity : 0;
    const rotateY = isHovered ? normalizedX * intensity : 0;

    return {
        transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
        style: {
            transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
            transition: isHovered ? 'transform 0.1s ease-out' : 'transform 0.5s ease-out',
        },
    };
}

export default useMousePosition;
