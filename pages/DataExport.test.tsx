import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DataExport from './DataExport';

const mocks = vi.hoisted(() => ({
    useUser: vi.fn(),
    getStoredDailyStats: vi.fn(),
    getProfileStatsMetadata: vi.fn(),
}));

vi.mock('../contexts/UserContext', () => ({
    useUser: mocks.useUser,
}));

vi.mock('../services/firestoreStatsService', () => ({
    getStoredDailyStats: mocks.getStoredDailyStats,
    getProfileStatsMetadata: mocks.getProfileStatsMetadata,
}));

describe('DataExport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.useUser.mockReturnValue({
            activeProfile: {
                id: 'profile-1',
                ouraUserId: 'oura-user-1',
                email: 'member@example.com',
                token: 'secret-access-token',
                refreshToken: 'secret-refresh-token',
                grantedScopes: ['daily', 'personal'],
            },
        });
        mocks.getStoredDailyStats.mockResolvedValue({
            sleep: [], readiness: [], activity: [], session: [], spo2: [], stress: [], resilience: [],
            heartrate: [], workout: [], guidedSession: [], sleepTime: [], tag: [], enhancedTag: [],
            restModePeriod: [], ringConfiguration: [], ringBatteryLevel: [{
                timestamp: '2026-07-30T12:00:00Z',
                timestamp_unix: 1_775_131_200_000,
                level: 65,
            }],
            cardiovascularAge: [], vo2Max: [],
        });
        mocks.getProfileStatsMetadata.mockResolvedValue({
            profileId: 'profile-1',
            schemaVersion: 2,
            oldestDay: null,
            newestDay: null,
            lastFullSyncAt: '2026-07-30T13:00:00Z',
            lastFullSyncSchemaVersion: 2,
            updatedAt: '2026-07-30T13:00:00Z',
        });
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:complete-export'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    it('offers a lossless JSON bundle and current per-collection CSVs', async () => {
        render(<DataExport />);

        expect(await screen.findByRole('heading', { name: 'Complete Raw Export' })).toBeInTheDocument();
        expect(screen.getByText('Ring Battery Level')).toBeInTheDocument();
        expect(screen.getByText('personal_info')).toBeInTheDocument();
        expect(screen.getByText(/All 19 collections/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Download Complete JSON/i }));

        expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    });
});
