import { describe, expect, it } from 'vitest';
import { isAuthorizedCronRequest } from '../api/cron/oura-sync';

describe('daily Oura safety sync authorization', () => {
    it('accepts only the exact Vercel bearer secret', () => {
        expect(isAuthorizedCronRequest('Bearer secret-value', 'secret-value')).toBe(true);
        expect(isAuthorizedCronRequest('Bearer wrong', 'secret-value')).toBe(false);
        expect(isAuthorizedCronRequest('', 'secret-value')).toBe(false);
        expect(isAuthorizedCronRequest('Bearer secret-value', undefined)).toBe(false);
    });
});
