import { describe, expect, it } from 'vitest';
import {
    getExpectedWebhookSubscriptionKeys,
    isAuthorizedWebhookMaintenanceRequest,
    WEBHOOK_EVENT_TYPES,
} from '../api/webhook/setup';

describe('Oura webhook subscription coverage', () => {
    it('requires create, update, and delete subscriptions for every selected data type', () => {
        expect(WEBHOOK_EVENT_TYPES).toEqual(['create', 'update', 'delete']);
        expect(getExpectedWebhookSubscriptionKeys(['sleep', 'daily_sleep'])).toEqual([
            'create:sleep',
            'update:sleep',
            'delete:sleep',
            'create:daily_sleep',
            'update:daily_sleep',
            'delete:daily_sleep',
        ]);
    });

    it('keeps subscription maintenance behind the cron secret', () => {
        expect(isAuthorizedWebhookMaintenanceRequest('Bearer secret-value', 'secret-value')).toBe(true);
        expect(isAuthorizedWebhookMaintenanceRequest('Bearer wrong', 'secret-value')).toBe(false);
        expect(isAuthorizedWebhookMaintenanceRequest('', 'secret-value')).toBe(false);
        expect(isAuthorizedWebhookMaintenanceRequest('Bearer secret-value', undefined)).toBe(false);
    });
});
