import { describe, expect, it } from 'vitest';
import { getOuraEndpointCapabilities } from './ouraScopes';

describe('Oura endpoint scope capabilities', () => {
    it('maps current daily and personal scopes to every collection they authorize', () => {
        expect(getOuraEndpointCapabilities(['daily', 'personal'])).toMatchObject({
            daily: true,
            personal: true,
            spo2: false,
            stress: true,
            resilience: true,
            sleepTime: true,
            restModePeriod: true,
            cardiovascularAge: true,
            vo2Max: true,
            ringConfiguration: true,
            ringBatteryLevel: true,
            heartrate: false,
            workout: false,
            session: false,
            tag: false,
        });
    });

    it('optimistically attempts optional endpoints when a legacy token has no recorded scopes', () => {
        expect(Object.values(getOuraEndpointCapabilities(undefined)).every(Boolean)).toBe(true);
    });
});
