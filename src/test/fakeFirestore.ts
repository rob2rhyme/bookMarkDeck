// A small in-memory stand-in for "firebase/firestore", for tests that need a library to
// go in and come back out (a vi.fn per call can't say what a document looks like after
// three writes and a delete). Use it as the mock factory:
//
//   vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).createFakeFirestore());
//
// It enforces what the real server enforces and the emulator doesn't: a document over
// 1 MiB is refused (`invalid-argument`), and a batch is at most 500 writes and 10 MiB.
// Sizes are counted by @/lib/docSize, which errs high — so a test passing here passes
// with margin. `__fake` exposes the store for assertions.

import { docBytes, MAX_DOC_BYTES } from "@/lib/docSize";

type Data = Record<string, unknown>;
type Ref = { kind: "doc"; path: string; id: string } | { kind: "collection"; path: string };
type Query = { kind: "query"; coll: Ref; order?: { field: string; dir: "asc" | "desc" } };

export class Timestamp {
  constructor(readonly ms: number) {}
  static fromDate(d: Date) {
    return new Timestamp(d.getTime());
  }
  static now() {
    return new Timestamp(Date.now());
  }
  toDate() {
    return new Date(this.ms);
  }
}

const SERVER_TIME = { __sentinel: "serverTimestamp" } as const;
const DELETE_FIELD = { __sentinel: "deleteField" } as const;
const isSentinel = (v: unknown, s: object): boolean => v === s;

function clone<T>(v: T): T {
  if (v instanceof Timestamp) return v;
  if (Array.isArray(v)) return v.map(clone) as T;
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v as Data).map(([k, x]) => [k, clone(x)])) as T;
  }
  return v;
}

function refused(message: string): Error {
  return Object.assign(new Error(message), { code: "invalid-argument" });
}

export function createFakeFirestore() {
  const store = new Map<string, Data>();
  let auto = 0;
  let batches = 0;
  const log: string[] = [];

  const segs = (parts: unknown[]) => parts.filter((p): p is string => typeof p === "string");
  const docRef = (path: string): Ref => ({ kind: "doc", path, id: path.split("/").at(-1)! });

  function doc(base: unknown, ...rest: unknown[]): Ref {
    const parts = segs(rest);
    const b = base as Ref | { __db: true };
    if ("__db" in b) return docRef(parts.join("/"));
    if (b.kind === "collection") return docRef(parts.length ? `${b.path}/${parts.join("/")}` : `${b.path}/auto${++auto}`);
    return docRef([b.path, ...parts].join("/"));
  }
  function collection(base: unknown, ...rest: unknown[]): Ref {
    const parts = segs(rest);
    const b = base as Ref | { __db: true };
    return { kind: "collection", path: "__db" in b ? parts.join("/") : [b.path, ...parts].join("/") };
  }

  const resolve = (value: unknown, existing: unknown): unknown => {
    if (isSentinel(value, SERVER_TIME)) return Timestamp.now();
    return value === undefined ? existing : clone(value);
  };

  function write(path: string, data: Data, merge: boolean) {
    const prior = store.get(path);
    const next: Data = merge && prior ? { ...prior } : {};
    for (const [k, v] of Object.entries(data)) {
      if (isSentinel(v, DELETE_FIELD)) delete next[k];
      else if (v !== undefined) next[k] = resolve(v, next[k]);
    }
    if (docBytes(path.split("/"), next) > MAX_DOC_BYTES) {
      throw refused(`Document ${path} exceeds the 1 MiB limit`);
    }
    store.set(path, next);
    log.push(`set ${path}`);
  }

  const children = (coll: Ref) =>
    [...store.entries()].filter(([p]) => {
      const prefix = `${coll.path}/`;
      return p.startsWith(prefix) && !p.slice(prefix.length).includes("/");
    });

  const snapshot = (path: string) => {
    const data = store.get(path);
    return { id: path.split("/").at(-1)!, ref: docRef(path), exists: () => data !== undefined, data: () => clone(data) as Data };
  };

  const api = {
    __db: true as const,
    Timestamp,
    doc,
    collection,
    serverTimestamp: () => SERVER_TIME,
    deleteField: () => DELETE_FIELD,
    orderBy: (field: string, dir: "asc" | "desc" = "asc") => ({ field, dir }),
    query: (coll: Ref, order?: { field: string; dir: "asc" | "desc" }): Query => ({ kind: "query", coll, order }),
    getDoc: async (ref: Ref) => snapshot(ref.path),
    getDocs: async (target: Ref | Query) => {
      const coll = target.kind === "query" ? target.coll : target;
      let docs = children(coll).map(([p]) => snapshot(p));
      if (target.kind === "query" && target.order) {
        const { field, dir } = target.order;
        const key = (d: ReturnType<typeof snapshot>) => {
          const v = d.data()[field];
          return v instanceof Timestamp ? v.ms : 0;
        };
        docs = docs.sort((a, b) => (dir === "desc" ? key(b) - key(a) : key(a) - key(b)));
      }
      return { docs, empty: docs.length === 0, size: docs.length };
    },
    setDoc: async (ref: Ref, data: Data, opts?: { merge?: boolean }) => write(ref.path, data, opts?.merge === true),
    addDoc: async (coll: Ref, data: Data) => {
      const ref = doc(coll);
      write(ref.path, data, false);
      return ref;
    },
    deleteDoc: async (ref: Ref) => {
      store.delete(ref.path);
      log.push(`delete ${ref.path}`);
    },
    writeBatch: () => {
      const ops: Array<() => void> = [];
      let bytes = 0;
      return {
        set(ref: Ref, data: Data, opts?: { merge?: boolean }) {
          bytes += docBytes(ref.path.split("/"), data as Data);
          ops.push(() => write(ref.path, data, opts?.merge === true));
        },
        delete(ref: Ref) {
          ops.push(() => {
            store.delete(ref.path);
            log.push(`delete ${ref.path}`);
          });
        },
        async commit() {
          if (ops.length > 500) throw refused("A batch holds at most 500 writes");
          if (bytes > 10 * 1024 * 1024) throw refused("A commit is at most 10 MiB");
          // All or nothing: apply to a copy, and keep it only if every write is accepted.
          const before = new Map([...store].map(([k, v]) => [k, clone(v)]));
          try {
            ops.forEach((op) => op());
            batches++;
          } catch (e) {
            store.clear();
            before.forEach((v, k) => store.set(k, v));
            throw e;
          }
        },
      };
    },
    __fake: {
      store,
      log,
      get batches() {
        return batches;
      },
      paths: (prefix: string) => [...store.keys()].filter((p) => p.startsWith(prefix)).sort(),
      get: (path: string) => store.get(path),
      put: (path: string, data: Data) => void store.set(path, clone(data)),
      reset: () => {
        store.clear();
        log.length = 0;
        batches = 0;
        auto = 0;
      },
    },
  };
  return api;
}
