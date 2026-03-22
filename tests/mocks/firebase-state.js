class MockTimestamp {
  constructor(date = new Date()) {
    const value = date instanceof Date ? date : new Date(date);
    this._date = new Date(value.getTime());
    this.seconds = Math.floor(this._date.getTime() / 1000);
    this.nanoseconds = (this._date.getTime() % 1000) * 1000000;
  }

  toDate() {
    return new Date(this._date.getTime());
  }

  toMillis() {
    return this._date.getTime();
  }

  static now() {
    return new MockTimestamp(new Date());
  }

  static fromDate(date) {
    return new MockTimestamp(date);
  }
}

const authState = {
  usersByEmail: new Map(),
  currentUser: null,
  listeners: new Set(),
  nextUserId: 1,
};

const firestoreState = {
  documents: new Map(),
  nextDocumentId: 1,
};

function cloneValue(value) {
  if (value === null || value === undefined) return value;

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (value instanceof MockTimestamp) {
    return new MockTimestamp(value.toDate());
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (typeof value === 'object') {
    const cloned = {};
    Object.entries(value).forEach(([key, entry]) => {
      cloned[key] = cloneValue(entry);
    });
    return cloned;
  }

  return value;
}

function toComparableValue(value) {
  if (value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  if (value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date ? date.getTime() : value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return value;
}

function createUser(email) {
  const user = {
    uid: `mock-user-${authState.nextUserId}`,
    email,
    emailVerified: true,
    isAnonymous: false,
  };

  authState.nextUserId += 1;
  return user;
}

async function notifyAuthListeners() {
  const listeners = Array.from(authState.listeners);
  for (const listener of listeners) {
    await listener(authState.currentUser);
  }
}

function createDocumentSnapshot(path, data) {
  const id = path.split('/').pop();

  return {
    id,
    ref: { id, path },
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : cloneValue(data)),
    get: (field) => (data === undefined ? undefined : data[field]),
    __path: path,
  };
}

function getDirectCollectionDocs(collectionPath) {
  const prefix = `${collectionPath}/`;
  const docs = [];

  firestoreState.documents.forEach((data, path) => {
    if (!path.startsWith(prefix)) return;
    const remaining = path.slice(prefix.length);
    if (remaining.includes('/')) return;

    docs.push(createDocumentSnapshot(path, data));
  });

  return docs;
}

function resolveQuerySource(source) {
  if (!source) {
    throw new Error('Query source is required');
  }

  if (source.__type === 'collection') {
    return {
      collectionPath: source.path,
      constraints: [],
    };
  }

  if (source.__type === 'query') {
    const resolved = resolveQuerySource(source.source);
    return {
      collectionPath: resolved.collectionPath,
      constraints: [...resolved.constraints, ...source.constraints],
    };
  }

  throw new Error(`Unsupported query source: ${JSON.stringify(source)}`);
}

function applyWhereConstraints(docs, constraints) {
  const whereConstraints = constraints.filter((constraint) => constraint.__constraint === 'where');

  return docs.filter((docSnap) => {
    const docData = docSnap.data() || {};

    return whereConstraints.every((constraint) => {
      const left = toComparableValue(docData[constraint.field]);
      const right = toComparableValue(constraint.value);

      switch (constraint.operator) {
        case '==':
          return left === right;
        case '>':
          return left > right;
        case '>=':
          return left >= right;
        case '<':
          return left < right;
        case '<=':
          return left <= right;
        default:
          return false;
      }
    });
  });
}

function applyOrderByConstraints(docs, constraints) {
  const orderByConstraints = constraints.filter((constraint) => constraint.__constraint === 'orderBy');
  if (orderByConstraints.length === 0) {
    return [...docs];
  }

  const ordered = [...docs];
  ordered.sort((a, b) => {
    const aData = a.data() || {};
    const bData = b.data() || {};

    for (const constraint of orderByConstraints) {
      const left = toComparableValue(aData[constraint.field]);
      const right = toComparableValue(bData[constraint.field]);

      if (left === right) {
        continue;
      }

      const direction = constraint.direction === 'desc' ? -1 : 1;
      return left > right ? direction : -direction;
    }

    return 0;
  });

  return ordered;
}

function applyStartAfterConstraint(docs, constraints) {
  const startAfterConstraint = constraints.find((constraint) => constraint.__constraint === 'startAfter');
  if (!startAfterConstraint || !startAfterConstraint.snapshot) {
    return docs;
  }

  const markerPath =
    startAfterConstraint.snapshot.__path ||
    startAfterConstraint.snapshot.ref?.path ||
    null;

  const markerId = startAfterConstraint.snapshot.id || null;

  const markerIndex = docs.findIndex((docSnap) => {
    if (markerPath && docSnap.__path === markerPath) return true;
    if (markerId && docSnap.id === markerId) return true;
    return false;
  });

  if (markerIndex < 0) {
    return docs;
  }

  return docs.slice(markerIndex + 1);
}

function applyLimitConstraint(docs, constraints) {
  const limitConstraint = constraints.find((constraint) => constraint.__constraint === 'limit');
  if (!limitConstraint) {
    return docs;
  }

  return docs.slice(0, limitConstraint.count);
}

function buildQuerySnapshot(docs) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (callback) => docs.forEach((docSnap) => callback(docSnap)),
  };
}

function collectionPathSegmentsToString(segments) {
  return segments.filter(Boolean).join('/');
}

function createDocumentId() {
  const id = `mock-doc-${firestoreState.nextDocumentId}`;
  firestoreState.nextDocumentId += 1;
  return id;
}

function getCollectionDocuments(collectionPath) {
  return getDirectCollectionDocs(collectionPath).map((docSnap) => ({
    id: docSnap.id,
    path: docSnap.ref.path,
    data: docSnap.data(),
  }));
}

function resetMockFirebase() {
  authState.usersByEmail.clear();
  authState.currentUser = null;
  authState.listeners.clear();
  authState.nextUserId = 1;

  firestoreState.documents.clear();
  firestoreState.nextDocumentId = 1;
}

export {
  MockTimestamp,
  authState as __authState,
  firestoreState as __firestoreState,
  cloneValue as __cloneMockValue,
  createUser as __createMockUser,
  notifyAuthListeners as __notifyAuthListeners,
  createDocumentSnapshot as __createDocumentSnapshot,
  resolveQuerySource as __resolveQuerySource,
  applyWhereConstraints as __applyWhereConstraints,
  applyOrderByConstraints as __applyOrderByConstraints,
  applyStartAfterConstraint as __applyStartAfterConstraint,
  applyLimitConstraint as __applyLimitConstraint,
  buildQuerySnapshot as __buildQuerySnapshot,
  collectionPathSegmentsToString as __collectionPathSegmentsToString,
  createDocumentId as __createDocumentId,
  getCollectionDocuments as __getMockCollectionDocuments,
  resetMockFirebase as __resetMockFirebase,
};
