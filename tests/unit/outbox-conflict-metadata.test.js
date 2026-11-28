import { beforeEach, describe, expect, it } from '@jest/globals';
import { OfflineManager } from '../../js/utils/offline-manager.js';
import { DurableOutbox } from '../../js/utils/durable-outbox.js';
import { LocalFirstCache } from '../../js/utils/local-first-cache.js';
import { mergeOutboxConflict } from '../../js/utils/outbox-order.js';

const make = () => new OfflineManager({ outbox: new DurableOutbox(new LocalFirstCache()) });
const legacy = { userId: 'A', weeklyTargetDays: 5, updatedAtIso: '2026-11-22T23:30:00.000Z' };
const conflict = (revision, weekKey) => ({ result: { currentRevision: revision, ...(weekKey ? { weekKey } : {}) } });
async function seed(client, payload = legacy, id = 'legacy-target') {
    client.queueOperation(null, 'legacy', { id, descriptor: { type: 'preferences.saveWeeklyTarget', payload } });
    await client.persistQueue(); await client.markConflict(id, conflict(3));
}

describe('monotonic durable conflict metadata', () => {
    beforeEach(() => localStorage.clear());

    it('preserves a learned canonical week through the exact stale-client public persist path', async () => {
        const a = make(), b = make();
        a.queueOperation(null, 'legacy', { id: 'legacy-target', descriptor: { type: 'preferences.saveWeeklyTarget', payload: legacy } });
        await a.persistQueue();
        await a.markConflict('legacy-target', conflict(3));
        await b.restorePersistedQueue();
        expect(b.pendingOperations[0].conflict.weekKey).toBeUndefined();
        await a.markConflict('legacy-target', conflict(3, '2026-11-16'));
        expect((await a.outbox.read()).entries[0].conflict.weekKey).toBe('2026-11-16');
        await b.persistQueue();
        expect(b.pendingOperations[0].conflict.weekKey).toBe('2026-11-16');
        expect(b.pendingOperations[0].descriptor.payload).toEqual(legacy);
        await b.resolveConflicts('A', '2026-11-16');
        expect(b.pendingOperations).toHaveLength(0);
        expect((await a.outbox.read()).entries).toHaveLength(0);
    });

    it.each([null, 2, 3, 7])('unions canonical context with the highest revision, independent of merge direction (%s)', revision => {
        const known = Object.freeze({ code: 'sync/conflict', currentRevision: 3, weekKey: '2026-11-16' });
        const oldProducer = Object.freeze({ code: 'sync/conflict', currentRevision: revision });
        const expected = { ...known, currentRevision: Math.max(3, revision ?? -1) };
        expect(mergeOutboxConflict(known, oldProducer)).toEqual(expected);
        expect(mergeOutboxConflict(oldProducer, known)).toEqual(expected);
        expect(known.currentRevision).toBe(3); expect(oldProducer).not.toHaveProperty('weekKey');
    });

    it.each([3, 8])('rejects contradictory known canonical weeks rather than choosing an arbitrary revision/row (%s)', revision => {
        try {
            mergeOutboxConflict({ currentRevision: 3, weekKey: '2026-11-16' }, { currentRevision: revision, weekKey: '2026-11-23' });
            throw new Error('Integrity rejection missing');
        } catch (error) {
            expect(error).toMatchObject({ code: 'outbox/integrity', reason: 'conflicting-canonical-week',
                canonicalWeeks: ['2026-11-16', '2026-11-23'] });
        }
    });

    it('retains canonical context through markConflict with higher metadata-poor revisions and a cold restore', async () => {
        const a = make(), b = make(); await seed(a);
        const original = JSON.parse(JSON.stringify(a.persistableEntry(a.pendingOperations[0])));
        await b.restorePersistedQueue(); await b.markConflict('legacy-target', conflict(5));
        await a.markConflict('legacy-target', conflict(3, '2026-11-16'));
        await b.markConflict('legacy-target', conflict(6));
        const cold = make(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations[0].conflict).toEqual({ code: 'sync/conflict', currentRevision: 6, weekKey: '2026-11-16' });
        expect(cold.pendingOperations[0].descriptor).toEqual(original.descriptor);
        expect(cold.pendingOperations[0].timestamp).toBe(original.timestamp);
        expect(cold.pendingOperations[0].id).toBe(original.id);
    });

    it.each([false, true])('merges conflict events and legacy conflict-bearing intents in reversed lexical row order (%s)', async reverse => {
        const client = make(); await seed(client);
        const original = client.persistableEntry(client.pendingOperations[0]);
        await client.outbox.storage.append([{ kind: 'conflict', id: original.id, conflict: { currentRevision: 3, weekKey: '2026-11-16' } }]);
        await client.outbox.storage.append([{ kind: 'intent', id: original.id, entry: { ...original, status: 'conflict', conflict: { currentRevision: 4 } } }]);
        await client.outbox.storage.append([{ kind: 'conflict', id: original.id, conflict: { currentRevision: 3 } }]);
        const outbox = new DurableOutbox(new LocalFirstCache());
        const actualRead = outbox.storage.readRows.bind(outbox.storage);
        outbox.storage.readRows = async () => (await actualRead()).sort((a, b) => reverse ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key));
        const [restored] = (await outbox.read()).entries;
        expect(restored.conflict).toMatchObject({ currentRevision: 4, weekKey: '2026-11-16' });
        expect(restored.timestamp).toBe(original.timestamp); expect(restored.descriptor).toEqual(original.descriptor);
    });

    it('does not append a stale downgrade, and rejects contradictory metadata before writing a batch', async () => {
        const client = make(); await seed(client); await client.markConflict('legacy-target', conflict(3, '2026-11-16'));
        const entry = client.persistableEntry(client.pendingOperations[0]);
        const count = (await client.outbox.storage.readRows()).length;
        await client.outbox.save([{ ...entry, conflict: { currentRevision: 3 } }]);
        expect((await client.outbox.storage.readRows()).length).toBe(count);
        await expect(client.outbox.save([{ ...entry, conflict: { currentRevision: 4, weekKey: '2026-11-23' } }]))
            .rejects.toMatchObject({ code: 'outbox/integrity', reason: 'conflicting-canonical-week', provenNotCommitted: true });
        expect((await client.outbox.storage.readRows()).length).toBe(count);
        expect((await client.outbox.read()).entries[0].conflict.weekKey).toBe('2026-11-16');
    });

    it('rejects a same-intent canonical fork within one proposed batch, and a fork already on disk', async () => {
        const client = make(); await seed(client);
        const entry = client.persistableEntry(client.pendingOperations[0]);
        await expect(client.outbox.save([
            { ...entry, conflict: { currentRevision: 3, weekKey: '2026-11-16' } },
            { ...entry, conflict: { currentRevision: 3, weekKey: '2026-11-23' } },
        ])).rejects.toMatchObject({ code: 'outbox/integrity' });
        await client.outbox.storage.append([
            { kind: 'conflict', id: entry.id, conflict: { currentRevision: 3, weekKey: '2026-11-16' } },
            { kind: 'conflict', id: entry.id, conflict: { currentRevision: 3, weekKey: '2026-11-23' } },
        ]);
        await expect(client.restorePersistedQueue()).rejects.toMatchObject({ code: 'outbox/integrity' });
        expect(client.queueViewVerified).toBe(false);
    });

    it.each(['accepted', 'resolved'])('keeps a durable %s tombstone permanent after stale conflict producers persist', async outcome => {
        const a = make(), b = make(); await seed(a); await a.markConflict('legacy-target', conflict(3, '2026-11-16'));
        await b.restorePersistedQueue(); const old = b.persistableEntry(b.pendingOperations[0]);
        if (outcome === 'accepted') await a.acknowledgeOperation('legacy-target');
        else await a.resolveConflicts('A', '2026-11-16');
        await b.markConflict('legacy-target', conflict(9)); await b.outbox.save([old]);
        const cold = make(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations).toHaveLength(0); expect(cold.acknowledged.get('legacy-target')).toBe(outcome);
    });

    it('refreshes before week selection and retains unrelated owners and weeks', async () => {
        const a = make(), b = make(); await seed(a); await b.restorePersistedQueue();
        await seed(a, { ...legacy, userId: 'B', weekKey: '2026-11-16' }, 'foreign');
        await seed(a, { ...legacy, weekKey: '2026-11-23' }, 'other-week');
        await a.markConflict('legacy-target', conflict(3, '2026-11-16'));
        await b.resolveConflicts('A', '2026-11-16');
        expect(b.pendingOperations.map(entry => entry.id).sort()).toEqual(['foreign', 'other-week']);
        expect(b.acknowledged.get('legacy-target')).toBe('resolved');
    });

    it('revalidates fresh metadata arriving after selection and before persist, without acknowledging the wrong week or dropping staged work', async () => {
        const a = make(), b = make();
        const localMonday = { ...legacy, updatedAtIso: new Date(2026, 10, 23, 0, 30).toISOString() };
        await seed(a, localMonday); await b.restorePersistedQueue();
        b.queueOperation(null, 'unrelated staged', { id: 'unrelated-staged', descriptor: { type: 'routines.fetch', payload: { userId: 'A' } } });
        const actualSave = b.outbox.save.bind(b.outbox); let enriched = false;
        b.outbox.save = async (...args) => {
            if (!enriched) { enriched = true; await a.markConflict('legacy-target', conflict(3, '2026-11-16')); }
            return actualSave(...args);
        };
        await b.resolveConflicts('A', '2026-11-23');
        const view = await a.outbox.read();
        expect(view.acknowledged.has('legacy-target')).toBe(false);
        expect(b.pendingOperations.find(entry => entry.id === 'legacy-target').conflict.weekKey).toBe('2026-11-16');
        expect(b.pendingAcknowledgements.has('legacy-target')).toBe(false);
        expect(b.resolutionCriteria.has('legacy-target')).toBe(false);
        expect(b.stagedIds.has('unrelated-staged')).toBe(true);
        await b.persistQueue();
        expect((await b.outbox.read()).entries.map(entry => entry.id).sort()).toEqual(['legacy-target', 'unrelated-staged']);
        await b.resolveConflicts('A', '2026-11-16');
        expect((await b.outbox.read()).entries.map(entry => entry.id)).toEqual(['unrelated-staged']);
        const events = (await b.outbox.storage.readRows()).flatMap(row => JSON.parse(row.value.eventsJson));
        expect(events.some(event => Object.hasOwn(event, 'resolution'))).toBe(false);
    });
});
