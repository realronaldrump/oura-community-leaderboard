import { DailyStats } from '../types';

const DB_NAME = 'oura_daily_stats_cache';
const DB_VERSION = 1;
const STORE_NAME = 'dailyStats';

export interface CachedDailyStats {
    profileId: string;
    data: DailyStats;
    lastSyncedAt: string;
    oldestDay: string | null;
    newestDay: string | null;
}

const openDB = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'profileId' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

const extractDayRange = (data: DailyStats): { oldest: string | null; newest: string | null } => {
    const allDays: string[] = [];
    const addDays = (items?: Array<{ day?: string }>) => {
        items?.forEach((item) => {
            if (item?.day) allDays.push(item.day);
        });
    };

    addDays(data.sleep);
    addDays(data.readiness);
    addDays(data.activity);
    addDays(data.session);
    addDays(data.spo2);
    addDays(data.stress);
    addDays(data.resilience);
    addDays(data.workout as Array<{ day?: string }>);

    if (allDays.length === 0) return { oldest: null, newest: null };

    allDays.sort();
    return { oldest: allDays[0], newest: allDays[allDays.length - 1] };
};

export const getCachedDailyStats = async (profileId: string): Promise<CachedDailyStats | null> => {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(profileId);

            request.onsuccess = () => resolve((request.result as CachedDailyStats) || null);
            request.onerror = () => {
                console.warn('Failed to read DailyStats cache:', request.error);
                resolve(null);
            };

            tx.oncomplete = () => db.close();
        });
    } catch (err) {
        console.warn('Failed to open DailyStats cache for read:', err);
        return null;
    }
};

export const setCachedDailyStats = async (profileId: string, data: DailyStats): Promise<void> => {
    try {
        const db = await openDB();
        const { oldest, newest } = extractDayRange(data);
        const entry: CachedDailyStats = {
            profileId,
            data,
            lastSyncedAt: new Date().toISOString(),
            oldestDay: oldest,
            newestDay: newest,
        };

        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(entry);

            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                console.warn('Failed to write DailyStats cache:', tx.error);
                db.close();
                resolve();
            };
        });
    } catch (err) {
        console.warn('Failed to open DailyStats cache for write:', err);
    }
};

export const deleteCachedDailyStats = async (profileId: string): Promise<void> => {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(profileId);

            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                console.warn('Failed to delete DailyStats cache entry:', tx.error);
                db.close();
                resolve();
            };
        });
    } catch (err) {
        console.warn('Failed to open DailyStats cache for delete:', err);
    }
};

export const clearAllCachedDailyStats = async (): Promise<void> => {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.clear();

            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                console.warn('Failed to clear DailyStats cache:', tx.error);
                db.close();
                resolve();
            };
        });
    } catch (err) {
        console.warn('Failed to open DailyStats cache for clear:', err);
    }
};
