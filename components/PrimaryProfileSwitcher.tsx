import React from 'react';
import { useUser } from '../contexts/UserContext';
import { getProfileDisplayName } from '../utils/profileName';
import { Select } from './ui';

interface PrimaryProfileSwitcherProps {
    className?: string;
    selectClassName?: string;
}

const PrimaryProfileSwitcher: React.FC<PrimaryProfileSwitcherProps> = ({
    className = '',
    selectClassName = '',
}) => {
    const { profiles, activeProfileId, setActiveProfileId } = useUser();

    if (profiles.length < 2) return null;

    const fallbackProfileId = profiles[0]?.id || '';
    const selectedProfileId = activeProfileId && profiles.some((profile) => profile.id === activeProfileId)
        ? activeProfileId
        : fallbackProfileId;

    return (
        <label className={`profile-switcher ${className}`}>
            <span className="sr-only">Active profile</span>
            <Select
                value={selectedProfileId}
                onChange={(event) => setActiveProfileId(event.target.value || null)}
                className={`profile-switcher__select ${selectClassName}`}
                aria-label="Active profile"
                title="Switch active profile"
            >
                {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                        {getProfileDisplayName(profile)}
                    </option>
                ))}
            </Select>
        </label>
    );
};

export default PrimaryProfileSwitcher;
