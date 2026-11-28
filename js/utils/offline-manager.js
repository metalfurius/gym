/**
 * Offline Detection and Management
 * Detects offline state and provides user-friendly messaging.
 * Supports a durable queue for serializable operations.
 */

import { logger } from './logger.js';
import { toast } from './notifications.js';
import { DurableOutbox } from './durable-outbox.js';
import { t } from '../i18n.js';
import { createSecureId } from './secure-id.js';
import { orderOutboxEntries, causalFrontier, outboxOwner, stableOutboxJson, mergeOutboxConflict, validOutboxWeekKey, validOutboxId } from './outbox-order.js';
import { getWeekKeyForDate } from './quick-log.js';

const ACCOUNT_OPERATION_TYPES = new Set([
    'session.save', 'session.delete', 'quicklog.save', 'preferences.saveWeeklyTarget',
    'preferences.syncWeeklyState', 'routines.fetch',
]);
const isOwnerId = value => typeof value === 'string' && value.trim().length > 0;
const isWeekKey = validOutboxWeekKey;

function weeklyConflictDetails(error) {
    return { code: 'sync/conflict', currentRevision: error.result?.currentRevision ?? null,
        ...(isWeekKey(error.result?.weekKey) ? { weekKey: error.result.weekKey } : {}) };
}

function weeklyOperationWeek(entry) {
    const payload = entry.descriptor?.payload;
    if (isWeekKey(payload?.weekKey)) return payload.weekKey;
    // A server conflict receipt records the canonical week even if this legacy
    // descriptor predates weekKey, or the device later changes timezone.
    if (isWeekKey(entry.conflict?.weekKey)) return entry.conflict.weekKey;
    // Previously retained conflicts have only the original logical timestamp.
    // Match the legacy replay handler; never substitute the current clock or
    // mutate its immutable descriptor merely to resolve the local conflict.
    const timestamp = payload?.updatedAtIso;
    if (typeof timestamp !== 'string' || !timestamp || Number.isNaN(new Date(timestamp).getTime())) return null;
    return getWeekKeyForDate(new Date(timestamp));
}

// Optional immutable client-only metadata. Legacy descriptors have no observed
// IDs. This field never becomes a Firestore payload or a semantic dependency.
function observedWeeklyConflictIds(entry) {
    const descriptor = entry?.descriptor;
    if (descriptor?.type !== 'preferences.saveWeeklyTarget' || !Object.hasOwn(descriptor, 'observedWeeklyConflictIds')) return null;
    const ids = descriptor.observedWeeklyConflictIds;
    if (!Array.isArray(ids) || !ids.every(validOutboxId)) {
        throw Object.assign(new Error('Invalid observed weekly conflict identities'), { code: 'outbox/integrity' });
    }
    return [...new Set(ids)];
}

function isWeeklyConflictFor(entry, userId, weekKey) {
    return ['conflict', 'blocked'].includes(entry.status) && entry.descriptor?.type === 'preferences.saveWeeklyTarget'
        && entry.descriptor.payload?.userId === userId && (!entry.ownerId || entry.ownerId === userId)
        && weeklyOperationWeek(entry) === weekKey;
}

function createQueueId() {
    return createSecureId('offline');
}

function isSerializableDescriptor(descriptor) {
    return !!descriptor
        && typeof descriptor === 'object'
        && typeof descriptor.type === 'string'
        && descriptor.type.trim().length > 0;
}

function migrateDescriptor(descriptor, queueId) {
    if (['session.save', 'quicklog.save'].includes(descriptor?.type)
        && descriptor.payload?.userId && !descriptor.payload.sessionId) {
        return { ...descriptor, payload: { ...descriptor.payload, sessionId: `legacy-${queueId}` } };
    }
    return descriptor;
}

export class OfflineManager {
    constructor({ outbox = new DurableOutbox() } = {}) {
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        this.listeners = [];
        this.initialized = false;
        this.onlineHandler = null;
        this.offlineHandler = null;
        this.isProcessing = false;
        this.operationHandlers = new Map();
        this.operationScopes = new Map();
        this.pendingRestorePromise = null;
        this.queueRestored = false;
        this.queuePersistenceTail = Promise.resolve();
        this.outbox = outbox;
        this.pendingAcknowledgements = new Set();
        this.acknowledgementOutcomes = new Map();
        this.resolutionCriteria = new Map();
        this.acknowledged = new Map();
        this.knownIntents = new Map();
        this.stagedIds = new Set();
        this.unknownIds = new Set();
        this.executingIds = new Set();
        this.rpcSucceededIds = new Set();
        this.volatileAcceptedIds = new Set();
        this.retiredIntents = new Map();
        this.queueStateGeneration = 0;
        this.queueViewVerified = false;
        this.activeUserId = undefined;
        this.queueListeners = [];
        this.processingPromise = null;
    }

