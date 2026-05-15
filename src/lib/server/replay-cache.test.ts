import { describe, expect, it, vi } from "vitest";
import { PromiseReplayCache } from "./replay-cache";

describe("PromiseReplayCache", () => {
  it("reuses an in-flight promise for the same key", async () => {
    const cache = new PromiseReplayCache<string>({
      maxEntries: 10,
      ttlMs: 60_000
    });
    const create = vi.fn(async () => "done");

    const first = cache.getOrCreate("same-turn", create, 1000);
    const second = cache.getOrCreate("same-turn", create, 1000);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(first.promise).toBe(second.promise);
    await expect(second.promise).resolves.toBe("done");
    expect(create).toHaveBeenCalledOnce();
  });

  it("keeps a completed result briefly for lost-response retries", async () => {
    const cache = new PromiseReplayCache<string>({
      maxEntries: 10,
      ttlMs: 60_000
    });
    const create = vi.fn(async () => "done");

    await cache.getOrCreate("same-turn", create, 1000).promise;
    const replay = cache.getOrCreate("same-turn", create, 2000);

    expect(replay.replayed).toBe(true);
    await expect(replay.promise).resolves.toBe("done");
    expect(create).toHaveBeenCalledOnce();
  });

  it("removes failed entries so the same answer can be retried", async () => {
    const cache = new PromiseReplayCache<string>({
      maxEntries: 10,
      ttlMs: 60_000
    });
    const create = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce("recovered");

    await expect(cache.getOrCreate("same-turn", create, 1000).promise).rejects.toThrow(
      "temporary"
    );
    const retry = cache.getOrCreate("same-turn", create, 2000);

    expect(retry.replayed).toBe(false);
    await expect(retry.promise).resolves.toBe("recovered");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("expires old entries", async () => {
    const cache = new PromiseReplayCache<string>({
      maxEntries: 10,
      ttlMs: 1000
    });
    const create = vi.fn(async () => "done");

    await cache.getOrCreate("same-turn", create, 1000).promise;
    const replay = cache.getOrCreate("same-turn", create, 2001);

    expect(replay.replayed).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
