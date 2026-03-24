import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Pagination, createPagination } from '../../js/modules/pagination.js';
import * as firestore from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { __firestoreState, __resetMockFirebase } from '../mocks/firebase-state.js';
import { logger } from '../../js/utils/logger.js';

const userId = 'test-user-1';

function seedSessions(createdAtValues = []) {
    createdAtValues.forEach((createdAt, index) => {
        __firestoreState.documents.set(
            `users/${userId}/sesiones_entrenamiento/session-${index + 1}`,
            {
                createdAt,
                label: `session-${index + 1}`
            }
        );
    });
}

function createSessionsCollectionRef() {
    return firestore.collection({}, 'users', userId, 'sesiones_entrenamiento');
}

describe('Pagination', () => {
    beforeEach(() => {
        __resetMockFirebase();
    });

    describe('Module structure', () => {
        it('creates pagination with default options', () => {
            const pagination = new Pagination();

            expect(pagination.pageSize).toBe(10);
            expect(pagination.orderByField).toBe('createdAt');
            expect(pagination.orderDirection).toBe('desc');
        });

        it('creates pagination with custom options', () => {
            const pagination = new Pagination({
                pageSize: 5,
                orderByField: 'fecha',
                orderDirection: 'asc'
            });

            expect(pagination.pageSize).toBe(5);
            expect(pagination.orderByField).toBe('fecha');
            expect(pagination.orderDirection).toBe('asc');
        });
    });

    describe('reset', () => {
        it('resets pagination state to defaults', () => {
            const pagination = new Pagination();

            pagination.currentPage = 3;
            pagination.hasNextPage = true;
            pagination.hasPrevPage = true;
            pagination.snapshotStack = [{ id: 'doc-1' }];
            pagination.cachedItems = [{ id: 'cached-1' }];

            pagination.reset();

            expect(pagination.currentPage).toBe(1);
            expect(pagination.firstDocSnapshot).toBeNull();
            expect(pagination.lastDocSnapshot).toBeNull();
            expect(pagination.snapshotStack).toEqual([]);
            expect(pagination.hasNextPage).toBe(false);
            expect(pagination.hasPrevPage).toBe(false);
            expect(pagination.cachedItems).toEqual([]);
        });
    });

    describe('getState', () => {
        it('returns the current pagination state', () => {
            const pagination = new Pagination({ pageSize: 3 });
            pagination.currentPage = 2;
            pagination.snapshotStack = [{ id: 'doc-a' }, { id: 'doc-b' }];
            pagination.hasNextPage = true;
            pagination.hasPrevPage = true;

            const state = pagination.getState();

            expect(state.currentPage).toBe(2);
            expect(state.pageSize).toBe(3);
            expect(state.hasNextPage).toBe(true);
            expect(state.hasPrevPage).toBe(true);
            expect(state.snapshotStack).toEqual([{ id: 'doc-a' }, { id: 'doc-b' }]);
        });

        it('returns a copy of snapshotStack', () => {
            const pagination = new Pagination();
            pagination.snapshotStack = [{ id: 'doc-1' }];

            const state = pagination.getState();
            state.snapshotStack.push({ id: 'doc-2' });

            expect(pagination.snapshotStack).toEqual([{ id: 'doc-1' }]);
        });
    });

    describe('getCachedItems', () => {
        it('returns a copy of cached items', () => {
            const pagination = new Pagination();
            pagination.cachedItems = [{ id: 'cached-1' }];

            const items = pagination.getCachedItems();
            items.push({ id: 'cached-2' });

            expect(pagination.cachedItems).toEqual([{ id: 'cached-1' }]);
        });

        it('returns an empty array when cache is empty', () => {
            const pagination = new Pagination();
            expect(pagination.getCachedItems()).toEqual([]);
        });
    });

    describe('findCachedItem', () => {
        it('finds an item by id', () => {
            const pagination = new Pagination();
            pagination.cachedItems = [
                { id: 'item-1', value: 'first' },
                { id: 'item-2', value: 'second' }
            ];

            expect(pagination.findCachedItem('item-2')).toEqual({
                id: 'item-2',
                value: 'second'
            });
        });

        it('returns undefined when item is not found', () => {
            const pagination = new Pagination();
            pagination.cachedItems = [{ id: 'item-1' }];
            expect(pagination.findCachedItem('missing')).toBeUndefined();
        });
    });

    describe('createPagination', () => {
        it('creates a Pagination instance', () => {
            const pagination = createPagination({ pageSize: 4 });
            expect(pagination).toBeInstanceOf(Pagination);
            expect(pagination.pageSize).toBe(4);
        });
    });

    describe('navigation state management', () => {
        it('initializes with no previous or next page and empty snapshots', () => {
            const pagination = new Pagination();
            expect(pagination.hasPrevPage).toBe(false);
            expect(pagination.hasNextPage).toBe(false);
            expect(pagination.snapshotStack).toEqual([]);
        });
    });

    describe('fetching and navigation', () => {
        it('fetches an initial page sorted by createdAt desc', async () => {
            seedSessions([100, 500, 300]);
            const pagination = new Pagination({ pageSize: 2 });

            const { items, state } = await pagination.fetchPage(createSessionsCollectionRef(), 'initial');

            expect(items).toHaveLength(2);
            expect(items.map((item) => item.createdAt)).toEqual([500, 300]);
            expect(state.currentPage).toBe(1);
            expect(state.hasNextPage).toBe(true);
            expect(state.hasPrevPage).toBe(false);
            expect(pagination.getCachedItems()).toEqual(items);
        });

        it('goes to next page when hasNextPage is true', async () => {
            seedSessions([900, 800, 700, 600]);
            const pagination = new Pagination({ pageSize: 2 });
            const collectionRef = createSessionsCollectionRef();

            await pagination.fetchPage(collectionRef, 'initial');
            const nextResult = await pagination.nextPage(collectionRef);

            expect(nextResult.state.currentPage).toBe(2);
            expect(nextResult.items).toHaveLength(2);
            expect(nextResult.state.hasPrevPage).toBe(true);
        });

        it('returns cached items when calling nextPage without next page', async () => {
            const pagination = new Pagination();
            pagination.cachedItems = [{ id: 'cached-1' }];
            pagination.hasNextPage = false;

            const result = await pagination.nextPage(createSessionsCollectionRef());

            expect(result.items).toEqual([{ id: 'cached-1' }]);
            expect(result.state.currentPage).toBe(1);
        });

        it('goes to previous page when hasPrevPage is true', async () => {
            seedSessions([900, 800, 700, 600]);
            const pagination = new Pagination({ pageSize: 2 });
            const collectionRef = createSessionsCollectionRef();

            await pagination.fetchPage(collectionRef, 'initial');
            await pagination.nextPage(collectionRef);
            const prevResult = await pagination.prevPage(collectionRef);

            expect(prevResult.state.currentPage).toBe(1);
            expect(prevResult.state.hasPrevPage).toBe(false);
            expect(prevResult.items).toHaveLength(2);
        });

        it('returns cached items when calling prevPage without previous page', async () => {
            const pagination = new Pagination();
            pagination.cachedItems = [{ id: 'cached-1' }];
            pagination.hasPrevPage = false;

            const result = await pagination.prevPage(createSessionsCollectionRef());

            expect(result.items).toEqual([{ id: 'cached-1' }]);
            expect(result.state.currentPage).toBe(1);
        });

        it('refreshes current page data', async () => {
            seedSessions([900, 800, 700]);
            const pagination = new Pagination({ pageSize: 2 });
            const collectionRef = createSessionsCollectionRef();

            await pagination.fetchPage(collectionRef, 'initial');
            const refreshed = await pagination.refresh(collectionRef);

            expect(refreshed.items).toHaveLength(2);
            expect(refreshed.items.map((item) => item.createdAt)).toEqual([900, 800]);
            expect(refreshed.state.currentPage).toBe(1);
        });

        it('returns empty items for unsupported fetch direction', async () => {
            const pagination = new Pagination();
            const result = await pagination.fetchPage(createSessionsCollectionRef(), 'unknown');

            expect(result.items).toEqual([]);
            expect(result.state.currentPage).toBe(1);
        });

        it('logs and rethrows fetch errors', async () => {
            const pagination = new Pagination();
            const logSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

            await expect(
                pagination.fetchPage(null, 'initial')
            ).rejects.toThrow('Query source is required');

            expect(logSpy).toHaveBeenCalled();

            logSpy.mockRestore();
        });
    });
});
