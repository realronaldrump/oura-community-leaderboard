import { useEffect, useMemo, useState } from 'react';
import { competitionService } from '../services/competitionService';
import { Competition, CompetitionInvitePreview } from '../types/competitionTypes';

export const useCompetitions = (activeProfileId?: string | null) => {
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setIsLoading(true);
        setError(null);

        const unsubscribe = competitionService.subscribeToCompetitions(
            (nextCompetitions) => {
                setCompetitions(nextCompetitions);
                setIsLoading(false);
            },
            (nextError) => {
                console.error('Competition subscription failed:', nextError);
                setError('Could not load competitions right now.');
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    const visibleCompetitions = useMemo(() => {
        if (!activeProfileId) return [];
        return competitions.filter((competition) =>
            competition.createdByProfileId === activeProfileId ||
            competition.participantProfileIds.includes(activeProfileId)
        );
    }, [activeProfileId, competitions]);

    return {
        competitions: visibleCompetitions,
        allCompetitions: competitions,
        isLoading,
        error,
    };
};

export const useCompetitionInvitePreview = (token?: string | null) => {
    const [preview, setPreview] = useState<CompetitionInvitePreview | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setPreview(null);
            setError(null);
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        competitionService.getCompetitionInvitePreview(token)
            .then((result) => {
                if (cancelled) return;
                setPreview(result);
            })
            .catch((nextError) => {
                console.error('Failed to load competition invite preview:', nextError);
                if (cancelled) return;
                setError('Could not load that competition invite.');
                setPreview(null);
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [token]);

    return { preview, isLoading, error };
};
