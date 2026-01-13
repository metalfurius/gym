import { describe, it, expect, beforeEach } from '@jest/globals';
import { Pagination, createPagination } from '../../js/modules/pagination.js';

/**
 * Tests for pagination module
 * Provides a reusable pagination implementation for Firestore queries
 * Note: Some tests are simplified due to Firebase module mocking limitations in Jest
 */
describe('Pagination', () => {
    describe('constructor', () => {
        it('should create pagination with default options', () => {
            const pagination = new Pagination();

            expect(pagination.pageSize).toBe(10);
            expect(pagination.orderByField).toBe('createdAt');
            expect(pagination.orderDirection).toBe('desc');
            expect(pagination.currentPage).toBe(1);
        });

        it('should create pagination with custom options', () => {
            const pagination = new Pagination({
                pageSize: 20,
                orderByField: 'name',
                orderDirection: 'asc'
            });

            expect(pagination.pageSize).toBe(20);
            expect(pagination.orderByField).toBe('name');
            expect(pagination.orderDirection).toBe('asc');
        });
    });

    describe('reset', () => {
        it('should reset pagination to initial state', () => {
            const pagination = new Pagination();
            
            // Modify state
            pagination.currentPage = 3;
            pagination.hasNextPage = true;
            pagination.hasPrevPage = true;
            pagination.cachedItems = [{ id: 'test' }];

            // Reset
            pagination.reset();

            expect(pagination.currentPage).toBe(1);
            expect(pagination.hasNextPage).toBe(false);
            expect(pagination.hasPrevPage).toBe(false);
            expect(pagination.cachedItems).toEqual([]);
            expect(pagination.snapshotStack).toEqual([]);
        });
    });

    describe('getState', () => {
        it('should return current pagination state', () => {
            const pagination = new Pagination({ pageSize: 15 });
            const state = pagination.getState();

            expect(state).toHaveProperty('currentPage');
            expect(state).toHaveProperty('pageSize');
            expect(state).toHaveProperty('hasNextPage');
            expect(state).toHaveProperty('hasPrevPage');
            expect(state).toHaveProperty('snapshotStack');
            expect(state.pageSize).toBe(15);
        });

        it('should return a copy of snapshotStack', () => {
            const pagination = new Pagination();
            pagination.snapshotStack = [null, { id: 'doc1' }];

            const state = pagination.getState();
            state.snapshotStack.push({ id: 'doc2' });

            // Original should not be modified
            expect(pagination.snapshotStack.length).toBe(2);
        });
    });

    describe('getCachedItems', () => {
        it('should return a copy of cached items', () => {
            const pagination = new Pagination();
            pagination.cachedItems = [{ id: 'item1' }, { id: 'item2' }];

            const cached = pagination.getCachedItems();
            cached.push({ id: 'item3' });

            // Original should not be modified
            expect(pagination.cachedItems).toHaveLength(2);
        });

        it('should return empty array when no items cached', () => {
            const pagination = new Pagination();
            
            const cached = pagination.getCachedItems();
            
            expect(cached).toEqual([]);
        });
    });

    describe('findCachedItem', () => {
        it('should find item by id', () => {
            const pagination = new Pagination();
            pagination.cachedItems = [
                { id: 'item1', name: 'First' },
                { id: 'item2', name: 'Second' }
            ];

            const item = pagination.findCachedItem('item2');

            expect(item).toEqual({ id: 'item2', name: 'Second' });
        });

        it('should return undefined if item not found', () => {
            const pagination = new Pagination();
            pagination.cachedItems = [{ id: 'item1' }];

            const item = pagination.findCachedItem('nonexistent');

            expect(item).toBeUndefined();
        });
    });

    describe('createPagination', () => {
        it('should create a new Pagination instance', () => {
            const pagination = createPagination({ pageSize: 25 });

            expect(pagination).toBeInstanceOf(Pagination);
            expect(pagination.pageSize).toBe(25);
        });

        it('should create with default options', () => {
            const pagination = createPagination();

            expect(pagination).toBeInstanceOf(Pagination);
            expect(pagination.pageSize).toBe(10);
        });
    });

    describe('navigation state management', () => {
        it('should initialize with hasPrevPage as false', () => {
            const pagination = new Pagination();
            expect(pagination.hasPrevPage).toBe(false);
        });

        it('should initialize with hasNextPage as false', () => {
            const pagination = new Pagination();
            expect(pagination.hasNextPage).toBe(false);
        });

        it('should initialize snapshot stack as empty', () => {
            const pagination = new Pagination();
            expect(pagination.snapshotStack).toEqual([]);
        });
    });

    // Note: fetchPage, nextPage, prevPage, and refresh tests require Firebase integration
    // and are better tested as integration tests with a real or mocked Firestore instance
});
