import { describe, expect, it } from 'vitest';
import {
    getExpectedWebhookSubscriptionKeys,
    WEBHOOK_EVENT_TYPES,
} from './setup';

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
});
