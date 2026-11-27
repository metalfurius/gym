// Persisted identities must remain unpredictable when they become document IDs.
export function createSecureId(prefix) {
    if (typeof globalThis.crypto?.randomUUID === 'function') return `${prefix}-${globalThis.crypto.randomUUID()}`;
    if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('Secure random identifiers are unavailable');
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
