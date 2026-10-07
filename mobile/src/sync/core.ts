/**
 * Pure, framework-free sync core. No I/O -> trivially unit-testable.
 *
 * Model: every inspection field is a last-writer-wins register stamped with the
 * client edit time. Offline edits are coalesced into one pending patch per record;
 * the server merges them field-by-field (see backend/app/services/sync.py).
 */

export type Status = "open" | "in_review" | "closed";

export interface Inspection {
  id: string;
  title: string;
  site: string;
  status: Status;
  severity: number;
  notes: string;
  photos: string[]; // blob names (uploaded)
  deleted: boolean;
  field_ts: Record<string, number>;
  seq: number;
}

export type Editable = Partial<Omit<Inspection, "id" | "field_ts" | "seq">>;

export interface Patch {
  fields: Editable;
  field_ts: Record<string, number>;
}

export interface Conflict {
  id: string;
  field: string;
  kept: unknown;
  rejected: unknown;
  reason: "stale" | "invalid";
}

export interface PendingPhoto {
  inspectionId: string;
  uri: string;
}

export interface SyncState {
  records: Record<string, Inspection>;
  pending: Record<string, Patch>;
  photoQueue: PendingPhoto[];
  cursor: number;
  lastConflicts: Conflict[];
}

export const emptyState = (): SyncState => ({
  records: {},
  pending: {},
  photoQueue: [],
  cursor: 0,
  lastConflicts: [],
});

const blank = (id: string): Inspection => ({
  id,
  title: "",
  site: "",
  status: "open",
  severity: 1,
  notes: "",
  photos: [],
  deleted: false,
  field_ts: {},
  seq: 0,
});

/** Optimistic local edit: visible immediately, queued for the next sync. */
export function localEdit(state: SyncState, id: string, edit: Editable, now: number): SyncState {
  const base = state.records[id] ?? blank(id);
  const prev = state.pending[id] ?? { fields: {}, field_ts: {} };
  const ts = Object.fromEntries(Object.keys(edit).map((k) => [k, now]));
  return {
    ...state,
    records: { ...state.records, [id]: { ...base, ...edit } as Inspection },
    pending: { ...state.pending, [id]: { fields: { ...prev.fields, ...edit }, field_ts: { ...prev.field_ts, ...ts } } },
  };
}

export interface ServerResponse {
  cursor: number;
  has_more: boolean;
  records: Inspection[];
  conflicts: Conflict[];
}

/**
 * Fold a server response into local state.
 * `sent` is the snapshot of pending patches that went over the wire. A field is only
 * cleared from the queue if the user hasn't edited it again while the request was in
 * flight (same timestamp) -- otherwise that newer edit must survive to the next sync.
 * Remaining pending edits are re-applied on top of server records so the UI never
 * flickers back to stale data.
 */
export function applyServer(state: SyncState, sent: Record<string, Patch>, res: ServerResponse): SyncState {
  const pending: Record<string, Patch> = {};
  for (const [id, patch] of Object.entries(state.pending)) {
    const was = sent[id];
    const fields: Editable = {};
    const field_ts: Record<string, number> = {};
    for (const key of Object.keys(patch.fields) as (keyof Editable)[]) {
      const unchanged = was && was.field_ts[key] === patch.field_ts[key];
      if (!unchanged) {
        (fields as Record<string, unknown>)[key] = patch.fields[key];
        field_ts[key] = patch.field_ts[key];
      }
    }
    if (Object.keys(fields).length) pending[id] = { fields, field_ts };
  }

  const records = { ...state.records };
  for (const rec of res.records) {
    const overlay = pending[rec.id]?.fields ?? {};
    records[rec.id] = { ...rec, ...overlay } as Inspection;
  }

  return {
    ...state,
    records,
    pending,
    cursor: res.cursor,
    lastConflicts: res.conflicts,
  };
}

export const pendingCount = (s: SyncState) => Object.keys(s.pending).length + s.photoQueue.length;

export const visible = (s: SyncState): Inspection[] =>
  Object.values(s.records)
    .filter((r) => !r.deleted)
    .sort((a, b) => (b.field_ts.title ?? 0) - (a.field_ts.title ?? 0));