    /**
     * Initialize offline detection.
     */
    init() {
        if (this.initialized) return;

        this.onlineHandler = () => this.handleOnline();
        this.offlineHandler = () => this.handleOffline();

        window.addEventListener('online', this.onlineHandler);
        window.addEventListener('offline', this.offlineHandler);

        this.isOnline = navigator.onLine;
        if (!this.isOnline) {
            this.handleOffline();
        }

        this.restorePersistedQueue()
            .then(async () => {
                if (this.checkOnline() && !this.isProcessing && this.pendingOperations.length > 0) {
                    try {
                        await this.processPendingOperations();
                    } catch (error) {
                        logger.error('Failed to process restored offline queue on init:', error);
                    }
                }
            })
            .catch((error) => {
                logger.warn('Could not restore persisted offline queue:', error);
            });

        this.initialized = true;
        logger.info('OfflineManager initialized');
    }

    /**
     * Clean up event listeners and resources.
     */
    destroy() {
        if (this.onlineHandler) {
            window.removeEventListener('online', this.onlineHandler);
        }
        if (this.offlineHandler) {
            window.removeEventListener('offline', this.offlineHandler);
        }

        this.onlineHandler = null;
        this.offlineHandler = null;
        this.initialized = false;
        this.listeners = [];
        // Destruction is a lifecycle event, not authorization to erase durable work.
        this.pendingOperations = this.pendingOperations.filter(entry => isSerializableDescriptor(entry.descriptor));

        logger.info('OfflineManager destroyed');
    }

    /**
     * Register a durable queue operation handler.
     * @param {string} type - Descriptor type key.
     * @param {Function} handler - Async handler that receives descriptor payload.
     */
    registerOperationHandler(type, handler, { scope = 'account' } = {}) {
        if (typeof type !== 'string' || type.trim().length === 0 || typeof handler !== 'function') {
            throw new Error('registerOperationHandler requires a type and a handler function');
        }
        if (!['account', 'global'].includes(scope) || (scope === 'global' && ACCOUNT_OPERATION_TYPES.has(type))) {
            throw new Error('Account operations require an explicit owner UID');
        }

        this.operationHandlers.set(type, handler);
        this.operationScopes.set(type, scope);
    }

    /**
     * Remove a registered durable queue operation handler.
     * @param {string} type - Descriptor type key.
     */
    removeOperationHandler(type) {
        this.operationHandlers.delete(type);
        this.operationScopes.delete(type);
    }

    /**
     * Restore persisted serializable operations from local-first storage.
     */
    async restorePersistedQueue() {
        if (this.pendingRestorePromise) {
            return this.pendingRestorePromise;
        }

        const generation = this.queueStateGeneration;
        this.pendingRestorePromise = (async () => {
            const state = await this.outbox.read();
            if (generation === this.queueStateGeneration) this.applyOutboxState(state);
        })();

        try {
            await this.pendingRestorePromise;
            this.queueRestored = true;
        } catch (error) {
            if (error.code === 'outbox/integrity') this.queueViewVerified = false;
            throw error;
        } finally {
            this.pendingRestorePromise = null;
        }
    }

