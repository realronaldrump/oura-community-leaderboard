import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firebaseService } from './firebaseService';
import type { DataExclusionRange } from '../types';
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), write: vi.fn() }));
vi.mock('./firebaseConfig', () => ({ db: {}, bootstrapDb: {} }));
vi.mock('./documentClient', () => ({
    collection: vi.fn(), doc: (...parts: unknown[]) => parts.slice(1).join('/'),
    setDoc: vi.fn(), deleteDoc: vi.fn(), onSnapshot: vi.fn(), runTransaction: (...args: unknown[]) => mocks.transaction(...args),
}));
vi.mock('./documentClientLite', () => ({ collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe('exclusion persistence', () => {
    it('saves score corrections without changing exclusions or raw data', async () => {
        mocks.transaction.mockImplementation(async (_db, callback) => callback({
            get: async () => ({ exists: () => true, data: () => ({ dataExclusionRanges: [{ id: 'keep' }], scoreCorrections: [] }) }), set: mocks.write,
        }));
        const correction = { id: 'checked', day: '2026-04-03', source: 'oura_app' as const, sleepScore: 78 };
        expect(await firebaseService.updateScoreCorrections('profile-1', latest => [...latest, correction])).toEqual([correction]);
        expect(mocks.write).toHaveBeenCalledWith('profiles/profile-1', { scoreCorrections: [correction], lastUpdated: expect.any(String) }, { merge: true });
    });
    it('reapplies a day edit to the latest profile on a transaction retry and patches only exclusion fields', async () => {
        const concurrent: DataExclusionRange = { id: 'other-day', startDay: '2026-10-29', endDay: '2026-10-29', sources: ['activity'] };
        mocks.transaction.mockImplementation(async (_db, callback) => {
            await callback({ get: async () => ({ exists: () => true, data: () => ({ dataExclusionRanges: [] }) }), set: () => {} });
            return callback({ get: async () => ({ exists: () => true, data: () => ({ dataExclusionRanges: [concurrent], firstName: 'Updated elsewhere' }) }), set: mocks.write });
        });
        const edit = vi.fn((ranges: DataExclusionRange[]) => [...ranges, { id: 'new', startDay: '2026-10-30', endDay: '2026-10-30', sources: ['sleep' as const] }]);
        const saved = await firebaseService.updateDataExclusions('profile-1', edit);
        expect(edit).toHaveBeenCalledTimes(2);
        expect(saved.map(range => range.id)).toEqual(['other-day', 'new']);
        expect(mocks.write).toHaveBeenCalledWith('profiles/profile-1', { dataExclusionRanges: saved, lastUpdated: expect.any(String) }, { merge: true });
    });

    it('fails instead of recreating a profile removed while an editor was open', async () => {
        mocks.transaction.mockImplementation(async (_db, callback) => callback({ get: async () => ({ exists: () => false }), set: mocks.write }));
        await expect(firebaseService.updateDataExclusions('removed', () => [])).rejects.toThrow('no longer available');
        expect(mocks.write).not.toHaveBeenCalled();
    });
});
