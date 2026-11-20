// A UID alone is insufficient for A -> B -> A. Every auth transition creates
// a new generation; session mutations also invalidate reads started earlier.
let generation = 0;
let ownerId = null;
const revisions = new Map();

export function beginAccountSession(userId) {
    ownerId = userId || null;
    generation++;
    return generation;
}

export function getAccountOwnerId() {
    return ownerId;
}

export function captureAccountScope(userId, { mutations = true } = {}) {
    return Object.freeze({
        userId,
        generation,
        revision: mutations ? (revisions.get(userId) || 0) : null,
    });
}

export function isAccountScopeCurrent(scope, currentUserId) {
    return !!scope?.userId && scope.userId === currentUserId
        && scope.generation === generation
        && (scope.revision === null || scope.revision === (revisions.get(scope.userId) || 0));
}

export function invalidateSessionReads(userId) {
    revisions.set(userId, (revisions.get(userId) || 0) + 1);
}
