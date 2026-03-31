import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { getProfileDisplayName } from '../utils/profileName';

interface PrimaryProfileSwitcherProps {
    className?: string;
    selectClassName?: string;
}

const PrimaryProfileSwitcher: React.FC<PrimaryProfileSwitcherProps> = ({
    className = '',
    selectClassName = '',
}) => {
    const { profiles, activeProfileId, setActiveProfileId } = useUser();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const fallbackProfileId = profiles[0]?.id || '';
    const selectedProfileId =
        activeProfileId && profiles.some((profile) => profile.id === activeProfileId)
            ? activeProfileId
            : fallbackProfileId;

    const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

    // Close on outside click
    const handleClickOutside = useCallback((event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
            setIsOpen(false);
        }
    }, []);

    // Close on Escape
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Escape') setIsOpen(false);
    }, []);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, handleClickOutside, handleKeyDown]);

    if (profiles.length < 2) return null;

    const handleSelect = (profileId: string) => {
        setActiveProfileId(profileId || null);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className={`profile-switcher ${className}`}>
            {/* Trigger button */}
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className={`profile-switcher__trigger ${isOpen ? 'is-open' : ''} ${selectClassName}`}
                aria-label="Primary profile"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                title="Switch primary profile"
            >
                <span className="profile-switcher__name">
                    {selectedProfile ? getProfileDisplayName(selectedProfile) : 'Select profile'}
                </span>
                <ChevronDown
                    className={`profile-switcher__chevron ${isOpen ? 'is-open' : ''}`}
                />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <ul className="profile-switcher__menu" role="listbox">
                    {profiles.map((profile) => {
                        const isSelected = profile.id === selectedProfileId;
                        return (
                            <li key={profile.id} role="option" aria-selected={isSelected}>
                                <button
                                    type="button"
                                    onClick={() => handleSelect(profile.id)}
                                    className={`profile-switcher__option ${isSelected ? 'is-active' : ''}`}
                                >
                                    <span className="profile-switcher__option-check">
                                        {isSelected && <Check className="w-3.5 h-3.5" />}
                                    </span>
                                    <span className="profile-switcher__option-label">
                                        {getProfileDisplayName(profile)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default PrimaryProfileSwitcher;
