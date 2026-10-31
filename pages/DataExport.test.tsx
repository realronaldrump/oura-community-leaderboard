import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataExport from './DataExport';
import { createEmptyDailyStats } from '../test/helpers';

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
    afterEach(cleanup);
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

        expect(await screen.findByRole('heading', { name: 'Complete data' })).toBeInTheDocument();
        fireEvent.click(screen.getByText('Choose individual collections'));
        expect(screen.getByText('Ring Battery Level')).toBeInTheDocument();
        expect(screen.getByText('personal_info')).toBeInTheDocument();
        expect(screen.getByText(/Everything currently saved from Oura/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Download complete JSON/i }));

        expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    });

    it('filters only selected data types in analysis CSVs and preserves them in the complete export', async () => {
        const day = '2026-10-30';
        const earlier = '2026-10-29';
        mocks.useUser.mockReturnValue({ activeProfile: {
            id: 'profile-1', grantedScopes: ['daily'],
            dataExclusionRanges: [{ id: 'bad-sleep', startDay: day, endDay: day, sources: ['sleep', 'session', 'sleepTime'] }],
        } });
        mocks.getStoredDailyStats.mockResolvedValue(createEmptyDailyStats({
            sleep: [{ id: 'bad', day, score: 5, contributors: {} }, { id: 'good', day: earlier, score: 80, contributors: {} }],
            activity: [{ id: 'activity', day, steps: 12000, score: 85, active_calories: 500, target_calories: 600, total_calories: 2500, contributors: {} }],
        }));
        const readDownload = () => new Promise<string>((resolve, reject) => {
            const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob;
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsText(blob);
        });
        render(<DataExport />);
        await screen.findByRole('heading', { name: 'Complete data' });
        fireEvent.click(screen.getByText('Individual tables'));
        fireEvent.click(screen.getByRole('button', { name: /Sleep scores/i }));
        const sleepCsv = await readDownload();
        expect(sleepCsv).toContain(earlier);
        expect(sleepCsv).not.toContain(day);
        fireEvent.click(screen.getByRole('button', { name: /Activity scores/i }));
        expect(await readDownload()).toContain(day);
        fireEvent.click(screen.getByRole('button', { name: /Download complete JSON/i }));
        const rawJson = await readDownload();
        expect(rawJson).toContain('"id": "bad"');
        expect(rawJson).toContain('"score": 5');
    });

    it('labels corrected analysis scores and preserves the original raw export', async () => {
        const day = '2026-04-03';
        mocks.useUser.mockReturnValue({ activeProfile: {
            id: 'profile-1', scoreCorrections: [{ id: 'checked', day, source: 'oura_app', sleepScore: 78, readinessScore: 82 }],
        } });
        mocks.getStoredDailyStats.mockResolvedValue(createEmptyDailyStats({ activity: [{ id: 'a', day, score: 90, steps: 7000, contributors: {}, active_calories: 300, target_calories: 500, total_calories: 2000 }] }));
        const readDownload = () => new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result)); reader.onerror = reject;
            reader.readAsText(vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob);
        });
        render(<DataExport />);
        await screen.findByRole('heading', { name: 'Complete data' });
        fireEvent.click(screen.getByText('Individual tables'));
        fireEvent.click(screen.getByRole('button', { name: /Sleep scores/i }));
        expect(await readDownload()).toContain('oura_app');
        fireEvent.click(screen.getByRole('button', { name: /Download complete JSON/i }));
        const raw = await readDownload();
        expect(raw).not.toContain('oura-app:');
        expect(raw).not.toContain('"score": 78');
        expect(raw).not.toContain('scoreCorrections');
    });
});
