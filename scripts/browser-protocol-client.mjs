import WebSocket from 'ws';

export class ProtocolClient {
    constructor(url, onEvent) {
        this.nextId = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
        this.onEvent = onEvent;
        this.rejectPending = error => {
            for (const request of this.pending.values()) request.reject(error);
            this.pending.clear();
        };
        this.socket.on('message', bytes => {
            const message = JSON.parse(String(bytes));
            if (message.id && this.pending.has(message.id)) {
                const request = this.pending.get(message.id); this.pending.delete(message.id);
                if (message.error) {
                    request.reject(new Error(typeof message.error === 'string'
                        ? `${message.error}: ${message.message || ''}` : message.error.message));
                } else request.resolve(message.result || {});
            } else if (message.method) onEvent(message);
        });
        this.socket.on('close', () => this.rejectPending(new Error('Browser protocol disconnected')));
        this.socket.on('error', error => this.rejectPending(error));
        this.openPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Browser protocol connection timed out')), 10_000);
            this.socket.once('open', () => { clearTimeout(timeout); resolve(); });
            this.socket.once('error', error => { clearTimeout(timeout); reject(error); });
            this.socket.once('close', () => { clearTimeout(timeout); reject(new Error('Browser protocol disconnected')); });
        });
    }

    async send(method, params = {}, sessionId) {
        await this.openPromise;
        const id = this.nextId++;
        this.onEvent({ method: 'BrowserProtocol.command', params: { method, sessionId, url: params.url, targetId: params.targetId } });
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 10_000);
            this.pending.set(id, {
                resolve: value => { clearTimeout(timer); resolve(value); },
                reject: error => { clearTimeout(timer); reject(error); },
            });
            try { this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
            catch (error) { this.pending.get(id)?.reject(error); this.pending.delete(id); }
        });
    }

    close() {
        this.rejectPending(new Error('Browser protocol client closed'));
        this.socket.terminate();
    }
}

