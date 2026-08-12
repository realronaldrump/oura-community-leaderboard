import { isValidProfileId } from '../api/profiles/remove';

describe('profile removal validation', () => {
    it('accepts Firestore-safe application profile ids', () => {
        expect(isValidProfileId('profile_123-ABC')).toBe(true);
    });

    it.each(['', '../profiles', 'has/slash', 'has space', 'x'.repeat(129), null])(
        'rejects an unsafe profile id: %s',
        (value) => expect(isValidProfileId(value)).toBe(false)
    );
});