    applyOutboxState(state) {
        this.queueViewVerified = false;
        // A live tab can retain a verified terminal receipt after its storage
        // was evicted. Repair that proof atomically with the next batch; never
        // infer that an absent parent succeeded, or forget its cancellation.
        for (const [id, outcome] of this.acknowledged) {
            const entry = this.knownIntents.get(id) || this.retiredIntents.get(id);
            if (!entry || !['accepted', 'cancelled', 'resolved'].includes(outcome)
                || state.acknowledgements?.get(id) === outcome
                || state.acknowledgements?.get(id) === 'accepted') continue;
            this.retiredIntents.set(id, entry);
            this.pendingAcknowledgements.add(id);
            this.acknowledgementOutcomes.set(id, outcome);
        }
        this.knownIntents = state.intents || new Map(state.entries.map(entry => [entry.id, entry]));
        this.acknowledged = state.acknowledgements || new Map([...state.acknowledged].map(id => [id, 'accepted']));
        for (const id of this.volatileAcceptedIds) this.acknowledged.set(id, 'accepted');
        for (const entry of this.pendingOperations.filter(item => this.stagedIds.has(item.id))) {
            const prior = this.knownIntents.get(entry.id);
            if (prior && stableOutboxJson(migrateDescriptor(prior.descriptor, prior.id)) !== stableOutboxJson(entry.descriptor)) {
                entry.status = 'quarantined'; entry.quarantineReason = 'identity-conflict';
                throw Object.assign(new Error('Conflicting durable outbox identity'), { code: 'outbox/integrity' });
            }
        }
        for (const id of state.acknowledged) {
            this.stagedIds.delete(id); this.unknownIds.delete(id);
            if (this.acknowledged.get(id) === 'accepted' || this.acknowledgementOutcomes.get(id) === this.acknowledged.get(id)) {
                this.pendingAcknowledgements.delete(id); this.acknowledgementOutcomes.delete(id); this.retiredIntents.delete(id); this.rpcSucceededIds.delete(id);
                this.resolutionCriteria.delete(id);
            }
        }
        const current = new Map(this.pendingOperations.filter(item => !state.acknowledged.has(item.id)).map(item => [item.id, item]));
        for (const persistedItem of state.entries) {
            if (!isSerializableDescriptor(persistedItem.descriptor) || this.pendingAcknowledgements.has(persistedItem.id)) continue;
            observedWeeklyConflictIds(persistedItem);
            const prior = current.get(persistedItem.id);
            const entry = { ...persistedItem, operation: prior?.operation || null,
                description: persistedItem.description || t('offline.queued_when_online'), timestamp: persistedItem.timestamp ?? 0,
                descriptor: migrateDescriptor(persistedItem.descriptor, persistedItem.id) };
            if (prior?.status === 'conflict' || entry.status === 'conflict') {
                entry.status = 'conflict';
                entry.conflict = mergeOutboxConflict(entry.conflict, prior?.conflict);
            }
            if (this.getOperationOwnership(entry).kind === 'unowned') entry.status = 'unowned';
            current.set(entry.id, entry); this.stagedIds.delete(entry.id); this.unknownIds.delete(entry.id);
        }
        this.pendingOperations = [...current.values()]; this.getOrderedPendingOperations(); this.queueViewVerified = true;
    }

    getPersistableQueue() {
        return this.getOrderedPendingOperations()
            .filter((item) => isSerializableDescriptor(item.descriptor))
            .map(item => this.persistableEntry(item));
    }

    persistableEntry(item) {
        return {
            id: item.id,
            description: item.description,
            timestamp: item.timestamp,
            predecessorIds: item.predecessorIds || [],
            semanticDependencyIds: item.semanticDependencyIds || [],
            ...(item.status ? { status: item.status } : {}),
            ...(item.conflict ? { conflict: item.conflict } : {}),
            ...(item.scope ? { scope: item.scope } : {}),
            ...(item.ownerId ? { ownerId: item.ownerId } : {}),
            descriptor: item.descriptor
        };
    }

