import React from 'react';
import { ChevronDown } from 'lucide-react';
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

    if (profiles.length < 2) return null;

    const fallbackProfileId = profiles[0]?.id || '';
    const selectedProfileId =
        activeProfileId && profiles.some((profile) => profile.id === activeProfileId)
            ? activeProfileId
            : fallbackProfileId;

    return (
        <div className={`relative ${className}`}>
            <select
                value={selectedProfileId}
                onChange={(event) => setActiveProfileId(event.target.value || null)}
                className={`appearance-none pl-3 pr-9 py-2 rounded-md bg-white border border-[rgba(0,0,0,0.06)] text-sm text-[#2D2A26] focus:outline-none focus:border-[#6B9E8A] transition-colors ${selectClassName}`}
                aria-label="Primary profile"
                title="Switch primary profile"
            >
                {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                        {getProfileDisplayName(profile)}
                    </option>
                ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#A8A29E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
    );
};

export default PrimaryProfileSwitcher;
