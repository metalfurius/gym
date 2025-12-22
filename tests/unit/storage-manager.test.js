import { describe, it, expect, beforeEach } from '@jest/globals';
import { StorageManager } from '../../js/storage-manager.js';

describe('StorageManager', () => {
  let storageManager;

  beforeEach(() => {
    storageManager = new StorageManager();
  });

  describe('initialization', () => {
    it('should detect if Storage API is supported', () => {
      expect(storageManager.isSupported).toBe(true);
    });

    it('should initialize storage successfully', async () => {
      await expect(storageManager.initialize()).resolves.toBeUndefined();
    });
  });

  describe('requestPersistentStorage', () => {
    it('should request persistent storage', async () => {
      const result = await storageManager.requestPersistentStorage();
      expect(result).toBe(true);
    });

    it('should return true if storage is already persistent', async () => {
      const result = await storageManager.requestPersistentStorage();
      expect(result).toBe(true);
      
      // Second call should also return true
      const secondResult = await storageManager.requestPersistentStorage();
      expect(secondResult).toBe(true);
    });
  });

  describe('getStorageEstimate', () => {
    it('should return storage estimate with quota and usage', async () => {
      const estimate = await storageManager.getStorageEstimate();
      
      expect(estimate).toBeDefined();
      expect(estimate).toHaveProperty('quota');
      expect(estimate).toHaveProperty('usage');
      expect(estimate).toHaveProperty('usagePercentage');
      expect(typeof estimate.quota).toBe('number');
      expect(typeof estimate.usage).toBe('number');
      expect(typeof estimate.usagePercentage).toBe('string');
    });

    it('should calculate usage percentage correctly', async () => {
      const estimate = await storageManager.getStorageEstimate();
      const expectedPercentage = ((estimate.usage / estimate.quota) * 100).toFixed(2);
      
      expect(estimate.usagePercentage).toBe(expectedPercentage);
    });
  });

  describe('isPersistent', () => {
    it('should check if storage is persistent', async () => {
      const result = await storageManager.isPersistent();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('error handling', () => {
    it('should handle missing Storage API gracefully', async () => {
      const managerWithoutSupport = new StorageManager();
      managerWithoutSupport.isSupported = false;

      const result = await managerWithoutSupport.requestPersistentStorage();
      expect(result).toBe(false);
    });

    it('should return null for storage estimate when not supported', async () => {
      const managerWithoutSupport = new StorageManager();
      managerWithoutSupport.isSupported = false;

      const estimate = await managerWithoutSupport.getStorageEstimate();
      expect(estimate).toBeNull();
    });
  });
});
