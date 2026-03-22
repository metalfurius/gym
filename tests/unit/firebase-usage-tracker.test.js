import { describe, it, expect, beforeEach } from '@jest/globals';
import { FirebaseUsageTracker } from '../../js/utils/firebase-usage-tracker.js';

describe('FirebaseUsageTracker', () => {
    let tracker;

    beforeEach(() => {
        sessionStorage.clear();
        tracker = new FirebaseUsageTracker();
    });

    it('tracks reads and writes', () => {
        tracker.trackRead(5, 'history.pageFetch');
        tracker.trackWrite(2, 'session.save');

        const summary = tracker.getSummary();

        expect(summary.reads).toBe(5);
        expect(summary.writes).toBe(2);
        expect(summary.totalOperations).toBe(7);
    });

    it('aggregates top operations', () => {
        tracker.trackRead(3, 'history.pageFetch');
        tracker.trackRead(2, 'history.pageFetch');
        tracker.trackWrite(1, 'session.save');

        const summary = tracker.getSummary();
        const top = summary.topOperations[0];

        expect(top.operation).toBe('history.pageFetch');
        expect(top.type).toBe('read');
        expect(top.total).toBe(5);
    });

    it('resets counters', () => {
        tracker.trackRead(10, 'calendar.monthlyActivity');
        tracker.trackWrite(4, 'routines.update');

        tracker.reset();
        const summary = tracker.getSummary();

        expect(summary.reads).toBe(0);
        expect(summary.writes).toBe(0);
        expect(summary.topOperations.length).toBe(0);
    });
});
