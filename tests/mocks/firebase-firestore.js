import {
    MockTimestamp,
    __cloneMockValue,
    __createDocumentId,
    __createDocumentSnapshot,
    __resolveQuerySource,
    __applyWhereConstraints,
    __applyOrderByConstraints,
    __applyStartAfterConstraint,
    __applyLimitConstraint,
    __buildQuerySnapshot,
    __collectionPathSegmentsToString,
    __firestoreState,
} from './firebase-state.js';

const firestoreInstance = {
    __isMockFirestore: true,
};

let firestoreWriteFailuresRemaining = 0;
let firestoreWriteFailureError = null;
let firestoreWriteFailurePath = null;
let batchCommitCalls = 0;
let batchCommitFailureCall = 0;
let batchCommitFailureError = null;
let batchCommitGate = null;
let transactionBeforeCommit = null;
let transactionAuthorization = null;
let queryResultHandler = null;
let documentResultHandler = null;
let transactionAttempts = 0;

function ensureCollectionRef(collectionRef) {
    if (!collectionRef || collectionRef.__type !== 'collection') {
        throw new Error('Expected collection reference');
    }
}

function ensureDocRef(docRef) {
    if (!docRef || docRef.__type !== 'doc') {
        throw new Error('Expected document reference');
    }
}

function resolveDocumentPath(firstArg, segments) {
    if (firstArg && firstArg.__type === 'collection') {
        const [id] = segments;
        return `${firstArg.path}/${id}`;
    }

    return __collectionPathSegmentsToString(segments);
}

export function getFirestore(_app) {
    return firestoreInstance;
}

export function collection(_db, ...segments) {
    return {
        __type: 'collection',
        path: __collectionPathSegmentsToString(segments),
    };
}

export function doc(firstArg, ...segments) {
    const path =
        firstArg?.__type === 'collection' && segments.length === 0
            ? `${firstArg.path}/${__createDocumentId()}`
            : resolveDocumentPath(firstArg, segments);
    return {
        __type: 'doc',
        path,
        id: path.split('/').pop(),
    };
}

export function query(source, ...constraints) {
    return {
        __type: 'query',
        source,
        constraints,
    };
}

export function orderBy(field, direction = 'asc') {
    return {
        __constraint: 'orderBy',
        field,
        direction,
    };
}

export function where(field, operator, value) {
    return {
        __constraint: 'where',
        field,
        operator,
        value,
    };
}

export function limit(count) {
    return {
        __constraint: 'limit',
        count,
    };
}

export function startAfter(snapshot) {
    return {
        __constraint: 'startAfter',
        snapshot,
    };
}

export async function addDoc(collectionRef, data) {
    ensureCollectionRef(collectionRef);

    if (firestoreWriteFailuresRemaining > 0) {
        firestoreWriteFailuresRemaining -= 1;
        if (firestoreWriteFailureError) {
            throw firestoreWriteFailureError;
        }
        throw new Error('Failed to fetch');
    }

    const id = __createDocumentId();
    const path = `${collectionRef.path}/${id}`;
    __firestoreState.documents.set(path, __cloneMockValue(data));

    return {
        id,
        path,
    };
}

export function __setMockAddDocFailures(count = 1, error = null) {
    const normalizedCount = Math.max(0, Number(count) || 0);
    firestoreWriteFailuresRemaining = normalizedCount;
    firestoreWriteFailureError = error;
}

export function __setMockSetDocFailures(count = 1, error = null) {
    firestoreWriteFailuresRemaining = Math.max(0, Number(count) || 0);
    firestoreWriteFailureError = error;
}

export function __setMockSessionWriteFailures(count = 1, error = new Error('Failed to fetch')) {
    firestoreWriteFailuresRemaining = count;
    firestoreWriteFailureError = error;
    firestoreWriteFailurePath = '/sesiones_entrenamiento/';
}

export function __setMockWriteFailuresForPath(path, count, error) {
    firestoreWriteFailuresRemaining = count;
    firestoreWriteFailureError = error;
    firestoreWriteFailurePath = path;
}

export function __resetMockFirestoreBehavior() {
    firestoreWriteFailuresRemaining = 0;
    firestoreWriteFailureError = null;
    firestoreWriteFailurePath = null;
    batchCommitCalls = 0;
    batchCommitFailureCall = 0;
    batchCommitFailureError = null;
    batchCommitGate = null;
    transactionBeforeCommit = null;
    transactionAuthorization = null;
    queryResultHandler = null;
    documentResultHandler = null;
    transactionAttempts = 0;
}

export function __setMockTransactionBeforeCommit(handler) { transactionBeforeCommit = handler; }
export function __setMockTransactionAuthorization(handler) { transactionAuthorization = handler; }
export function __getMockTransactionAttempts() { return transactionAttempts; }
export function __setMockQueryResultHandler(handler) { queryResultHandler = handler; }
export function __setMockDocumentResultHandler(handler) { documentResultHandler = handler; }

