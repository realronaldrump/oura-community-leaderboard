import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ initialize: vi.fn(), full: vi.fn(), lite: vi.fn() }));
vi.mock('firebase/app', () => ({ initializeApp: mocks.initialize }));
vi.mock('firebase/firestore', () => ({ getFirestore: mocks.full }));
vi.mock('firebase/firestore/lite', () => ({ getFirestore: mocks.lite }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
it('does not initialize Firebase or either Firestore transport in mini PC mode', async () => {
  vi.stubEnv('VITE_OURA_API_URL', 'https://storage.example');
  const config = await import('./firebaseConfig');
  expect(config.db).toEqual({});
  expect(config.bootstrapDb).toEqual({});
  expect(mocks.initialize).not.toHaveBeenCalled();
  expect(mocks.full).not.toHaveBeenCalled();
  expect(mocks.lite).not.toHaveBeenCalled();
});
