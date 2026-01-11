import React, { useEffect, useState } from 'react';

interface IOSButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive';
  size?: 'small' | 'medium' | 'large';
  children: React.ReactNode;
}

export const IOSButton: React.FC<IOSButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  children,
  className = '',
  onClick,
  ...props
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const [rippleX, setRippleX] = useState(0);
  const [rippleY, setRippleY] = useState(0);

  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    setRippleX(touch.clientX - rect.left);
    setRippleY(touch.clientY - rect.top);
    setIsPressed(true);

    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
  };

  const baseClasses = 'ios-button ios-touch-target font-medium rounded-xl relative overflow-hidden transition-all duration-200';

  const sizeClasses = {
    small: 'px-3 py-2 text-sm',
    medium: 'px-5 py-3 text-base',
    large: 'px-6 py-4 text-lg'
  };

  const variantClasses = {
    primary: 'bg-[#00C896] text-black font-semibold',
    secondary: 'bg-[#1C1C1C] text-white border border-[#333]',
    destructive: 'bg-[#FF453A] text-white'
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={onClick}
      {...props}
    >
      {children}
      {isPressed && (
        <div
          className="absolute inset-0 bg-white/20 rounded-full animate-[iosRipple_0.6s_ease-out]"
          style={{ left: rippleX, top: rippleY, width: '200px', height: '200px', marginLeft: '-100px', marginTop: '-100px' }}
        />
      )}
    </button>
  );
};

interface IOSCardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const IOSCard: React.FC<IOSCardProps> = ({ children, onClick, className = '' }) => {
  const [isPressed, setIsPressed] = useState(false);

  const handleTouchStart = () => {
    setIsPressed(true);
    if (navigator.vibrate) {
      navigator.vibrate(5);
    }
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
  };

  return (
    <div
      className={`bg-[#141414] rounded-2xl border border-[#222] ${onClick ? 'ios-card cursor-pointer' : ''} ${className}`}
      onTouchStart={onClick ? handleTouchStart : undefined}
      onTouchEnd={onClick ? handleTouchEnd : undefined}
      onClick={onClick}
      style={{
        transform: isPressed ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      }}
    >
      {children}
    </div>
  );
};

interface IOSSwitchProps {
  isActive: boolean;
  onToggle: (active: boolean) => void;
  label?: string;
}

export const IOSSwitch: React.FC<IOSSwitchProps> = ({ isActive, onToggle, label }) => {
  const [isPressed, setIsPressed] = useState(false);

  const handleTouchStart = () => {
    setIsPressed(true);
    if (navigator.vibrate) {
      navigator.vibrate(5);
    }
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
  };

  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-[#A0A0A0]">{label}</span>}
      <div
        className={`ios-switch ${isActive ? 'active' : ''} ${isPressed ? 'scale-95' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => onToggle(!isActive)}
      />
    </div>
  );
};

interface IOSBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const IOSBottomSheet: React.FC<IOSBottomSheetProps> = ({ isOpen, onClose, children }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.target === e.currentTarget) {
      setIsDragging(true);
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging) {
      setCurrentY(e.touches[0].clientY - startY);
    }
  };

  const handleTouchEnd = () => {
    if (isDragging) {
      if (currentY > 100) {
        onClose();
      }
      setIsDragging(false);
      setCurrentY(0);
    }
  };

  return (
    <>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 ios-fade-in"
            onClick={onClose}
          />
          <div
            className={`ios-bottom-sheet ${isOpen ? 'open' : ''}`}
            style={{
              transform: `translateY(${isOpen ? currentY : '100%'})`
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="ios-pull-indicator" />
            {children}
          </div>
        </>
      )}
    </>
  );
};

interface IOSListItemProps {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
}

export const IOSListItem: React.FC<IOSListItemProps> = ({
  title,
  subtitle,
  rightElement,
  onClick,
  icon
}) => {
  return (
    <div
      className={`ios-list-item ios-touch ios-card px-4 py-3 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {icon && <div className="ios-touch-target">{icon}</div>}
        <div className="flex-1 min-w-0">
          <div className="text-[#FAFAFA] font-medium">{title}</div>
          {subtitle && <div className="text-[#666666] text-sm">{subtitle}</div>}
        </div>
        {rightElement && <div className="ios-touch-target">{rightElement}</div>}
      </div>
    </div>
  );
};

interface IOSSafeAreaViewProps {
  children: React.ReactNode;
  edges?: 'top' | 'bottom' | 'left' | 'right' | 'all';
  className?: string;
}

export const IOSSafeAreaView: React.FC<IOSSafeAreaViewProps> = ({
  children,
  edges = 'all',
  className = ''
}) => {
  const edgeClasses = {
    top: 'safe-top',
    bottom: 'safe-bottom',
    left: 'safe-left',
    right: 'safe-right',
    all: 'safe-all'
  };

  return (
    <div className={`${edgeClasses[edges]} ${className}`}>
      {children}
    </div>
  );
};

interface IOSLoadingProps {
  size?: 'small' | 'large';
  text?: string;
}

export const IOSLoading: React.FC<IOSLoadingProps> = ({ size = 'small', text }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className={`ios-spinner ${size === 'large' ? 'ios-spinner-lg' : ''}`} />
      {text && <span className="text-[#A0A0A0] text-sm">{text}</span>}
    </div>
  );
};

