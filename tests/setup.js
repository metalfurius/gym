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

// Mock sessionStorage (separate instance from localStorage)
const sessionStorageMock = (() => {
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

global.sessionStorage = sessionStorageMock;

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

// Setup console spies to reduce noise without replacing the global console object
const silenceConsole = !process.env.JEST_VERBOSE_CONSOLE;

const logSpy = jest.spyOn(console, 'log');
const debugSpy = jest.spyOn(console, 'debug');
const infoSpy = jest.spyOn(console, 'info');
const warnSpy = jest.spyOn(console, 'warn');
const errorSpy = jest.spyOn(console, 'error');

if (silenceConsole) {
  logSpy.mockImplementation(() => {});
  debugSpy.mockImplementation(() => {});
  infoSpy.mockImplementation(() => {});
  warnSpy.mockImplementation(() => {});
  errorSpy.mockImplementation(() => {});
}

// Reset mocks before each test
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});