    async persistQueue() {
        const persist = async () => {
            let receipt; let attemptedIds = [...this.stagedIds]; let appendStarted = false;
            try {
                await this.restorePersistedQueue();
                attemptedIds = [...this.stagedIds];
                const acknowledgements = [...this.pendingAcknowledgements].map(id => {
                    const entry = this.pendingOperations.find(item => item.id === id) || this.knownIntents.get(id) || this.retiredIntents.get(id);
                    return { id, outcome: this.acknowledgementOutcomes.get(id) || 'accepted',
                        ...(entry ? { entry: this.persistableEntry(entry) } : {}),
                        ...(this.resolutionCriteria.has(id) ? { resolution: this.resolutionCriteria.get(id) } : {}) };
                });
                const entries = this.getPersistableQueue(); appendStarted = true;
                receipt = await this.outbox.save(entries, acknowledgements);
                if (!receipt?.committed) throw new Error('Outbox did not return a commit receipt');
                ++this.queueStateGeneration;
                for (const id of receipt.committedIds) { this.stagedIds.delete(id); this.unknownIds.delete(id); }
                for (const ack of acknowledgements) {
                    if (!receipt.committedIds.includes(ack.id)) continue;
                    this.pendingAcknowledgements.delete(ack.id); this.acknowledgementOutcomes.delete(ack.id);
                    this.resolutionCriteria.delete(ack.id);
                    this.retiredIntents.delete(ack.id);
                    this.acknowledged.set(ack.id, receipt.state?.acknowledgements.get(ack.id) || ack.outcome); this.rpcSucceededIds.delete(ack.id);
                    this.pendingOperations = this.pendingOperations.filter(entry => entry.id !== ack.id);
                }
            } catch (error) {
                if (!appendStarted) { error.provenNotCommitted = true; error.attemptedIds = attemptedIds; }
                if (error.code === 'outbox/resolution-changed') {
                    for (const id of error.resolutionIds || []) {
                        if (!this.resolutionCriteria.has(id) || this.acknowledgementOutcomes.get(id) !== 'resolved') continue;
                        this.pendingAcknowledgements.delete(id); this.acknowledgementOutcomes.delete(id); this.resolutionCriteria.delete(id);
                    }
                } else if (error.provenNotCommitted === true) {
                    const rollback = new Set((error.attemptedIds || attemptedIds).filter(id => this.stagedIds.has(id)
                        && !this.knownIntents.has(id) && !this.unknownIds.has(id)));
                    for (const entry of this.pendingOperations) if (rollback.has(entry.id)) this.retiredIntents.set(entry.id, this.persistableEntry(entry));
                    this.pendingOperations = this.pendingOperations.filter(entry => !rollback.has(entry.id));
                    for (const id of rollback) {
                        this.stagedIds.delete(id);
                        // A later independent staged intent may have observed
                        // this ID. Persist cancellation with that next batch;
                        // this is never acceptance proof for semantic children.
                        this.pendingAcknowledgements.add(id); this.acknowledgementOutcomes.set(id, 'cancelled');
                    }
                } else for (const id of attemptedIds) this.unknownIds.add(id);
                throw error;
            }
            // The receipt contains the causal snapshot prepared before commit.
            // A shared older read or failed refresh cannot erase that proof.
            if (receipt.state) {
                try { this.applyOutboxState(receipt.state); }
                catch (error) { this.queueViewVerified = false; logger.warn('Committed outbox requires graph review:', error); }
            } else this.queueViewVerified = false;
            // A refresh/listener failure after this point cannot revoke commit.
            try { await this.restorePersistedQueue(); } catch (error) { logger.warn('Outbox committed; refresh deferred:', error); }
            return receipt;
        };
        const next = this.queuePersistenceTail.then(persist);
        this.queuePersistenceTail = next.catch(error => logger.warn('Failed to persist offline queue:', error));
        return next;
    }

    getOrderedPendingOperations() {
        const all = new Map([...this.knownIntents, ...this.retiredIntents]);
        for (const entry of this.pendingOperations) if (!all.has(entry.id)) all.set(entry.id, entry);
        this.pendingOperations = orderOutboxEntries(this.pendingOperations.map(entry => {
            if (entry.status !== 'blocked') return entry;
            const original = { ...entry }; delete original.status; delete original.blockedReason; return original;
        }), [...all.values()]);
        const failed = new Set([...this.acknowledged].filter(([_id, outcome]) => outcome !== 'accepted').map(([id]) => id));
        const known = new Set([...all.keys(), ...this.acknowledged.keys()]);
        for (const entry of this.pendingOperations) {
            if (['conflict', 'quarantined', 'unowned'].includes(entry.status)) failed.add(entry.id);
            else if ((entry.semanticDependencyIds || []).some(parent => failed.has(parent) || !known.has(parent))) {
                entry.status = 'blocked'; entry.blockedReason = 'semantic-parent-unaccepted'; failed.add(entry.id);
            }
        }
        return this.pendingOperations;
    }

    canExecuteOperation(id) {
        return this.isEntryEligible(this.getOrderedPendingOperations().find(item => item.id === id));
    }

    isEntryEligible(entry) {
        if (!entry || ['conflict', 'quarantined', 'unowned'].includes(entry.status)) return false;
        if (entry.descriptor && (!this.queueViewVerified || this.stagedIds.has(entry.id) || this.unknownIds.has(entry.id))) return false;
        const known = new Set([...this.knownIntents.keys(), ...this.pendingOperations.map(item => item.id)]);
        if ((entry.predecessorIds || []).some(parent => !known.has(parent) && !this.acknowledged.has(parent))) return false;
        return (entry.semanticDependencyIds || []).every(parent => this.acknowledged.get(parent) === 'accepted');
    }

    setActiveUser(userId) { this.activeUserId = userId || null; }