// MVCC-style mock: read snapshots are immutable, writes are staged, and the
// callback retries if any read document changed before the atomic commit.
// This intentionally knows nothing about workout/preference reducer behavior.
export async function runTransaction(_db, callback, { maxAttempts = 5 } = {}) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        transactionAttempts++;
        const reads = new Map();
        const writes = [];
        const result = await callback({
            async get(reference) {
                ensureDocRef(reference);
                if (writes.length) throw new Error('Transactions require reads before writes');
                const value = __firestoreState.documents.get(reference.path);
                reads.set(reference.path, JSON.stringify(value));
                return __createDocumentSnapshot(reference.path, __cloneMockValue(value));
            },
            set(reference, value, options = {}) { writes.push({ reference, value, options }); },
            delete(reference) { writes.push({ reference, remove: true }); },
        });
        if (transactionBeforeCommit) await transactionBeforeCommit({ attempt, reads, writes });
        // Real rules may reject against the latest state before the SDK sees an
        // optimistic precondition conflict. Authorization denial is not ABORTED
        // and must escape without an automatic mock/SDK retry.
        if (transactionAuthorization) await transactionAuthorization({ attempt, reads, writes });
        if ([...reads].some(([path, value]) => JSON.stringify(__firestoreState.documents.get(path)) !== value)) continue;
        if (writes.length && firestoreWriteFailuresRemaining > 0
            && (!firestoreWriteFailurePath || writes.some(write => write.reference.path.includes(firestoreWriteFailurePath)))) {
            firestoreWriteFailuresRemaining--;
            throw firestoreWriteFailureError || new Error('Failed to fetch');
        }
        for (const write of writes) {
            ensureDocRef(write.reference);
            if (write.remove) __firestoreState.documents.delete(write.reference.path);
            else {
                const current = write.options.merge ? (__firestoreState.documents.get(write.reference.path) || {}) : {};
                __firestoreState.documents.set(write.reference.path, { ...__cloneMockValue(current), ...__cloneMockValue(write.value) });
            }
        }
        return result;
    }
    const error = new Error('Transaction aborted after concurrent modifications');
    error.code = 'aborted';
    throw error;
}

export function __setMockBatchCommitFailureOnCall(call, error = new Error('Batch commit failed')) {
    batchCommitCalls = 0;
    batchCommitFailureCall = call;
    batchCommitFailureError = error;
}

export function __setMockBatchCommitGate(gate) {
    batchCommitGate = gate;
}

export async function setDoc(docRef, data, options = {}) {
    ensureDocRef(docRef);

    if (firestoreWriteFailuresRemaining > 0 && (!firestoreWriteFailurePath || docRef.path.includes(firestoreWriteFailurePath))) {
        firestoreWriteFailuresRemaining -= 1;
        if (firestoreWriteFailureError) {
            throw firestoreWriteFailureError;
        }
        throw new Error('Failed to fetch');
    }

    if (options.merge) {
        const current = __firestoreState.documents.get(docRef.path) || {};
        __firestoreState.documents.set(docRef.path, {
            ...__cloneMockValue(current),
            ...__cloneMockValue(data),
        });
        return;
    }

    __firestoreState.documents.set(docRef.path, __cloneMockValue(data));
}

export async function getDoc(docRef) {
    ensureDocRef(docRef);
    const data = __firestoreState.documents.get(docRef.path);
    const snapshot = __createDocumentSnapshot(docRef.path, __cloneMockValue(data));
    return documentResultHandler ? documentResultHandler(snapshot, docRef) : snapshot;
}

export async function getDocFromServer(docRef) {
    return getDoc(docRef);
}

export async function deleteDoc(docRef) {
    ensureDocRef(docRef);
    __firestoreState.documents.delete(docRef.path);
}

export async function getDocs(source) {
    const { collectionPath, constraints } = __resolveQuerySource(source);
    const collectionPrefix = `${collectionPath}/`;
    const docs = [];

    __firestoreState.documents.forEach((data, path) => {
        if (!path.startsWith(collectionPrefix)) return;
        const relativePath = path.slice(collectionPrefix.length);
        if (relativePath.includes('/')) return;
        docs.push(__createDocumentSnapshot(path, data));
    });

    const whereFiltered = __applyWhereConstraints(docs, constraints);
    const ordered = __applyOrderByConstraints(whereFiltered, constraints);
    const afterCursor = __applyStartAfterConstraint(ordered, constraints);
    const limited = __applyLimitConstraint(afterCursor, constraints);

    const snapshot = __buildQuerySnapshot(limited);
    return queryResultHandler ? queryResultHandler(snapshot, source) : snapshot;
}

export function writeBatch(_db) {
    const operations = [];

    return {
        set(docRef, data, options) {
            operations.push({ type: 'set', docRef, data, options });
            return this;
        },
        delete(docRef) {
            operations.push({ type: 'delete', docRef });
            return this;
        },
        async commit() {
            batchCommitCalls++;
            if (batchCommitCalls === batchCommitFailureCall) {
                batchCommitFailureCall = 0;
                throw batchCommitFailureError;
            }
            if (batchCommitGate) await batchCommitGate;
            for (const operation of operations) {
                if (operation.type === 'set') {
                    await setDoc(operation.docRef, operation.data, operation.options);
                } else if (operation.type === 'delete') {
                    await deleteDoc(operation.docRef);
                }
            }
        },
    };
}

export const Timestamp = MockTimestamp;
