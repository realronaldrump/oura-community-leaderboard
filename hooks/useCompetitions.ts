import { useEffect, useState } from 'react';
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
        setCompetitions([]);

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


    return {
        competitions: activeProfileId ? competitions : [],
        allCompetitions: competitions,
        isLoading,
        error,
    };
};

export const useCompetitionInvitePreview = (token?: string | null) => {
    const [result, setResult] = useState<{
        token: string;
        preview: CompetitionInvitePreview | null;
        error: string | null;
    } | null>(null);

    useEffect(() => {
        if (!token) {
            setResult(null);
            return;
        }
        let cancelled = false;
        setResult(null);
        competitionService.getCompetitionInvitePreview(token)
            .then((preview) => {
                if (!cancelled) setResult({ token, preview, error: null });
            })
            .catch((error) => {
                console.error('Failed to load competition invite:', error);
                if (!cancelled) setResult({ token, preview: null, error: 'Could not load this invite. Reopen the link to try again.' });
            });
        return () => { cancelled = true; };
    }, [token]);

    const current = token && result?.token === token ? result : null;
    return {
        preview: current?.preview ?? null,
        isLoading: Boolean(token && !current),
        error: current?.error ?? null,
    };
};
