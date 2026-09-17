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
    return {
        __type: 'doc',
        path: resolveDocumentPath(firstArg, segments),
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

export function __resetMockFirestoreBehavior() {
    firestoreWriteFailuresRemaining = 0;
    firestoreWriteFailureError = null;
}

export async function setDoc(docRef, data, options = {}) {
    ensureDocRef(docRef);

    if (firestoreWriteFailuresRemaining > 0) {
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
    return __createDocumentSnapshot(docRef.path, data);
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

    return __buildQuerySnapshot(limited);
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
