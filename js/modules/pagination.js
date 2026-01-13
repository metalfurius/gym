/**
 * Pagination utility class
 * Provides a reusable pagination implementation for Firestore queries
 */

import { query, orderBy, limit, startAfter, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { logger } from '../utils/logger.js';

/**
 * @typedef {Object} PaginationState
 * @property {number} currentPage - Current page number (1-indexed)
 * @property {number} pageSize - Number of items per page
 * @property {*} firstDocSnapshot - First document of current page
 * @property {*} lastDocSnapshot - Last document of current page
 * @property {Array} snapshotStack - Stack of first documents for navigation
 * @property {boolean} hasNextPage - Whether there's a next page
 * @property {boolean} hasPrevPage - Whether there's a previous page
 */

/**
 * @typedef {Object} PaginationResult
 * @property {Array} items - Array of items for the current page
 * @property {PaginationState} state - Current pagination state
 */

/**
 * Reusable Pagination class for Firestore collections
 */
export class Pagination {
    /**
     * Creates a new Pagination instance
     * @param {Object} options - Pagination options
     * @param {number} options.pageSize - Number of items per page (default: 10)
     * @param {string} options.orderByField - Field to order by (default: 'createdAt')
     * @param {string} options.orderDirection - Order direction: 'asc' or 'desc' (default: 'desc')
     */
    constructor(options = {}) {
        this.pageSize = options.pageSize || 10;
        this.orderByField = options.orderByField || 'createdAt';
        this.orderDirection = options.orderDirection || 'desc';
        
        this.reset();
    }

    /**
     * Resets pagination state to initial values
     */
    reset() {
        this.currentPage = 1;
        this.firstDocSnapshot = null;
        this.lastDocSnapshot = null;
        this.snapshotStack = [];
        this.hasNextPage = false;
        this.hasPrevPage = false;
        this.cachedItems = [];
    }

    /**
     * Gets the current pagination state
     * @returns {PaginationState}
     */
    getState() {
        return {
            currentPage: this.currentPage,
            pageSize: this.pageSize,
            firstDocSnapshot: this.firstDocSnapshot,
            lastDocSnapshot: this.lastDocSnapshot,
            snapshotStack: [...this.snapshotStack],
            hasNextPage: this.hasNextPage,
            hasPrevPage: this.hasPrevPage
        };
    }

    /**
     * Fetches a page of data from a Firestore collection
     * @param {CollectionReference} collectionRef - Firestore collection reference
     * @param {string} direction - Navigation direction: 'initial', 'next', or 'prev'
     * @returns {Promise<PaginationResult>}
     */
    async fetchPage(collectionRef, direction = 'initial') {
        let q;

        try {
            if (direction === 'initial') {
                this.reset();
                q = query(
                    collectionRef, 
                    orderBy(this.orderByField, this.orderDirection), 
                    limit(this.pageSize)
                );
            } else if (direction === 'next' && this.lastDocSnapshot) {
                q = query(
                    collectionRef,
                    orderBy(this.orderByField, this.orderDirection),
                    startAfter(this.lastDocSnapshot),
                    limit(this.pageSize)
                );
                this.currentPage++;
            } else if (direction === 'prev') {
                if (this.snapshotStack.length > 0) {
                    this.snapshotStack.pop();
                    const prevPageStartAfterDoc = this.snapshotStack.pop();
                    
                    if (prevPageStartAfterDoc) {
                        q = query(
                            collectionRef,
                            orderBy(this.orderByField, this.orderDirection),
                            startAfter(prevPageStartAfterDoc),
                            limit(this.pageSize)
                        );
                    } else {
                        q = query(
                            collectionRef,
                            orderBy(this.orderByField, this.orderDirection),
                            limit(this.pageSize)
                        );
                    }
                    this.currentPage--;
                } else {
                    return { items: [], state: this.getState() };
                }
            } else {
                return { items: [], state: this.getState() };
            }

            const querySnapshot = await getDocs(q);
            const items = [];
            
            querySnapshot.forEach((docSnap) => {
                items.push({ id: docSnap.id, ...docSnap.data() });
            });

            // Update pagination state
            if (querySnapshot.docs.length > 0) {
                const firstDoc = querySnapshot.docs[0];
                
                if (direction === 'initial') {
                    this.snapshotStack.push(null);
                }
                
                if (direction !== 'prev' || querySnapshot.docs.length > 0) {
                    this.snapshotStack.push(firstDoc);
                }

                this.firstDocSnapshot = firstDoc;
                this.lastDocSnapshot = querySnapshot.docs[querySnapshot.docs.length - 1];
            } else {
                if (direction === 'next') {
                    this.lastDocSnapshot = null;
                }
                if (direction === 'prev' && this.snapshotStack.length <= 1) {
                    this.snapshotStack = [null];
                }
            }

            // Update navigation flags
            this.hasNextPage = querySnapshot.docs.length >= this.pageSize;
            this.hasPrevPage = this.currentPage > 1 && this.snapshotStack.length > 1;
            
            this.cachedItems = [...items];

            return { items, state: this.getState() };
            
        } catch (error) {
            logger.error('Pagination fetch error:', error);
            throw error;
        }
    }

    /**
     * Goes to the next page
     * @param {CollectionReference} collectionRef - Firestore collection reference
     * @returns {Promise<PaginationResult>}
     */
    async nextPage(collectionRef) {
        if (!this.hasNextPage) {
            return { items: this.cachedItems, state: this.getState() };
        }
        return this.fetchPage(collectionRef, 'next');
    }

    /**
     * Goes to the previous page
     * @param {CollectionReference} collectionRef - Firestore collection reference
     * @returns {Promise<PaginationResult>}
     */
    async prevPage(collectionRef) {
        if (!this.hasPrevPage) {
            return { items: this.cachedItems, state: this.getState() };
        }
        return this.fetchPage(collectionRef, 'prev');
    }

    /**
     * Refreshes the current page
     * @param {CollectionReference} collectionRef - Firestore collection reference
     * @returns {Promise<PaginationResult>}
     */
    async refresh(collectionRef) {
        const startAfterDoc = this.snapshotStack.length > 1 
            ? this.snapshotStack[this.snapshotStack.length - 2] 
            : null;

        let q;
        if (startAfterDoc) {
            q = query(
                collectionRef,
                orderBy(this.orderByField, this.orderDirection),
                startAfter(startAfterDoc),
                limit(this.pageSize)
            );
        } else {
            q = query(
                collectionRef,
                orderBy(this.orderByField, this.orderDirection),
                limit(this.pageSize)
            );
        }

        try {
            const querySnapshot = await getDocs(q);
            const items = [];
            
            querySnapshot.forEach((docSnap) => {
                items.push({ id: docSnap.id, ...docSnap.data() });
            });

            if (querySnapshot.docs.length > 0) {
                this.firstDocSnapshot = querySnapshot.docs[0];
                this.lastDocSnapshot = querySnapshot.docs[querySnapshot.docs.length - 1];
            } else {
                this.lastDocSnapshot = null;
            }

            this.hasNextPage = querySnapshot.docs.length >= this.pageSize;
            this.hasPrevPage = this.currentPage > 1 && this.snapshotStack.length > 1;
            this.cachedItems = [...items];

            return { items, state: this.getState() };
            
        } catch (error) {
            logger.error('Pagination refresh error:', error);
            throw error;
        }
    }

    /**
     * Gets the cached items from the current page
     * @returns {Array}
     */
    getCachedItems() {
        return [...this.cachedItems];
    }

    /**
     * Finds an item in the cached items by ID
     * @param {string} id - The item ID to find
     * @returns {Object|undefined}
     */
    findCachedItem(id) {
        return this.cachedItems.find(item => item.id === id);
    }
}

/**
 * Creates a new Pagination instance with the specified options
 * @param {Object} options - Pagination options
 * @returns {Pagination}
 */
export function createPagination(options) {
    return new Pagination(options);
}

export default Pagination;
