import React from 'react';
import type { DataExclusionSource, UserProfile } from '../../types';
import { isDayExcludedByRanges } from '../../utils/dataExclusions';

export type MeasurementAvailability = 'available' | 'ignored' | 'loading' | 'unavailable' | 'not_reported';

export const measurementAvailability = ({ value, source, day, profile, loading = false, error = false }: {
    value: number | null | undefined;
    source: DataExclusionSource;
    day: string;
    profile: Pick<UserProfile, 'dataExclusionRanges'>;
    loading?: boolean;
    error?: boolean;
}): MeasurementAvailability => {
    if (isDayExcludedByRanges(day, profile.dataExclusionRanges, source)) return 'ignored';
    if (value != null) return 'available';
    if (loading) return 'loading';
    if (error) return 'unavailable';
    return 'not_reported';
};

export const MEASUREMENT_STATUS_LABELS: Record<MeasurementAvailability, string> = {
    available: '',
    ignored: 'Ignored',
    loading: 'Loading…',
    unavailable: 'Couldn’t load',
    not_reported: 'Not sent by Oura',
};

export default function MeasurementStatus({ status }: { status: MeasurementAvailability }) {
    return status === 'available' ? null : (
        <small className={`measurement-status measurement-status--${status}`}>
            {MEASUREMENT_STATUS_LABELS[status]}
        </small>
    );
}
