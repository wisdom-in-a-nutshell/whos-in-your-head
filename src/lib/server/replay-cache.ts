type ReplayEntry<T> = {
  promise: Promise<T>;
  expiresAt: number;
};

export class PromiseReplayCache<T> {
  private readonly entries = new Map<string, ReplayEntry<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor({
    maxEntries,
    ttlMs
  }: {
    maxEntries: number;
    ttlMs: number;
  }) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  getOrCreate(
    key: string,
    create: () => Promise<T>,
    now = Date.now()
  ): { promise: Promise<T>; replayed: boolean } {
    this.deleteExpired(now);

    const existing = this.entries.get(key);

    if (existing && existing.expiresAt > now) {
      return {
        promise: existing.promise,
        replayed: true
      };
    }

    const entry: ReplayEntry<T> = {
      promise: readPromise(create),
      expiresAt: now + this.ttlMs
    };

    this.entries.set(key, entry);
    entry.promise.catch(() => {
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
      }
    });
    this.trimOldest();

    return {
      promise: entry.promise,
      replayed: false
    };
  }

  size(now = Date.now()) {
    this.deleteExpired(now);
    return this.entries.size;
  }

  private deleteExpired(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private trimOldest() {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;

      if (!oldestKey) {
        return;
      }

      this.entries.delete(oldestKey);
    }
  }
}

function readPromise<T>(create: () => Promise<T>) {
  try {
    return create();
  } catch (error) {
    return Promise.reject(error);
  }
}