    getOperationOwnership(entry) {
        if (entry.descriptor) {
            const owner = entry.descriptor.payload?.userId;
            if (isOwnerId(owner) && (!entry.ownerId || entry.ownerId === owner)) return { kind: 'account', ownerId: owner };
            if (owner !== undefined || entry.ownerId || ACCOUNT_OPERATION_TYPES.has(entry.descriptor.type)) return { kind: 'unowned' };
            // A registered handler explicitly declares that this type never
            // accesses account data. Unknown legacy types are quarantined.
            if (this.operationScopes.get(entry.descriptor.type) === 'global') return { kind: 'global' };
            return { kind: 'unowned' };
        }
        if (isOwnerId(entry.ownerId)) return { kind: 'account', ownerId: entry.ownerId };
        return { kind: entry.scope === 'global' ? 'global' : 'unowned' };
    }

    belongsToActiveUser(entry) {
        const ownership = this.getOperationOwnership(entry);
        return ownership.kind === 'global' || (ownership.kind === 'account' && ownership.ownerId === this.activeUserId);
    }

    getObservedWeeklyConflictIds(userId, weekKey) {
        if (!this.queueViewVerified) throw Object.assign(new Error('Weekly conflict snapshot is not verified'), { code: 'outbox/unverified' });
        if (!isOwnerId(userId) || !isWeekKey(weekKey) || this.activeUserId !== userId) {
            throw Object.assign(new Error('Weekly conflict snapshot owner changed'), { code: 'sync/owner-changed' });
        }
        return this.getOrderedPendingOperations().filter(entry => isWeeklyConflictFor(entry, userId, weekKey)).map(entry => entry.id);
    }

    stageObservedWeeklyResolution(entry) {
        const ids = observedWeeklyConflictIds(entry);
        if (ids === null) return;
        const { userId, weekKey } = entry.descriptor.payload || {};
        if (!isOwnerId(userId) || !isWeekKey(weekKey) || (entry.ownerId && entry.ownerId !== userId)) {
            throw Object.assign(new Error('Invalid weekly resolution owner/week'), { code: 'outbox/integrity' });
        }
        const observed = new Set(ids);
        for (const prior of this.getOrderedPendingOperations()) {
            if (prior.id === entry.id || !observed.has(prior.id) || !isWeeklyConflictFor(prior, userId, weekKey)) continue;
            this.pendingAcknowledgements.add(prior.id); this.acknowledgementOutcomes.set(prior.id, 'resolved');
            this.resolutionCriteria.set(prior.id, { userId, weekKey, fallbackWeekKey: weeklyOperationWeek(prior) });
        }
    }

    async acknowledgeOperation(id) {
        const find = () => this.pendingOperations.find(entry => entry.id === id) || this.knownIntents.get(id) || this.retiredIntents.get(id);
        const resolvesObserved = observedWeeklyConflictIds(find()) !== null;
        try {
            if (resolvesObserved) {
                await this.restorePersistedQueue();
                // Stage both sides synchronously, then persist one atomic batch.
                // Before this point a failed read leaves the durable intent and
                // its observed IDs available for idempotent receipt recovery.
                this.stageObservedWeeklyResolution(find());
            }
            this.pendingAcknowledgements.add(id);
            this.acknowledgementOutcomes.set(id, 'accepted'); this.rpcSucceededIds.add(id);
            const receipt = await this.persistQueue();
            try { await this.notifyQueueChange(); } catch (error) { logger.warn('Acknowledged; queue observer failed:', error); }
            return receipt;
        } catch (error) {
            logger.warn('RPC accepted; acknowledgement remains pending:', error);
            if (resolvesObserved) throw error;
            return { committed: false, pending: true, error };
        }
    }

    async cancelOperation(id, outcome = 'cancelled') {
        this.pendingAcknowledgements.add(id); this.acknowledgementOutcomes.set(id, outcome);
        const receipt = await this.persistQueue();
        try { await this.notifyQueueChange(); } catch (error) { logger.warn('Cancelled; queue observer failed:', error); }
        return receipt;
    }

    async markConflict(id, error) {
        const entry = this.pendingOperations.find(item => item.id === id);
        if (entry) {
            const merged = mergeOutboxConflict(entry.conflict, weeklyConflictDetails(error));
            entry.status = 'conflict';
            entry.conflict = merged;
            await this.persistQueue();
            await this.notifyQueueChange();
        }
    }

