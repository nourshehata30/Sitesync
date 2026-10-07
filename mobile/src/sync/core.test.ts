import { applyServer, emptyState, localEdit, pendingCount, visible, Inspection, ServerResponse } from "./core";

const ID = "11111111-1111-4111-8111-111111111111";

const serverRec = (over: Partial<Inspection> = {}): Inspection => ({
  id: ID, title: "", site: "", status: "open", severity: 1, notes: "", photos: [],
  deleted: false, field_ts: {}, seq: 1, ...over,
});

const res = (over: Partial<ServerResponse> = {}): ServerResponse => ({
  cursor: 1, has_more: false, records: [], conflicts: [], ...over,
});

describe("localEdit", () => {
  it("applies optimistically and queues a coalesced patch", () => {
    let s = localEdit(emptyState(), ID, { title: "Roof" }, 100);
    s = localEdit(s, ID, { title: "Roof leak", severity: 4 }, 200);
    expect(s.records[ID].title).toBe("Roof leak");
    expect(s.pending[ID]).toEqual({
      fields: { title: "Roof leak", severity: 4 },
      field_ts: { title: 200, severity: 200 },
    });
    expect(pendingCount(s)).toBe(1);
  });
});

describe("applyServer", () => {
  it("clears acknowledged edits and advances the cursor", () => {
    const s = localEdit(emptyState(), ID, { title: "Roof" }, 100);
    const out = applyServer(s, s.pending, res({ cursor: 7, records: [serverRec({ title: "Roof", seq: 7 })] }));
    expect(out.pending).toEqual({});
    expect(out.cursor).toBe(7);
  });

  it("keeps an edit made while the request was in flight", () => {
    const s1 = localEdit(emptyState(), ID, { title: "Roof" }, 100);
    const sent = s1.pending;
    const s2 = localEdit(s1, ID, { title: "Roof v2" }, 150); // user types during the request
    const out = applyServer(s2, sent, res({ records: [serverRec({ title: "Roof" })] }));
    expect(out.pending[ID].fields).toEqual({ title: "Roof v2" });
    expect(out.records[ID].title).toBe("Roof v2"); // UI doesn't flicker back
  });

  it("only requeues the field that changed in flight", () => {
    const s1 = localEdit(emptyState(), ID, { title: "A", notes: "n" }, 100);
    const s2 = localEdit(s1, ID, { notes: "n2" }, 150);
    const out = applyServer(s2, s1.pending, res({ records: [serverRec()] }));
    expect(Object.keys(out.pending[ID].fields)).toEqual(["notes"]);
  });

  it("accepts server-side winners and surfaces conflicts", () => {
    const s = localEdit(emptyState(), ID, { status: "in_review" }, 100);
    const conflict = { id: ID, field: "status", kept: "closed", rejected: "in_review", reason: "stale" as const };
    const out = applyServer(s, s.pending, res({ records: [serverRec({ status: "closed" })], conflicts: [conflict] }));
    expect(out.records[ID].status).toBe("closed");
    expect(out.lastConflicts).toEqual([conflict]);
  });

  it("hides tombstoned records from the list", () => {
    const s = applyServer(emptyState(), {}, res({ records: [serverRec({ deleted: true })] }));
    expect(visible(s)).toHaveLength(0);
  });
});
