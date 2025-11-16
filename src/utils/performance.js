const DEFAULT_TTL_MS = 60 * 1000;

class TimedCache {
    constructor(defaultTtl = DEFAULT_TTL_MS) {
        this.defaultTtl = defaultTtl;
        this.store = new Map();
    }

    _now() {
        return Date.now();
    }

    _isExpired(entry) {
        return entry.expiresAt !== 0 && entry.expiresAt <= this._now();
    }

    set(key, value, ttl = this.defaultTtl) {
        if (key == null) return value;
        const expiresAt = ttl > 0 ? this._now() + ttl : 0;
        this.store.set(key, { value, expiresAt });
        return value;
    }

    get(key) {
        if (key == null) return null;
        const entry = this.store.get(key);
        if (!entry) return null;
        if (this._isExpired(entry)) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }

    delete(key) {
        if (key == null) return;
        this.store.delete(key);
    }

    clear() {
        this.store.clear();
    }

    prune() {
        const now = this._now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.expiresAt !== 0 && entry.expiresAt <= now) {
                this.store.delete(key);
            }
        }
    }
}

class BackgroundQueue {
    constructor() {
        this.pending = new Set();
    }

    run(task) {
        if (typeof task !== 'function') return;

        const wrapped = async () => {
            try {
                await task();
            } catch (error) {
                console.error('Error en una tarea en segundo plano:', error);
            } finally {
                this.pending.delete(wrapped);
            }
        };

        this.pending.add(wrapped);
        setImmediate(wrapped);
    }

    size() {
        return this.pending.size;
    }

    clear() {
        this.pending.clear();
    }
}

module.exports = { TimedCache, BackgroundQueue };