    async resolveConflicts(userId, weekKey) {
        if (!isOwnerId(userId) || !isWeekKey(weekKey)) return;
        await this.restorePersistedQueue();
        const resolved = entry => isWeeklyConflictFor(entry, userId, weekKey);
        for (const entry of this.getOrderedPendingOperations()) {
            if (resolved(entry)) {
                this.pendingAcknowledgements.add(entry.id); this.acknowledgementOutcomes.set(entry.id, 'resolved');
                this.resolutionCriteria.set(entry.id, { userId, weekKey, fallbackWeekKey: weeklyOperationWeek(entry) });
            }
        }
        try { await this.persistQueue(); await this.notifyQueueChange(); }
        catch (error) {
            if (error.code === 'outbox/integrity') throw error;
            if (error.code === 'outbox/resolution-changed') { await this.restorePersistedQueue(); await this.notifyQueueChange(); }
            logger.warn('Conflict resolution remains pending:', error);
        }
    }

    addQueueListener(listener) { this.queueListeners.push(listener); }

    notifyQueueChange() {
        return Promise.allSettled(this.queueListeners.map(listener => Promise.resolve().then(listener)));
    }

    /**
     * Handle going offline.
     */
    handleOffline() {
        this.isOnline = false;
        logger.warn('App is now offline');
        try {
            toast.warning(t('offline.limited_features'), { duration: 5000 });
        } catch (e) {
            logger.debug('Toast not available', e);
        }

        this.notifyListeners(false);
    }

    /**
     * Handle coming back online.
     */
    async handleOnline() {
        this.isOnline = true;
        logger.info('App is now online');
        try {
            toast.success(t('offline.connection_restored'), { duration: 3000 });
        } catch (e) {
            logger.debug('Toast not available', e);
        }

        await this.notifyListeners(true);

        await this.restorePersistedQueue();

        if (!this.isProcessing && this.pendingOperations.length > 0) {
            try {
                await this.processPendingOperations();
            } catch (error) {
                logger.error('Failed to process pending operations:', error);
            }
        }
    }

    /**
     * Check if currently online.
     * @returns {boolean}
     */
    checkOnline() {
        return navigator.onLine;
    }

