const queues = new Map();

export function cacheOwnerForPrefix(prefix) {
    const match = /^(?:history|calendar|daily-hub):([^:]+):/.exec(prefix)
        || /^progress:sessions:([^:]+)$/.exec(prefix);
    return match ? `user:${match[1]}` : `prefix:${prefix}`;
}

export function withCacheMutationLock(owner, operation) {
    const name = `gym-cache-mutation:${owner}`;
    if (typeof globalThis.navigator?.locks?.request === 'function') return navigator.locks.request(name, operation);
    // Same-realm fallback also serializes independent cache objects in tests.
    const previous = queues.get(name) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    queues.set(name, next);
    return next.finally(() => { if (queues.get(name) === next) queues.delete(name); });
}
