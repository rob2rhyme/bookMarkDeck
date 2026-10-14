// An in-memory Web Locks registry for tests. jsdom has no navigator.locks, and
// the code under test only needs exclusive locks, `ifAvailable`, and pages
// that die: each `client()` is one page's LockManager over the same registry,
// and `crash(client)` is that page closing — its locks are released and its
// queued requests dropped, while its callbacks never hear about it.

type Callback = (lock: { name: string; mode: "exclusive" } | null) => unknown;

type Client = { id: string; dead: boolean; manager: LockManagerLike };

type Request = {
  client: Client;
  callback: Callback;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

export type LockManagerLike = {
  request(name: string, callback: Callback): Promise<unknown>;
  request(name: string, options: { ifAvailable?: boolean }, callback: Callback): Promise<unknown>;
};

export function webLocksMock() {
  const held = new Map<string, Client>();
  const queues = new Map<string, Request[]>();
  const clients: Client[] = [];
  let seq = 0;

  const release = (name: string, client: Client) => {
    if (held.get(name) !== client) return;
    held.delete(name);
    pump(name);
  };

  // Grants are asynchronous, as in browsers.
  const pump = (name: string) => {
    if (held.has(name)) return;
    const queue = queues.get(name) ?? [];
    let next = queue.shift();
    while (next && next.client.dead) next = queue.shift();
    if (!next) return;
    const { client, callback, resolve, reject } = next;
    held.set(name, client);
    Promise.resolve()
      .then(() => callback({ name, mode: "exclusive" }))
      .then(
        (v) => {
          release(name, client);
          resolve(v);
        },
        (e) => {
          release(name, client);
          reject(e);
        }
      );
  };

  const request = (
    client: Client,
    name: string,
    options: { ifAvailable?: boolean },
    callback: Callback
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (client.dead) return; // a closed page's request never settles
      const queue = queues.get(name) ?? [];
      if (options.ifAvailable && (held.has(name) || queue.length > 0)) {
        Promise.resolve()
          .then(() => callback(null))
          .then(resolve, reject);
        return;
      }
      queue.push({ client, callback, resolve, reject });
      queues.set(name, queue);
      Promise.resolve().then(() => pump(name));
    });

  const client = (): LockManagerLike => {
    const c: Client = { id: `page-${++seq}`, dead: false, manager: null as never };
    c.manager = {
      request: (name: string, a: unknown, b?: unknown) =>
        typeof a === "function"
          ? request(c, name, {}, a as Callback)
          : request(c, name, (a ?? {}) as { ifAvailable?: boolean }, b as Callback),
    } as LockManagerLike;
    clients.push(c);
    return c.manager;
  };

  const owner = (manager: LockManagerLike) => clients.find((c) => c.manager === manager);

  return {
    client,
    /** Make `manager` this page's navigator.locks. */
    use(manager: LockManagerLike | null) {
      Object.defineProperty(navigator, "locks", { value: manager ?? undefined, configurable: true });
    },
    /** Remove navigator.locks again. */
    uninstall() {
      delete (navigator as { locks?: unknown }).locks;
    },
    /** Another, live page holds `name` until the returned function is called. */
    holdAs(name: string): () => void {
      const other = owner(client())!;
      held.set(name, other);
      return () => release(name, other);
    },
    /** The page closes: its locks are released and its queued requests dropped. */
    crash(manager: LockManagerLike) {
      const c = owner(manager);
      if (!c) return;
      c.dead = true;
      for (const [name, holder] of [...held]) if (holder === c) release(name, c);
    },
    held: (name: string) => held.has(name),
    heldNames: () => [...held.keys()],
  };
}

export type WebLocksMock = ReturnType<typeof webLocksMock>;