    /**
     * Execute operation with offline handling.
     * @param {Function} operation - Async operation to execute.
     * @param {string} errorMessage - User-friendly error message.
     * @param {boolean} queueIfOffline - Whether to queue operation for retry.
     * @param {Object|null} queueDescriptor - Serializable descriptor for durable queue.
     * @returns {Promise<*>}
     */
    async executeWithOfflineHandling(operation, errorMessage = undefined, queueIfOffline = false, queueDescriptor = null, queueOptions = {}) {
        if (typeof operation !== 'function') {
            throw new Error('Operation must be a function');
        }

        const resolvedErrorMessage = errorMessage ?? t('offline.default_error');

        if (queueIfOffline && isSerializableDescriptor(queueDescriptor)) {
            const id = this.queueOperation(null, resolvedErrorMessage, { ...queueOptions, descriptor: queueDescriptor });
            this.executingIds.add(id);
            try {
                try { await this.persistQueue(); }
                catch (error) {
                    if (error.provenNotCommitted === true && !this.unknownIds.has(id)) throw error;
                    throw this.queuedError(resolvedErrorMessage, id, error);
                }
                const entry = this.pendingOperations.find(item => item.id === id);
                if (!entry && this.acknowledged.get(id) === 'accepted') return undefined;
                if (!entry && this.acknowledged.has(id)) throw Object.assign(new Error('Cancelled operation requires a new intent'), { code: 'sync/cancelled', queueId: id });
                if (!this.checkOnline() || !this.belongsToActiveUser(entry) || !this.canExecuteOperation(id)) {
                    throw this.queuedError(resolvedErrorMessage, id);
                }
                let result;
                try { result = await operation(); }
                catch (error) {
                    if (error.code === 'sync/conflict') {
                        try { await this.markConflict(id, error); } catch (storageError) { logger.warn('Conflict retained; persistence deferred:', storageError); }
                        throw error;
                    }
                    if (this.isPermanentError(error)) {
                        try { await this.cancelOperation(id); }
                        catch (storageError) { throw this.queuedError(resolvedErrorMessage, id, storageError); }
                        throw error;
                    }
                    throw this.queuedError(resolvedErrorMessage, id, error);
                }
                // RPC acceptance is final even if ack, refresh or observers fail.
                await this.acknowledgeOperation(id);
                return result;
            } finally { this.executingIds.delete(id); }
        }

        if (!this.checkOnline()) {
            logger.warn('Operation attempted while offline');
            try {
                toast.error(resolvedErrorMessage, { duration: 4000 });
            } catch (e) {
                logger.debug('Toast not available', e);
            }

            if (queueIfOffline) {
                this.queueOperation(operation, resolvedErrorMessage, queueOptions);
                try {
                    toast.info(t('offline.queued_when_online'), { duration: 3000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
            }

            throw new Error(`Offline: ${resolvedErrorMessage}`);
        }

        try {
            return await operation();
        } catch (error) {
            if (this.isNetworkError(error)) {
                logger.error('Network error during operation:', error);
                try {
                    toast.error(t('offline.connection_error_retry'), { duration: 5000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }

                if (queueIfOffline) {
                    this.queueOperation(operation, resolvedErrorMessage, queueOptions);
                }
            }
            throw error;
        }
    }

    queuedError(message, queueId, cause) {
        return Object.assign(new Error(`Offline: ${message}`, cause ? { cause } : undefined), { code: 'sync/queued', queueId });
    }

    isPermanentError(error) {
        return ['permission-denied', 'unauthenticated', 'invalid-argument', 'failed-precondition'].includes(error.code)
            || /^(?:missing or insufficient permissions|permission denied)[.!]?$/i.test(error.message || '');
    }

    /**
     * Check if error is network-related.
     * @param {Error} error
     * @returns {boolean}
     */
    isNetworkError(error) {
        const networkErrors = [
            'network',
            'fetch',
            'timeout',
            'unavailable',
            'Failed to fetch',
            'NetworkError',
            'ERR_INTERNET_DISCONNECTED',
            'ERR_NETWORK_CHANGED'
        ];

        const errorString = error?.toString().toLowerCase() || '';
        return networkErrors.some((term) => errorString.includes(term.toLowerCase()));
    }

    /**
     * Queue operation for retry when online.
     * @param {Function|null} operation
     * @param {string} description
     * @param {Object} options
     * @param {Object|null} options.descriptor - Optional serializable descriptor.
     */
    queueOperation(operation, description, options = {}) {
        const descriptor = isSerializableDescriptor(options.descriptor) ? JSON.parse(JSON.stringify(options.descriptor)) : null;
        observedWeeklyConflictIds({ descriptor });
        const id = options.id || createQueueId();
        const prior = this.pendingOperations.find(item => item.id === id) || this.knownIntents.get(id);
        if (prior) {
            if (stableOutboxJson(prior.descriptor) !== stableOutboxJson(descriptor)) throw new Error('Conflicting durable outbox identity');
            return id;
        }
        if (this.acknowledged.has(id)) return id;
        if (this.pendingAcknowledgements.has(id)) return id;
        const queueEntry = {
            id,
            operation: typeof operation === 'function' ? operation : null,
            description,
            timestamp: Date.now(),
            ...(options.scope ? { scope: options.scope } : {}),
            ...(options.ownerId || descriptor?.payload?.userId ? { ownerId: options.ownerId || descriptor.payload.userId } : {}),
            predecessorIds: [], semanticDependencyIds: [],
            descriptor
        };
        if (descriptor) queueEntry.descriptor = migrateDescriptor(descriptor, queueEntry.id);
        if (this.getOperationOwnership(queueEntry).kind === 'unowned') queueEntry.status = 'unowned';
        queueEntry.predecessorIds = causalFrontier([...this.knownIntents.values(), ...this.retiredIntents.values(), ...this.pendingOperations], outboxOwner(queueEntry));
        this.pendingOperations.push(queueEntry);
        if (descriptor) this.stagedIds.add(id);
        this.getOrderedPendingOperations();
        logger.info(`Queued operation: ${description}`);

        return queueEntry.id;
    }

    resolveOperation(entry) {
        if (isSerializableDescriptor(entry.descriptor)) {
            const handler = this.operationHandlers.get(entry.descriptor.type);
            if (typeof handler === 'function') {
                return () => handler(entry.descriptor.payload);
            }
        }

        if (typeof entry.operation === 'function') {
            return entry.operation;
        }

        return null;
    }

    /**
     * Process all pending operations.
     */
    async processPendingOperations() {
        if (this.processingPromise) return this.processingPromise;
        const processing = this.processPendingOperationsInternal();
        this.processingPromise = processing;
        try { return await processing; }
        finally { if (this.processingPromise === processing) this.processingPromise = null; }
    }

    async processPendingOperationsInternal() {
        await this.persistQueue();

        if (!this.checkOnline()) return;
        if (this.pendingOperations.length === 0) return;
        if (this.isProcessing) {
            logger.debug('Already processing pending operations, skipping');
            return;
        }

        this.isProcessing = true;

        try {
            logger.info(`Processing ${this.pendingOperations.length} pending operations`);

            let successCount = 0;
            let failureCount = 0;
            const attempted = new Set();
            const nextEntry = () => this.getOrderedPendingOperations().find(entry => !attempted.has(entry.id)
                    && !this.executingIds.has(entry.id) && !this.rpcSucceededIds.has(entry.id) && !this.pendingAcknowledgements.has(entry.id)
                    && this.belongsToActiveUser(entry) && this.isEntryEligible(entry));
            for (let queueEntry = nextEntry(); queueEntry; queueEntry = nextEntry()) {
                attempted.add(queueEntry.id);
                const operationToRun = this.resolveOperation(queueEntry);
                if (!operationToRun) {
                    failureCount++;
                    logger.warn(`No handler found for queued operation: ${queueEntry.description}`);
                    continue;
                }

                try {
                    await operationToRun();
                    if (isSerializableDescriptor(queueEntry.descriptor)) await this.acknowledgeOperation(queueEntry.id);
                    else {
                        this.pendingOperations = this.pendingOperations.filter(entry => entry.id !== queueEntry.id);
                        this.acknowledged.set(queueEntry.id, 'accepted');
                        this.volatileAcceptedIds.add(queueEntry.id);
                    }
                    successCount++;
                    logger.info(`Completed queued operation: ${queueEntry.description}`);
                } catch (error) {
                    failureCount++;
                    logger.error(`Failed queued operation: ${queueEntry.description}`, error);
                    if (error.code === 'sync/conflict') {
                        const current = this.pendingOperations.find(entry => entry.id === queueEntry.id);
                        if (current) {
                            const merged = mergeOutboxConflict(current.conflict, weeklyConflictDetails(error));
                            current.status = 'conflict'; current.conflict = merged;
                        }
                    }
                }
                // Keep in-flight work durable until each individual acknowledgement.
                try { await this.persistQueue(); }
                catch (error) { logger.warn('Replay progress retained; storage retry required:', error); break; }
            }

            if (successCount > 0) {
                try {
                    toast.success(t('offline.operations_completed', { count: successCount }), { duration: 3000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
            }

            if (failureCount > 0) {
                try {
                    toast.warning(t('offline.operations_failed', { count: failureCount }), { duration: 4000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
            }
        } finally {
            this.isProcessing = false;
            try { await this.notifyQueueChange(); } catch (error) { logger.warn('Replay observer failed:', error); }
        }
    }

    /**
     * Register a listener for online/offline changes.
     * @param {Function} callback - Called with boolean (true = online, false = offline).
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove a listener.
     * @param {Function} callback
     */
    removeListener(callback) {
        this.listeners = this.listeners.filter((cb) => cb !== callback);
    }

    /**
     * Notify all listeners of state change.
     * @param {boolean} isOnline
     */
    async notifyListeners(isOnline) {
        const pending = [];
        for (const callback of this.listeners) {
            try {
                const result = callback(isOnline);
                if (result?.then) pending.push(result);
            } catch (error) {
                logger.error('Error in offline listener:', error);
            }
        }
        const results = await Promise.allSettled(pending);
        results.filter(result => result.status === 'rejected').forEach(result => logger.warn('Async offline listener failed:', result.reason));
    }

    /**
     * Get pending operations count.
     * @returns {number}
     */
    getPendingCount() {
        return this.pendingOperations.filter(entry => this.belongsToActiveUser(entry)).length;
    }

    getConflictCount() {
        return this.pendingOperations.filter(entry => this.belongsToActiveUser(entry) && entry.status === 'conflict').length;
    }

    getUnownedCount() {
        return this.pendingOperations.filter(entry => this.getOperationOwnership(entry).kind === 'unowned').length;
    }

    /**
     * Clear all pending operations.
     */
    clearPending() {
        for (const entry of this.pendingOperations) {
            if (isSerializableDescriptor(entry.descriptor)) {
                this.pendingAcknowledgements.add(entry.id); this.acknowledgementOutcomes.set(entry.id, 'cancelled'); this.stagedIds.delete(entry.id);
            }
        }
        this.pendingOperations = [];
        this.queueRestored = true;
        this.persistQueue().catch((error) => {
            logger.warn('Could not clear persisted offline queue:', error);
        });
        logger.info('Cleared all pending operations');
    }
}

export const offlineManager = new OfflineManager();
