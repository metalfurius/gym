import assert from 'node:assert/strict';

// Observe only the pinned real SDK's fixed-project unary Commit endpoint.
// Raw URLs/query strings, headers, bodies, tokens and CDP request IDs are never
// returned or retained in evidence. No request is intercepted or rewritten.
export class CommitObservation {
    constructor() {
        this.active = false;
        this.rows = [];
        this.requests = new Map();
        this.probes = [];
    }
    begin() {
        assert(!this.active, 'QA_COMMIT_WINDOW_ALREADY_ACTIVE');
        this.active = true;
        this.rows = [];
        this.requests.clear();
        this.probes = [];
    }
    observe(event, onlineProbe) {
        if (!this.active) return;
        const value = event.params || {};
        if (event.method === 'Network.requestWillBeSent') {
            let url;
            try {
                url = new URL(value.request?.url);
            } catch {
                return;
            }
            if (
                url.origin !== 'https://firestore.googleapis.com' ||
                url.username ||
                url.password ||
                url.pathname !== '/v1/projects/gymm-178fb/databases/(default)/documents:commit' ||
                value.request?.method !== 'POST'
            ) {
                return;
            }
            assert(this.rows.length < 30, 'QA_COMMIT_OBSERVATION_LIMIT');
            assert(Number.isFinite(value.timestamp) && Number.isFinite(value.wallTime), 'QA_COMMIT_TIMESTAMP_MISSING');
            const row = {
                ordinal: this.rows.length + 1,
                startMono: value.timestamp,
                startWallMs: value.wallTime * 1000,
                online: null,
            };
            this.rows.push(row);
            this.requests.set(value.requestId, row);
            this.probes.push(
                Promise.resolve()
                    .then(onlineProbe)
                    .then(
                        online => {
                            row.online = online === true;
                        },
                        () => {
                            row.online = false;
                        }
                    )
            );
        } else {
            const row = this.requests.get(value.requestId);
            if (!row) return;
            if (event.method === 'Network.responseReceived') {
                assert(Number.isInteger(value.response?.status), 'QA_COMMIT_HTTP_STATUS');
                row.httpStatus = value.response.status;
            }
            if (['Network.loadingFinished', 'Network.loadingFailed'].includes(event.method)) {
                assert(Number.isFinite(value.timestamp) && value.timestamp >= row.startMono, 'QA_COMMIT_END_TIMESTAMP');
                row.endMono = value.timestamp;
                row.endWallMs = row.startWallMs + (value.timestamp - row.startMono) * 1000;
                row.failedTransport = event.method === 'Network.loadingFailed';
            }
        }
    }
    requireOpen(ordinal = 1) {
        const row = this.rows.find(item => item.ordinal === ordinal);
        assert(row && row.online === true && row.endMono === undefined, 'QA_SAME_COMMIT_NOT_OBSERVED_OPEN_ONLINE');
        return { ordinal: row.ordinal, startMono: row.startMono, startWallMs: row.startWallMs, online: true };
    }
    openFirst() {
        return this.rows[0]?.online === true && this.rows[0].endMono === undefined;
    }
    complete() {
        return this.rows.length > 0 && this.rows.every(row => row.endMono !== undefined && row.online !== null);
    }
    snapshot() {
        return this.rows.map(row => ({ ...row }));
    }
    async finish() {
        await Promise.all(this.probes);
        assert(this.complete(), 'QA_COMMIT_MEASUREMENT_INCOMPLETE');
        assert(
            this.rows.every(row => row.online),
            'QA_COMMIT_OBSERVED_OFFLINE'
        );
        assert(
            this.rows[0].failedTransport === false &&
                Number.isInteger(this.rows[0].httpStatus) &&
                this.rows[0].httpStatus >= 200 &&
                this.rows[0].httpStatus <= 599,
            'QA_FIRST_COMMIT_HTTP_RESPONSE_REQUIRED'
        );
        this.active = false;
        return this.snapshot();
    }
}

// Causal handshake avoids assuming synchronized Windows/Ubuntu wall clocks.
// A's SAME request must remain open from its announcement through observing
// B's acknowledgement that B's own request was open in between.
export async function coordinateOnlineOverlap({ browser, coord, role }) {
    const own = await browser.waitOpenCommit();
    if (role === 'A') {
        await coord.publishSignal('online-A-open', own);
        const peer = await coord.waitSignal('online-B-saw-A');
        assert.equal(peer.sawAOrdinal, own.ordinal, 'QA_OVERLAP_ACK_OTHER_REQUEST');
        browser.requireOpenCommit(own.ordinal);
        const proof = {
            aOrdinal: own.ordinal,
            bOrdinal: peer.own.ordinal,
            sameARequestStillOpen: true,
            bObservedOpenBetween: true,
            online: true,
            clockSynchronizationAssumed: false,
        };
        await coord.publishSignal('online-A-confirmed', proof);
        return proof;
    }
    assert.equal(role, 'B');
    const peer = await coord.waitSignal('online-A-open');
    browser.requireOpenCommit(own.ordinal);
    await coord.publishSignal('online-B-saw-A', { own, sawAOrdinal: peer.ordinal });
    const proof = await coord.waitSignal('online-A-confirmed');
    assert.equal(proof.bOrdinal, own.ordinal, 'QA_OVERLAP_CONFIRM_OTHER_REQUEST');
    return proof;
}
