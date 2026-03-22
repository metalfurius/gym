import { logger } from './logger.js';

const STORAGE_KEY = 'gym-tracker-firebase-usage';
const MAX_TRACKED_OPERATIONS = 200;

function canUseSessionStorage() {
    return typeof sessionStorage !== 'undefined';
}

function createInitialState() {
    return {
        sessionStartedAt: Date.now(),
        reads: 0,
        writes: 0,
        operations: []
    };
}

function safeParse(value, fallback) {
    if (!value) return fallback;

    try {
        return JSON.parse(value);
    } catch (error) {
        logger.warn('FirebaseUsageTracker: unable to parse saved state', error);
        return fallback;
    }
}

export class FirebaseUsageTracker {
    constructor() {
        this.state = this.loadState();
    }

    loadState() {
        if (!canUseSessionStorage()) {
            return createInitialState();
        }

        const state = safeParse(sessionStorage.getItem(STORAGE_KEY), null);
        if (!state || typeof state !== 'object') {
            return createInitialState();
        }

        return {
            sessionStartedAt: typeof state.sessionStartedAt === 'number' ? state.sessionStartedAt : Date.now(),
            reads: typeof state.reads === 'number' ? state.reads : 0,
            writes: typeof state.writes === 'number' ? state.writes : 0,
            operations: Array.isArray(state.operations) ? state.operations : []
        };
    }

    persist() {
        if (!canUseSessionStorage()) return;

        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        } catch (error) {
            logger.warn('FirebaseUsageTracker: unable to persist state', error);
        }
    }

    emitUpdate() {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('firebaseUsageUpdated', { detail: this.getSummary() }));
        }
    }

    recordOperation(type, count, operation, details = {}) {
        const safeCount = Math.max(0, Number(count) || 0);
        if (safeCount === 0) return;

        this.state.operations.unshift({
            timestamp: Date.now(),
            type,
            count: safeCount,
            operation,
            details
        });

        if (this.state.operations.length > MAX_TRACKED_OPERATIONS) {
            this.state.operations = this.state.operations.slice(0, MAX_TRACKED_OPERATIONS);
        }

        this.persist();
        this.emitUpdate();
    }

    trackRead(count = 1, operation = 'unknown', details = {}) {
        const safeCount = Math.max(0, Number(count) || 0);
        if (safeCount === 0) return;

        this.state.reads += safeCount;
        this.recordOperation('read', safeCount, operation, details);
    }

    trackWrite(count = 1, operation = 'unknown', details = {}) {
        const safeCount = Math.max(0, Number(count) || 0);
        if (safeCount === 0) return;

        this.state.writes += safeCount;
        this.recordOperation('write', safeCount, operation, details);
    }

    getSummary() {
        const now = Date.now();
        const sessionDurationMs = Math.max(0, now - this.state.sessionStartedAt);

        const readCost = (this.state.reads / 100000) * 0.06;
        const writeCost = (this.state.writes / 100000) * 0.18;

        const operationTotals = new Map();
        for (const operation of this.state.operations) {
            const key = `${operation.type}:${operation.operation}`;
            operationTotals.set(key, (operationTotals.get(key) || 0) + operation.count);
        }

        const topOperations = Array.from(operationTotals.entries())
            .map(([key, total]) => {
                const [type, operation] = key.split(':');
                return { type, operation, total };
            })
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        return {
            reads: this.state.reads,
            writes: this.state.writes,
            totalOperations: this.state.reads + this.state.writes,
            sessionStartedAt: this.state.sessionStartedAt,
            sessionDurationMs,
            estimatedCostUsd: Number((readCost + writeCost).toFixed(4)),
            topOperations,
            recentOperations: this.state.operations.slice(0, 20)
        };
    }

    reset() {
        this.state = createInitialState();
        this.persist();
        this.emitUpdate();
    }
}

export const firebaseUsageTracker = new FirebaseUsageTracker();

export default firebaseUsageTracker;
