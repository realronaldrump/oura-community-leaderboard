import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateCompetition } from '../../services/competitionEngine';
import { makeCompetition } from '../../test/competitionFixtures';
import { createEmptyDailyStats } from '../../test/helpers';
import CompetitionCard from './CompetitionCard';

afterEach(cleanup);
const data = { 'profile-1': createEmptyDailyStats({ activity: [{ id: 'day', day: '2026-09-10', steps: 15000, score: 80, active_calories: 500, target_calories: 500, total_calories: 2000, contributors: {} }] }) };

describe('competition cards', () => {
    it('shows real steps and missing data without invented zero scores', () => {
        render(<CompetitionCard activeProfileId="profile-1" evaluation={evaluateCompetition(makeCompetition(), data, '2026-09-10')} />);
        expect(screen.getByText('15,000 steps')).toBeInTheDocument();
        expect(screen.getByText('Waiting for Oura')).toBeInTheDocument();
        expect(screen.queryByText('0 steps')).not.toBeInTheDocument();
        expect(screen.queryByText(/weighted|window|metrics|scored through/i)).not.toBeInTheDocument();
    });
    it('shows one successful day as 1/7, not 100 percent', () => {
        render(<CompetitionCard activeProfileId="profile-1" evaluation={evaluateCompetition(makeCompetition({ mode: 'solo', format: 'goal', scoring: undefined }), data, '2026-09-10')} />);
        expect(screen.getByText('1 / 7 days')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '7');
    });
    it('does not present a winner or zero standings before the start', () => {
        render(<CompetitionCard activeProfileId="profile-1" evaluation={evaluateCompetition(makeCompetition(), data, '2026-09-09')} />);
        expect(screen.queryByRole('list', { name: 'Standings' })).not.toBeInTheDocument();
        expect(screen.getByText(/Ready to go/)).toBeInTheDocument();
    });
    it('hides incomplete scores during history loading or errors', () => {
        const evaluation = evaluateCompetition(makeCompetition(), data, '2026-09-10');
        const { rerender } = render(<CompetitionCard activeProfileId="profile-1" evaluation={evaluation} scoresLoading />);
        expect(screen.getByRole('status')).toHaveTextContent('Loading scores');
        expect(screen.queryByText('15,000 steps')).not.toBeInTheDocument();
        rerender(<CompetitionCard activeProfileId="profile-1" evaluation={evaluation} scoresError />);
        expect(screen.getByRole('status')).toHaveTextContent('Scores are unavailable');
    });
    it('offers one invite action only for the owner of an open competition and exposes share errors', () => {
        const { rerender } = render(<CompetitionCard activeProfileId="profile-1" evaluation={evaluateCompetition(makeCompetition(), {}, '2026-09-09')} shareStatus="error" onShareInvite={vi.fn()} />);
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveTextContent('Could not share');
        rerender(<CompetitionCard activeProfileId="profile-1" evaluation={evaluateCompetition(makeCompetition(), {}, '2026-09-17')} />);
        expect(screen.queryByRole('button', { name: 'Invite friends' })).not.toBeInTheDocument();
    });
});
