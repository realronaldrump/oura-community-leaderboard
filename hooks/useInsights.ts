import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  readInsightSummary,
  subscribeInsights,
  type PublishedInsights,
} from "../services/insightsService";
import type { UserProfile } from "../types";
import { exclusionKey } from "../domain/metrics";
import { compareRecordPriority, isSecondaryRecord } from "../domain/records";
export function useInsights(profile: UserProfile, peers: UserProfile[] = []) {
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
        featured: unfiltered.featured.filter(e => eligible(e) && !isSecondaryRecord(e)).sort(compareRecordPriority),
        recent: unfiltered.recent.filter(eligible).sort((a, b) => b.day.localeCompare(a.day) || compareRecordPriority(a, b)),
      }
    : null;
  return {
    ...result,
    data: data as PublishedInsights | null,
    rebuilding: Boolean(result.data && !data),
  };
}
