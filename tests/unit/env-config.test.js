import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  environments,
  detectEnvironment,
  getEnvironmentConfig,
  isDevelopment,
  isStaging,
  isProduction,
  isDebugEnabled,
  getLogLevel,
  platform,
} from '../../js/env-config.js';

describe('env-config', () => {
  // Note: Jest's jsdom environment sets window.location.hostname to 'localhost'
  // So by default, tests run in 'development' mode

  describe('environments object', () => {
    it('should have development, staging, and production configurations', () => {
      expect(environments).toHaveProperty('development');
      expect(environments).toHaveProperty('staging');
      expect(environments).toHaveProperty('production');
    });

    it('should have correct structure for each environment', () => {
      const requiredProperties = [
        'name',
        'debug',
        'enableAnalytics',
        'enablePerformanceMonitoring',
        'logLevel',
        'api',
        'cache',
        'firebase',
      ];

      Object.values(environments).forEach((env) => {
        requiredProperties.forEach((prop) => {
          expect(env).toHaveProperty(prop);
        });
      });
    });

    it('development should have debug enabled', () => {
      expect(environments.development.debug).toBe(true);
    });

    it('production should have debug disabled', () => {
      expect(environments.production.debug).toBe(false);
    });

    it('development should have analytics disabled', () => {
      expect(environments.development.enableAnalytics).toBe(false);
    });

    it('production should have analytics enabled', () => {
      expect(environments.production.enableAnalytics).toBe(true);
    });

    it('staging should have debug enabled', () => {
      expect(environments.staging.debug).toBe(true);
    });

    it('all environments should have api config with timeout and retryAttempts', () => {
      Object.values(environments).forEach((env) => {
        expect(env.api).toHaveProperty('timeout');
        expect(env.api).toHaveProperty('retryAttempts');
        expect(typeof env.api.timeout).toBe('number');
        expect(typeof env.api.retryAttempts).toBe('number');
      });
    });

    it('all environments should have cache config', () => {
      Object.values(environments).forEach((env) => {
        expect(env.cache).toHaveProperty('enabled');
        expect(env.cache).toHaveProperty('maxAge');
        expect(typeof env.cache.enabled).toBe('boolean');
        expect(typeof env.cache.maxAge).toBe('number');
      });
    });
  });

  describe('detectEnvironment', () => {
    // jsdom sets window.location.hostname to 'localhost'
    it('should detect development for localhost (jsdom default)', () => {
      expect(detectEnvironment()).toBe('development');
    });
  });

  describe('getEnvironmentConfig', () => {
    it('should return development config in jsdom environment', () => {
      const config = getEnvironmentConfig();
      expect(config.name).toBe('development');
      expect(config.debug).toBe(true);
    });

    it('should return config with all required properties', () => {
      const config = getEnvironmentConfig();
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('debug');
      expect(config).toHaveProperty('enableAnalytics');
      expect(config).toHaveProperty('enablePerformanceMonitoring');
      expect(config).toHaveProperty('logLevel');
      expect(config).toHaveProperty('api');
      expect(config).toHaveProperty('cache');
      expect(config).toHaveProperty('firebase');
    });
  });

  describe('environment check functions', () => {
    // jsdom sets window.location.hostname to 'localhost'
    it('isDevelopment should return true in jsdom environment', () => {
      expect(isDevelopment()).toBe(true);
    });

    it('isStaging should return false in jsdom environment', () => {
      expect(isStaging()).toBe(false);
    });

    it('isProduction should return false in jsdom environment', () => {
      expect(isProduction()).toBe(false);
    });
  });

  describe('isDebugEnabled', () => {
    it('should return true in development (jsdom environment)', () => {
      expect(isDebugEnabled()).toBe(true);
    });
  });

  describe('getLogLevel', () => {
    it('should return debug level in development (jsdom environment)', () => {
      expect(getLogLevel()).toBe('debug');
    });
  });

  describe('platform detection', () => {
    // In jsdom, there's no Capacitor
    it('isWeb should return true when no Capacitor', () => {
      expect(platform.isWeb()).toBe(true);
    });

    it('isNative should return false when no Capacitor', () => {
      expect(platform.isNative()).toBe(false);
    });

    it('getName should return web when no Capacitor', () => {
      expect(platform.getName()).toBe('web');
    });

    it('isIOS should return false when no Capacitor', () => {
      expect(platform.isIOS()).toBe(false);
    });

    it('isAndroid should return false when no Capacitor', () => {
      expect(platform.isAndroid()).toBe(false);
    });
  });

  describe('platform detection with mocked Capacitor', () => {
    let originalCapacitor;

    beforeEach(() => {
      originalCapacitor = window.Capacitor;
    });

    afterEach(() => {
      if (originalCapacitor === undefined) {
        delete window.Capacitor;
      } else {
        window.Capacitor = originalCapacitor;
      }
    });

    it('should detect iOS platform when Capacitor reports ios', () => {
      window.Capacitor = {
        getPlatform: () => 'ios',
        isNativePlatform: () => true,
      };
      expect(platform.isIOS()).toBe(true);
      expect(platform.isAndroid()).toBe(false);
      expect(platform.isNative()).toBe(true);
      expect(platform.getName()).toBe('ios');
    });

    it('should detect Android platform when Capacitor reports android', () => {
      window.Capacitor = {
        getPlatform: () => 'android',
        isNativePlatform: () => true,
      };
      expect(platform.isAndroid()).toBe(true);
      expect(platform.isIOS()).toBe(false);
      expect(platform.isNative()).toBe(true);
      expect(platform.getName()).toBe('android');
    });

    it('should detect web platform in Capacitor web mode', () => {
      window.Capacitor = {
        getPlatform: () => 'web',
        isNativePlatform: () => false,
      };
      expect(platform.isWeb()).toBe(true);
      expect(platform.isNative()).toBe(false);
      expect(platform.getName()).toBe('web');
    });
  });

  describe('environment detection with __APP_ENV__ override', () => {
    let originalAppEnv;

    beforeEach(() => {
      originalAppEnv = window.__APP_ENV__;
    });

    afterEach(() => {
      if (originalAppEnv === undefined) {
        delete window.__APP_ENV__;
      } else {
        window.__APP_ENV__ = originalAppEnv;
      }
    });

    it('should use __APP_ENV__ when set to staging', () => {
      window.__APP_ENV__ = 'staging';
      expect(detectEnvironment()).toBe('staging');
    });

    it('should use __APP_ENV__ when set to production', () => {
      window.__APP_ENV__ = 'production';
      expect(detectEnvironment()).toBe('production');
    });

    it('should use __APP_ENV__ when set to development', () => {
      window.__APP_ENV__ = 'development';
      expect(detectEnvironment()).toBe('development');
    });

    it('should override hostname detection with __APP_ENV__', () => {
      // jsdom sets hostname to localhost (development), but __APP_ENV__ should override
      window.__APP_ENV__ = 'production';
      expect(detectEnvironment()).toBe('production');
    });
  });

  describe('native app environment detection', () => {
    let originalCapacitor;
    let originalAppEnv;

    beforeEach(() => {
      originalCapacitor = window.Capacitor;
      originalAppEnv = window.__APP_ENV__;
    });

    afterEach(() => {
      if (originalCapacitor === undefined) {
        delete window.Capacitor;
      } else {
        window.Capacitor = originalCapacitor;
      }
      if (originalAppEnv === undefined) {
        delete window.__APP_ENV__;
      } else {
        window.__APP_ENV__ = originalAppEnv;
      }
    });

    it('should default to production for native apps without __APP_ENV__', () => {
      delete window.__APP_ENV__;
      window.Capacitor = {
        getPlatform: () => 'ios',
        isNativePlatform: () => true,
      };
      expect(detectEnvironment()).toBe('production');
    });

    it('should use __APP_ENV__ for native apps when set', () => {
      window.__APP_ENV__ = 'staging';
      window.Capacitor = {
        getPlatform: () => 'android',
        isNativePlatform: () => true,
      };
      expect(detectEnvironment()).toBe('staging');
    });
  });

  describe('environment config values', () => {
    it('development should have longer api timeout than production', () => {
      expect(environments.development.api.timeout).toBeGreaterThan(
        environments.production.api.timeout
      );
    });

    it('development should have shorter cache maxAge than production', () => {
      expect(environments.development.cache.maxAge).toBeLessThan(
        environments.production.cache.maxAge
      );
    });

    it('all log levels should be valid', () => {
      const validLogLevels = ['debug', 'info', 'warn', 'error'];
      Object.values(environments).forEach((env) => {
        expect(validLogLevels).toContain(env.logLevel);
      });
    });
  });
});
