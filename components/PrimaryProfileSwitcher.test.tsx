import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useUser } from '../contexts/UserContext';
import type { UserProfile } from '../types';
import PrimaryProfileSwitcher from './PrimaryProfileSwitcher';

vi.mock('../contexts/UserContext', () => ({
    useUser: vi.fn(),
}));

const profile = (id: string, firstName: string): UserProfile => ({
    id,
    firstName,
    token: `token-${id}`,
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('PrimaryProfileSwitcher', () => {
    it('switches the active profile through a custom visible label', () => {
        const setActiveProfileId = vi.fn();
        vi.mocked(useUser).mockReturnValue({
            profiles: [profile('profile-1', 'Davis'), profile('profile-2', 'Alex')],
            activeProfileId: 'profile-1',
            setActiveProfileId,
        } as unknown as ReturnType<typeof useUser>);

        render(
            <PrimaryProfileSwitcher
                label="Viewing"
                labelClassName="visible-label"
            />
        );

        const switcher = screen.getByRole('combobox', { name: 'Viewing' });
        expect(screen.getByText('Viewing')).toHaveClass('visible-label');
        expect(switcher).toHaveValue('profile-1');

        fireEvent.change(switcher, { target: { value: 'profile-2' } });

        expect(setActiveProfileId).toHaveBeenCalledWith('profile-2');
    });

    it('does not render when there is no other profile to view', () => {
        vi.mocked(useUser).mockReturnValue({
            profiles: [profile('profile-1', 'Davis')],
            activeProfileId: 'profile-1',
            setActiveProfileId: vi.fn(),
        } as unknown as ReturnType<typeof useUser>);

        const { container } = render(<PrimaryProfileSwitcher />);

        expect(container).toBeEmptyDOMElement();
    });
});
