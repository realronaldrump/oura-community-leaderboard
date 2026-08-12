import { useEffect, useMemo, useState } from 'react';
import { competitionService } from '../services/competitionService';
import { Competition, CompetitionInvitePreview } from '../types/competitionTypes';

export const useCompetitions = (activeProfileId?: string | null) => {
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!activeProfileId) {
            setCompetitions([]);
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        let retryTimer: number | null = null;
        let unsubscribe: (() => void) | null = null;
        setIsLoading(true);
        setError(null);

        const subscribe = () => {
            if (cancelled) return;
            unsubscribe?.();
            unsubscribe = competitionService.subscribeToCompetitions(
                activeProfileId,
                (nextCompetitions) => {
                    if (cancelled) return;
                    setCompetitions(nextCompetitions);
                    setError(null);
                    setIsLoading(false);
                },
                (nextError) => {
                    if (cancelled) return;
                    console.error('Competition subscription failed:', nextError);
                    setError('Competitions are temporarily unavailable. They will return automatically.');
                    setIsLoading(false);
                    retryTimer = window.setTimeout(subscribe, 5_000);
                }
            );
        };
        subscribe();

        return () => {
            cancelled = true;
            unsubscribe?.();
            if (retryTimer != null) window.clearTimeout(retryTimer);
        };
    }, [activeProfileId]);

    const visibleCompetitions = useMemo(() => {
        if (!activeProfileId) return [];
        return competitions;
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
