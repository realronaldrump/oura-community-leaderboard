import { describe, expect, it } from 'vitest';
import { getAuthUrl } from './constants';

describe('Oura authorization request', () => {
    it('requests the canonical Oura V2 SpO2 scope', () => {
        const scope = new URL(getAuthUrl('test-state')).searchParams.get('scope')?.split(' ') ?? [];

        expect(scope).toContain('spo2Daily');
        expect(scope).not.toContain('spo2');
    });
});
