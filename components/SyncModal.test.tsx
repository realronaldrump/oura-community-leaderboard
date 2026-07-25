import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SyncModal from './SyncModal';

afterEach(cleanup);

describe('SyncModal dismissal', () => {
    it('cannot be dismissed during sync and becomes dismissible when finished', () => {
        const onClose = vi.fn();
        const { container, rerender } = render(
            <SyncModal
                isOpen
                onClose={onClose}
                progress={{
                    status: 'syncing',
                    currentStep: 'Fetching sleep data',
                    stepsCompleted: 1,
                    totalSteps: 4,
                    details: 'One sheep counted',
                }}
            />,
        );

        const dialog = screen.getByRole('dialog', { name: /sync oura data/i });
        expect(dialog).toHaveAttribute('aria-busy', 'true');
        expect(screen.queryByRole('button', { name: /close sync oura data/i })).not.toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.mouseDown(container.querySelector<HTMLElement>('.ui-dialog-backdrop')!);
        expect(onClose).not.toHaveBeenCalled();

        rerender(
            <SyncModal
                isOpen
                onClose={onClose}
                progress={{
                    status: 'complete',
                    currentStep: 'Sync complete',
                    stepsCompleted: 4,
                    totalSteps: 4,
                    details: 'Caught up',
                }}
            />,
        );

        expect(dialog).not.toHaveAttribute('aria-busy');
        expect(screen.getByRole('button', { name: /close sync oura data/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
