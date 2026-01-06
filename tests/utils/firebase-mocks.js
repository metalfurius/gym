// Firebase mocking utilities for testing
import { jest } from '@jest/globals';

/**
 * Create a mock Firebase Timestamp
 */
export function createMockTimestamp(date = new Date()) {
  return {
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: (date.getTime() % 1000) * 1000000,
  };
}

/**
 * Mock Firebase Timestamp class
 */
export const MockTimestamp = {
  now: () => createMockTimestamp(),
  fromDate: (date) => createMockTimestamp(date),
  fromMillis: (millis) => createMockTimestamp(new Date(millis)),
};

/**
 * Create a mock Firestore document snapshot
 */
export function createMockDocSnapshot(id, data, exists = true) {
  return {
    id,
    exists: () => exists,
    data: () => (exists ? data : undefined),
    get: (field) => (exists && data ? data[field] : undefined),
    ref: {
      id,
      path: `collection/${id}`,
    },
  };
}

/**
 * Create a mock Firestore query snapshot
 */
export function createMockQuerySnapshot(docs = []) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (callback) => docs.forEach(callback),
    docChanges: () => [],
  };
}

/**
 * Create a mock Firestore collection reference
 */
export function createMockCollectionRef(collectionName) {
  return {
    id: collectionName,
    path: collectionName,
  };
}

/**
 * Create a mock Firestore document reference
 */
export function createMockDocRef(collectionName, docId) {
  return {
    id: docId,
    path: `${collectionName}/${docId}`,
  };
}

/**
 * Mock Firestore functions
 */
export const mockFirestore = {
  collection: jest.fn((db, collectionName) => createMockCollectionRef(collectionName)),
  doc: jest.fn((db, collectionName, docId) => createMockDocRef(collectionName, docId)),
  addDoc: jest.fn(async (collectionRef, data) => {
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    return createMockDocRef(collectionRef.id, docId);
  }),
  setDoc: jest.fn(async (docRef, data) => {
    return Promise.resolve();
  }),
  getDoc: jest.fn(async (docRef) => {
    return createMockDocSnapshot(docRef.id, null, false);
  }),
  getDocs: jest.fn(async (query) => {
    return createMockQuerySnapshot([]);
  }),
  deleteDoc: jest.fn(async (docRef) => {
    return Promise.resolve();
  }),
  query: jest.fn((...args) => {
    return {
      _constraints: args.slice(1),
    };
  }),
  where: jest.fn((field, op, value) => ({
    type: 'where',
    field,
    op,
    value,
  })),
  orderBy: jest.fn((field, direction = 'asc') => ({
    type: 'orderBy',
    field,
    direction,
  })),
  limit: jest.fn((count) => ({
    type: 'limit',
    count,
  })),
  startAfter: jest.fn((snapshot) => ({
    type: 'startAfter',
    snapshot,
  })),
  writeBatch: jest.fn((db) => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(async () => Promise.resolve()),
  })),
  Timestamp: MockTimestamp,
};

/**
 * Mock Firebase Auth User
 */
export function createMockAuthUser(email = 'test@example.com', uid = 'test-uid-123') {
  return {
    uid,
    email,
    emailVerified: true,
    isAnonymous: false,
    displayName: null,
    photoURL: null,
    phoneNumber: null,
    metadata: {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString(),
    },
    providerData: [
      {
        providerId: 'password',
        uid: email,
        displayName: null,
        email,
        phoneNumber: null,
        photoURL: null,
      },
    ],
    refreshToken: 'mock-refresh-token',
    tenantId: null,
  };
}

/**
 * Mock Firebase Auth UserCredential
 */
export function createMockUserCredential(user = null) {
  return {
    user: user || createMockAuthUser(),
    providerId: 'password',
    operationType: 'signIn',
  };
}

/**
 * Mock Firebase Auth functions
 */
export const mockAuth = {
  createUserWithEmailAndPassword: jest.fn(async (auth, email, password) => {
    if (!email) {
      throw { code: 'auth/invalid-email', message: 'Invalid email' };
    }
    if (!password) {
      throw { code: 'auth/missing-password', message: 'Missing password' };
    }
    if (password.length < 6) {
      throw { code: 'auth/weak-password', message: 'Weak password' };
    }
    const user = createMockAuthUser(email);
    return createMockUserCredential(user);
  }),
  signInWithEmailAndPassword: jest.fn(async (auth, email, password) => {
    if (!email) {
      throw { code: 'auth/invalid-email', message: 'Invalid email' };
    }
    if (!password) {
      throw { code: 'auth/missing-password', message: 'Missing password' };
    }
    const user = createMockAuthUser(email);
    return createMockUserCredential(user);
  }),
  signOut: jest.fn(async (auth) => {
    return Promise.resolve();
  }),
  onAuthStateChanged: jest.fn((auth, callback) => {
    // Call callback with null (no user) initially
    callback(null);
    // Return unsubscribe function
    return jest.fn();
  }),
};

/**
 * Mock Firebase Auth errors
 */
export const mockAuthErrors = {
  invalidEmail: { code: 'auth/invalid-email', message: 'Invalid email' },
  userNotFound: { code: 'auth/user-not-found', message: 'User not found' },
  wrongPassword: { code: 'auth/wrong-password', message: 'Wrong password' },
  emailInUse: { code: 'auth/email-already-in-use', message: 'Email already in use' },
  weakPassword: { code: 'auth/weak-password', message: 'Weak password' },
  missingPassword: { code: 'auth/missing-password', message: 'Missing password' },
  userDisabled: { code: 'auth/user-disabled', message: 'User disabled' },
};

/**
 * Create a mock Firebase database
 */
export function createMockFirebaseDB() {
  const collections = new Map();
  
  return {
    collection: (name) => {
      if (!collections.has(name)) {
        collections.set(name, new Map());
      }
      return {
        name,
        get: () => collections.get(name),
      };
    },
    addDoc: async (collectionRef, data) => {
      const collection = collections.get(collectionRef.name) || new Map();
      const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      collection.set(docId, { id: docId, ...data });
      collections.set(collectionRef.name, collection);
      return { id: docId };
    },
    getDocs: async (collectionRef) => {
      const collection = collections.get(collectionRef.name) || new Map();
      const docs = Array.from(collection.values()).map((data) =>
        createMockDocSnapshot(data.id, data, true)
      );
      return createMockQuerySnapshot(docs);
    },
    clear: () => {
      collections.clear();
    },
  };
}

/**
 * Reset all Firebase mocks
 */
export function resetFirebaseMocks() {
  Object.values(mockFirestore).forEach((mockFn) => {
    if (typeof mockFn === 'function' && mockFn.mockClear) {
      mockFn.mockClear();
    }
  });
  
  Object.values(mockAuth).forEach((mockFn) => {
    if (typeof mockFn === 'function' && mockFn.mockClear) {
      mockFn.mockClear();
    }
  });
}

/**
 * Setup Firebase mocks for a test
 */
export function setupFirebaseMocks() {
  // Mock the firebase config module
  const mockDB = createMockFirebaseDB();
  const mockAuthInstance = { currentUser: null };
  
  resetFirebaseMocks();
  
  return {
    db: mockDB,
    auth: mockAuthInstance,
    ...mockFirestore,
    ...mockAuth,
  };
}
