import React from 'react';

interface FloatingOrbProps {
    size?: number;
    color?: string;
    glowColor?: string;
    delay?: number;
    duration?: number;
    className?: string;
    style?: React.CSSProperties;
}

const FloatingOrb: React.FC<FloatingOrbProps> = ({
    size = 80,
    color = 'rgba(107, 158, 138, 0.12)',
    glowColor,
    delay = 0,
    duration = 6,
    className = '',
    style = {},
}) => {
    return (
        <div
            className={`absolute rounded-full pointer-events-none ${className}`}
            style={{
                width: size,
                height: size,
                background: color,
                filter: `blur(${size * 0.4}px)`,
                animation: `float ${duration}s ease-in-out ${delay}s infinite`,
                ...style,
            }}
        />
    );
};

export default FloatingOrb;
