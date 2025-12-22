// Test utilities and helpers

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
 * Create a mock user object
 */
export function createMockUser(email = 'test@example.com', uid = 'test-uid-123') {
  return {
    uid,
    email,
    emailVerified: true,
    isAnonymous: false,
    metadata: {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString(),
    },
    providerData: [],
    refreshToken: 'mock-refresh-token',
  };
}

/**
 * Create a mock routine object
 */
export function createMockRoutine(name = 'Test Routine', exercises = []) {
  return {
    id: `routine-${Date.now()}`,
    name,
    exercises: exercises.length > 0 ? exercises : [
      {
        nombreEjercicio: 'Bench Press',
        sets: 3,
        type: 'strength',
      },
      {
        nombreEjercicio: 'Squats',
        sets: 4,
        type: 'strength',
      },
    ],
    createdAt: createMockTimestamp(),
  };
}

/**
 * Create a mock session object
 */
export function createMockSession(routineName = 'Test Routine') {
  return {
    id: `session-${Date.now()}`,
    dia: routineName,
    fecha: createMockTimestamp(),
    ejercicios: [
      {
        nombreEjercicio: 'Bench Press',
        sets: [
          { peso: 60, reps: 10 },
          { peso: 65, reps: 8 },
          { peso: 70, reps: 6 },
        ],
        type: 'strength',
      },
      {
        nombreEjercicio: 'Squats',
        sets: [
          { peso: 100, reps: 10 },
          { peso: 110, reps: 8 },
          { peso: 120, reps: 6 },
        ],
        type: 'strength',
      },
    ],
    pesoUsuario: 75,
  };
}

/**
 * Wait for a specified time
 */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock DOM element
 */
export function createMockElement(tag = 'div', attributes = {}) {
  const element = document.createElement(tag);
  Object.keys(attributes).forEach(key => {
    if (key === 'className') {
      element.className = attributes[key];
    } else if (key === 'innerHTML') {
      element.innerHTML = attributes[key];
    } else {
      element.setAttribute(key, attributes[key]);
    }
  });
  return element;
}

/**
 * Mock fetch API
 */
export function mockFetch(responseData, ok = true, status = 200) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(responseData),
      text: () => Promise.resolve(JSON.stringify(responseData)),
    })
  );
}

/**
 * Create a spy on a function
 */
export function createSpy(implementation = () => {}) {
  return jest.fn(implementation);
}

/**
 * Assert that a function throws
 */
export async function assertThrows(fn, errorMessage) {
  let error;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  if (!error) {
    throw new Error('Expected function to throw an error');
  }
  if (errorMessage && !error.message.includes(errorMessage)) {
    throw new Error(`Expected error message to include "${errorMessage}", got "${error.message}"`);
  }
  return error;
}

/**
 * Create a mock timer
 */
export function useFakeTimers() {
  jest.useFakeTimers();
  return {
    tick: (ms) => jest.advanceTimersByTime(ms),
    restore: () => jest.useRealTimers(),
  };
}
