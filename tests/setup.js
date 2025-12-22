// Test setup file - runs before all tests
// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

global.localStorage = localStorageMock;

// Mock sessionStorage
global.sessionStorage = localStorageMock;

// Mock navigator.storage
global.navigator.storage = {
  estimate: async () => ({
    quota: 1024 * 1024 * 1024,
    usage: 1024 * 1024,
  }),
  persisted: async () => true,
  persist: async () => true,
};

// Mock Firebase modules
jest.mock('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js', () => ({}), { virtual: true });
jest.mock('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js', () => ({}), { virtual: true });

// Setup console spies to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Reset mocks before each test
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});
