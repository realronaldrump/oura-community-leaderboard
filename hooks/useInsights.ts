import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  readInsightSummary,
  readRecordDay,
  subscribeInsights,
  type PublishedInsights,
} from "../services/insightsService";
import type { UserProfile } from "../types";
import { exclusionKey } from "../domain/metrics";
import { compareRecordPriority, isPresentableRecord, selectFeatured } from "../domain/records";
export function useInsights(profile: UserProfile, peers: UserProfile[] = [], selectedDay?: string) {
  const client = useQueryClient();
  const result = useQuery({
    queryKey: ["insights", profile.id],
    queryFn: () => readInsightSummary(profile.id),
    staleTime: 60_000,
  });
  useEffect(
    () =>
      subscribeInsights(
        profile.id,
        (data) => {
          if (data) client.setQueryData(["insights", profile.id], data);
        },
        () => {
          void client.invalidateQueries({ queryKey: ["insights", profile.id] });
        },
      ),
    [profile.id, client],
  );
  const unfiltered =
    result.data?.exclusions === exclusionKey(profile) ? result.data : null;
  const historicalDay = selectedDay && unfiltered && selectedDay !== unfiltered.day
    ? selectedDay : null;
  const archivePending = Boolean(historicalDay && unfiltered?.archiveBefore && historicalDay <= unfiltered.archiveBefore);
  const historical = useQuery({
    queryKey: ["insight-day", profile.id, unfiltered?.archiveIndex, historicalDay],
    queryFn: () => readRecordDay(profile.id, unfiltered!.archiveIndex, historicalDay!),
    enabled: Boolean(historicalDay && unfiltered?.archiveIndex && !archivePending),
    staleTime: 60_000,
  });
  const eligible = (event: PublishedInsights["recent"][number]) =>
    !event.peerId ||
    peers.some(
      (p) =>
        p.id === event.peerId &&
        unfiltered?.peerInputs?.[p.id]?.exclusions === exclusionKey(p),
    );
  const data = unfiltered
    ? {
        ...unfiltered,
        // Older published summaries may still hold records-1 rolling-window events until rebuilt.
        featured: unfiltered.featured.filter(e => eligible(e) && isPresentableRecord(e)).sort(compareRecordPriority),
        recent: unfiltered.recent.filter(e => eligible(e) && isPresentableRecord(e)).sort((a, b) => b.day.localeCompare(a.day) || compareRecordPriority(a, b)),
      }
    : null;
  return {
    ...result,
    data: data as PublishedInsights | null,
    // A past date reads its saved day only; the current feed keeps the server's selection.
    highlights: historicalDay
      ? archivePending ? [] : selectFeatured(
        (historical.data || []).filter((event) => eligible(event) && isPresentableRecord(event)),
        [],
        historicalDay,
      )
      : data?.featured || [],
    highlightsPending: Boolean(historicalDay && (archivePending || historical.isPending)),
    highlightsError: Boolean(historicalDay && historical.isError),
    refetchHighlights: historical.refetch,
    rebuilding: Boolean(result.data && !data),
  };
}
