/**
 * Environment Configuration Module
 * 
 * This module provides environment-specific configuration for the application.
 * It automatically detects the environment based on the hostname/platform
 * or can be explicitly set during build time.
 * 
 * Supported environments:
 * - development: Local development (localhost)
 * - staging: Pre-production testing
 * - production: Live production environment
 */

/**
 * @typedef {Object} EnvironmentConfig
 * @property {string} name - Environment name
 * @property {boolean} debug - Enable debug mode
 * @property {boolean} enableAnalytics - Enable analytics tracking
 * @property {boolean} enablePerformanceMonitoring - Enable performance monitoring
 * @property {string} logLevel - Logging level (debug, info, warn, error)
 * @property {Object} firebase - Firebase configuration overrides
 */

/**
 * Environment configurations
 */
const environments = {
  development: {
    name: 'development',
    debug: true,
    enableAnalytics: false,
    enablePerformanceMonitoring: false,
    logLevel: 'debug',
    api: {
      timeout: 30000,
      retryAttempts: 3,
    },
    cache: {
      enabled: true,
      maxAge: 300000, // 5 minutes
    },
    firebase: {
      // Development can use the same Firebase project or a separate dev project
      // Override specific settings here if needed
    },
  },

  staging: {
    name: 'staging',
    debug: true,
    enableAnalytics: true,
    enablePerformanceMonitoring: true,
    logLevel: 'info',
    api: {
      timeout: 20000,
      retryAttempts: 3,
    },
    cache: {
      enabled: true,
      maxAge: 600000, // 10 minutes
    },
    firebase: {
      // Staging can use a separate Firebase project
      // Override settings here if needed
    },
  },

  production: {
    name: 'production',
    debug: false,
    enableAnalytics: true,
    enablePerformanceMonitoring: true,
    logLevel: 'warn',
    api: {
      timeout: 15000,
      retryAttempts: 2,
    },
    cache: {
      enabled: true,
      maxAge: 3600000, // 1 hour
    },
    firebase: {
      // Production Firebase settings
    },
  },
};

/**
 * Detect the current environment based on hostname and platform
 * @returns {string} The detected environment name
 */
function detectEnvironment() {
  // Check if running in Capacitor native context
  const isCapacitor = typeof window !== 'undefined' && 
    window.Capacitor && 
    window.Capacitor.isNativePlatform();
  
  // Check for explicit environment variable (set during build)
  if (typeof window !== 'undefined' && window.__APP_ENV__) {
    return window.__APP_ENV__;
  }

  // For native apps, default to production unless explicitly set
  if (isCapacitor) {
    return 'production';
  }

  // Web-based detection using hostname
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development';
    }

    // Staging environments (customize these patterns as needed)
    if (
      hostname.includes('staging') ||
      hostname.includes('dev') ||
      hostname.includes('test')
    ) {
      return 'staging';
    }
  }

  // Default to production for all other cases
  return 'production';
}

/**
 * Get the current environment configuration
 * @returns {EnvironmentConfig} The current environment configuration
 */
function getEnvironmentConfig() {
  const envName = detectEnvironment();
  return environments[envName] || environments.production;
}

/**
 * Check if the current environment is development
 * @returns {boolean}
 */
function isDevelopment() {
  return detectEnvironment() === 'development';
}

/**
 * Check if the current environment is staging
 * @returns {boolean}
 */
function isStaging() {
  return detectEnvironment() === 'staging';
}

/**
 * Check if the current environment is production
 * @returns {boolean}
 */
function isProduction() {
  return detectEnvironment() === 'production';
}

/**
 * Check if debug mode is enabled
 * @returns {boolean}
 */
function isDebugEnabled() {
  return getEnvironmentConfig().debug;
}

/**
 * Get the current log level
 * @returns {string}
 */
function getLogLevel() {
  return getEnvironmentConfig().logLevel;
}

/**
 * Platform detection utilities
 */
const platform = {
  /**
   * Check if running on iOS native platform
   * @returns {boolean}
   */
  isIOS() {
    if (typeof window === 'undefined' || !window.Capacitor) {
      return false;
    }
    return window.Capacitor.getPlatform() === 'ios';
  },

  /**
   * Check if running on Android native platform
   * @returns {boolean}
   */
  isAndroid() {
    if (typeof window === 'undefined' || !window.Capacitor) {
      return false;
    }
    return window.Capacitor.getPlatform() === 'android';
  },

  /**
   * Check if running in a web browser
   * @returns {boolean}
   */
  isWeb() {
    if (typeof window === 'undefined') {
      return false;
    }
    return !window.Capacitor || window.Capacitor.getPlatform() === 'web';
  },

  /**
   * Check if running as a native app (iOS or Android)
   * @returns {boolean}
   */
  isNative() {
    if (typeof window === 'undefined' || !window.Capacitor) {
      return false;
    }
    return window.Capacitor.isNativePlatform();
  },

  /**
   * Get the current platform name
   * @returns {string} 'ios', 'android', or 'web'
   */
  getName() {
    if (typeof window !== 'undefined' && window.Capacitor) {
      return window.Capacitor.getPlatform();
    }
    return 'web';
  },
};

// Export the configuration and utilities
export {
  environments,
  detectEnvironment,
  getEnvironmentConfig,
  isDevelopment,
  isStaging,
  isProduction,
  isDebugEnabled,
  getLogLevel,
  platform,
};

// Default export for convenience
export default getEnvironmentConfig;
