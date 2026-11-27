import { localFirstCache } from './local-first-cache.js';
import { invalidateSessionReads } from './account-scope.js';
import { logger } from './logger.js';

const listeners = new Set();
const invalidators = new Set();

export function registerSessionMutationInvalidator(invalidator) {
    if (typeof invalidator !== 'function') throw new Error('Session invalidator must be a function');
    invalidators.add(invalidator);
    return () => invalidators.delete(invalidator);
}

export function registerSessionMutationListener(listener) {
    if (typeof listener !== 'function') throw new Error('Session mutation listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// Publish only after the persisted write succeeds. Invalidate generations before
// awaiting storage so no in-flight read can repopulate a deleted/stale snapshot.
// A writeSessionDocument result proves preflight invalidation; reuse it instead
// of turning redundant post-commit storage work into a failed backend save.
export async function publishSessionMutation(detail, { invalidationVerified = false } = {}) {
    if (!detail?.userId) throw new Error('Session mutation requires an owner UID');
    invalidateSessionReads(detail.userId);
    const invalidations = [];
    for (const invalidate of invalidators) invalidations.push(invalidate(detail));
    await Promise.all([
        ...invalidations,
        ...(invalidationVerified ? [] : [
            localFirstCache.clearByPrefix(`history:${detail.userId}:`),
            localFirstCache.clearByPrefix(`calendar:${detail.userId}:`),
            localFirstCache.remove(`progress:sessions:${detail.userId}`),
            localFirstCache.clearByPrefix(`daily-hub:${detail.userId}:`),
        ]),
    ]);
    for (const listener of listeners) {
        try {
            await listener(Object.freeze({ kind: 'save', ...detail }));
        } catch (error) {
            logger.warn('Could not refresh a session mutation subscriber:', error);
        }
    }
}
