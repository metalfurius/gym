import { describe, expect, it, jest } from '@jest/globals';
import { createSecureId } from '../../js/utils/secure-id.js';

describe('persisted mutation identities', () => {
    it('uses browser crypto and generates distinct safe document/queue IDs', () => {
        const random = jest.spyOn(Math, 'random').mockImplementation(() => { throw new Error('insecure RNG used'); });
        try {
            const first = createSecureId('session'); const second = createSecureId('session');
            expect(first).toMatch(/^session-[\da-f-]{32,36}$/i);
            expect(second).not.toBe(first); expect(first).not.toContain('/');
        } finally { random.mockRestore(); }
    });

    it('uses getRandomValues on browsers without randomUUID and fails closed without secure entropy', () => {
        const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
        const getRandomValues = jest.fn(bytes => { bytes.fill(171); return bytes; });
        try {
            Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues } });
            expect(createSecureId('offline')).toBe(`offline-${'ab'.repeat(16)}`);
            expect(getRandomValues).toHaveBeenCalledTimes(1);
            Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
            expect(() => createSecureId('offline')).toThrow('Secure random');
        } finally { Object.defineProperty(globalThis, 'crypto', original); }
    });
});
