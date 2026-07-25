import { fireEvent, render, screen } from '@testing-library/react';
import InfoTooltip from './InfoTooltip';

describe('InfoTooltip', () => {
    it('keeps closed content out of document geometry and closes with Escape', () => {
        render(
            <InfoTooltip
                title="Sleep evidence"
                description="A deliberately wide explanation that should exist only while open."
            />
        );

        const trigger = screen.getByRole('button', { name: 'Info about Sleep evidence' });
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger).not.toHaveAttribute('aria-controls');

        fireEvent.click(trigger);
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(trigger).toHaveAttribute('aria-controls');

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
});
