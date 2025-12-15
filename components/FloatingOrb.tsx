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
    color = 'rgba(0, 212, 255, 0.2)',
    glowColor = 'rgba(0, 212, 255, 0.4)',
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
                background: `radial-gradient(circle at 30% 30%, ${color}, transparent 70%)`,
                boxShadow: `0 0 ${size * 0.5}px ${glowColor}, inset 0 0 ${size * 0.3}px rgba(255,255,255,0.1)`,
                animation: `float ${duration}s ease-in-out ${delay}s infinite`,
                ...style,
            }}
        >
            {/* Inner highlight */}
            <div
                className="absolute rounded-full"
                style={{
                    width: size * 0.3,
                    height: size * 0.3,
                    top: '15%',
                    left: '20%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.4), transparent 70%)',
                }}
            />
        </div>
    );
};

export default FloatingOrb;
