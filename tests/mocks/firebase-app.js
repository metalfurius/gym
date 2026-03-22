let currentApp = null;

export function initializeApp(config) {
  currentApp = {
    name: 'mock-firebase-app',
    options: { ...config },
  };
  return currentApp;
}

export function __getMockApp() {
  return currentApp;
}
