import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../types';
import CompetitionBuilder from './CompetitionBuilder';

const activeProfile: UserProfile = {
    id: 'profile-1',
    firstName: 'Davis',
    email: 'davis@example.com',
    token: 'access-token',
};

afterEach(cleanup);

describe('CompetitionBuilder accessibility', () => {
    it('opens as a named modal, focuses the first field, and closes with Escape', async () => {
        const onClose = vi.fn();

        render(
            <CompetitionBuilder
                isOpen
                activeProfile={activeProfile}
                profiles={[activeProfile]}
                onClose={onClose}
                onCreate={vi.fn().mockResolvedValue(undefined)}
            />,
        );

        expect(screen.getByRole('dialog', { name: /create a competition/i })).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByRole('button', { name: /close create a competition/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Friends' })).toHaveAttribute('aria-pressed', 'true');

        const titleField = screen.getByPlaceholderText('Balanced Week');
        await waitFor(() => expect(titleField).toHaveFocus());

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('blocks every dismissal path while creation is in flight', async () => {
        const onClose = vi.fn();
        let finishCreate: (() => void) | undefined;
        const onCreate = vi.fn(() => new Promise<void>((resolve) => {
            finishCreate = resolve;
        }));

        const { container } = render(
            <CompetitionBuilder
                isOpen
                activeProfile={activeProfile}
                profiles={[activeProfile]}
                onClose={onClose}
                onCreate={onCreate}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Create Competition' }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));

        const dialog = screen.getByRole('dialog', { name: /create a competition/i });
        expect(dialog).toHaveAttribute('aria-busy', 'true');
        expect(screen.queryByRole('button', { name: /close create a competition/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.mouseDown(container.querySelector<HTMLElement>('.ui-dialog-backdrop')!);
        expect(onClose).not.toHaveBeenCalled();

        await act(async () => finishCreate?.());
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
});
