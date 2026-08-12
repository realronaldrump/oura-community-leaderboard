import { describe, expect, it } from 'vitest';
import { hasCompleteWebhookCoverage, isAuthorizedCronRequest } from '../api/cron/oura-sync';

describe('daily Oura safety sync authorization', () => {
    it('accepts only the exact Vercel bearer secret', () => {
        expect(isAuthorizedCronRequest('Bearer secret-value', 'secret-value')).toBe(true);
        expect(isAuthorizedCronRequest('Bearer wrong', 'secret-value')).toBe(false);
        expect(isAuthorizedCronRequest('', 'secret-value')).toBe(false);
        expect(isAuthorizedCronRequest('Bearer secret-value', undefined)).toBe(false);
    });

    it('reports webhook maintenance only when every expected subscription is active', () => {
        expect(hasCompleteWebhookCoverage({
            configured: true,
            dataTypes: ['sleep', 'daily_sleep'],
            eventTypes: ['create', 'update', 'delete'],
            created: [{}, {}],
            renewed: [{}],
            existing: [{}, {}, {}],
        })).toBe(true);
        expect(hasCompleteWebhookCoverage({
            configured: true,
            dataTypes: ['sleep'],
            eventTypes: ['create', 'update', 'delete'],
            existing: [{}, {}],
        })).toBe(false);
        expect(hasCompleteWebhookCoverage({ configured: false })).toBe(false);
    });
});