interface IOSPullToRefreshProps {
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  children: React.ReactNode;
}

export const IOSPullToRefresh: React.FC<IOSPullToRefreshProps> = ({
  onRefresh,
  isRefreshing,
  children
}) => {
  const [pullProgress, setPullProgress] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const isPulled = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollTop = (e.currentTarget as HTMLElement).scrollTop;
    if (scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0) {
      const progress = Math.min(diff / 100, 1);
      setPullProgress(progress);
      isPulled.current = diff > 80;
    }
  };

  const handleTouchEnd = async () => {
    setIsPulling(false);

    if (isPulled.current && !isRefreshing) {
      isPulled.current = false;
      await onRefresh();
    }

    setPullProgress(0);
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      <div
        className="flex justify-center items-center transition-transform duration-300"
        style={{
          transform: `translateY(${pullProgress * 60}px)`,
          opacity: pullProgress,
          height: isPulling || isRefreshing ? '60px' : '0px'
        }}
      >
        {isRefreshing ? (
          <div className="ios-spinner" />
        ) : (
          <div
            className="text-[#A0A0A0] text-sm transition-transform duration-300"
            style={{ transform: `rotate(${pullProgress * 360}deg)` }}
          >
            ↻
          </div>
        )}
      </div>
      {children}
    </div>
  );
};

interface IOSModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const IOSModal: React.FC<IOSModalProps> = ({
  isOpen,
  onClose,
  title,
  children
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 ios-fade-in">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto">
            <IOSCard className="ios-spring">
              <div className="flex justify-between items-center mb-4">
                {title && <h2 className="text-lg font-bold text-[#FAFAFA]">{title}</h2>}
                <button
                  onClick={onClose}
                  className="text-[#A0A0A0] hover:text-[#FAFAFA] ios-touch-target rounded-full p-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {children}
            </IOSCard>
          </div>
        </div>
      )}
    </>
  );
};

interface IOSInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const IOSInput: React.FC<IOSInputProps> = ({
  label,
  error,
  className = '',
  ...props
}) => {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-[#666666] text-sm">{label}</label>}
      <input
        {...props}
        className={`bg-[#1C1C1C] border ${error ? 'border-[#FF453A]' : 'border-[#333]'} rounded-xl px-4 py-3 text-[#FAFAFA] placeholder-[#666666] focus:outline-none focus:border-[#00C896] transition-colors ios-touch-target`}
        style={{ fontSize: '16px' }}
      />
      {error && <span className="text-[#FF453A] text-sm">{error}</span>}
    </div>
  );
};

interface IOSBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export const IOSBadge: React.FC<IOSBadgeProps> = ({ children, variant = 'default' }) => {
  const variantClasses = {
    default: 'bg-[#333] text-[#FAFAFA]',
    success: 'bg-[#34D399] text-black',
    warning: 'bg-[#FBBF24] text-black',
    danger: 'bg-[#FF453A] text-white'
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${variantClasses[variant]}`}>
      {children}
    </span>
  );
};

export const useHapticFeedback = () => {
  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') => {
    if (!navigator.vibrate) return;

    const patterns = {
      light: 10,
      medium: 20,
      heavy: 40,
      success: [10, 50, 10],
      warning: [20, 30, 20],
      error: [30, 20, 30]
    };

    navigator.vibrate(patterns[type]);
  };

  return { triggerHaptic };
};

import { useRef } from 'react';