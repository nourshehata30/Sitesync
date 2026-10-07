import uuid

from .conftest import change


def new_id() -> str:
    return str(uuid.uuid4())


async def push(client, auth, cursor=0, *changes):
    r = await client.post("/api/sync", json={"cursor": cursor, "changes": list(changes)}, headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


async def test_create_and_pull_on_second_device(client, auth):
    i = new_id()
    first = await push(client, auth, 0, change(i, 1000, title="Boiler room", severity=3))
    assert first["records"][0]["title"] == "Boiler room"

    # A "second device" with an empty cursor receives the same record.
    other = await push(client, auth, 0)
    assert [r["id"] for r in other["records"]] == [i]
    assert other["cursor"] == first["cursor"]

    # Nothing new after the cursor.
    again = await push(client, auth, other["cursor"])
    assert again["records"] == []


async def test_concurrent_edits_to_different_fields_both_survive(client, auth):
    i = new_id()
    await push(client, auth, 0, change(i, 1000, title="Roof", notes="", severity=1))

    # Device A (offline) edits severity at t=2000; device B (offline) edits notes at t=2500.
    await push(client, auth, 0, change(i, 2000, severity=4))
    res = await push(client, auth, 0, change(i, 2500, notes="Cracked flashing"))

    rec = res["records"][0]
    assert rec["severity"] == 4 and rec["notes"] == "Cracked flashing"
    assert res["conflicts"] == []


async def test_same_field_last_writer_wins_and_reports_conflict(client, auth):
    i = new_id()
    await push(client, auth, 0, change(i, 1000, status="open"))
    await push(client, auth, 0, change(i, 3000, status="closed"))

    # A stale device comes online with an older edit to the same field.
    res = await push(client, auth, 0, change(i, 2000, status="in_review"))
    assert res["records"][0]["status"] == "closed"
    assert res["conflicts"] == [
        {"id": i, "field": "status", "kept": "closed", "rejected": "in_review", "reason": "stale"}
    ]


async def test_push_is_idempotent(client, auth):
    i = new_id()
    c = change(i, 1000, title="Lift", severity=2)
    a = await push(client, auth, 0, c)
    b = await push(client, auth, 0, c, c)  # network retry sends it again
    assert b["conflicts"] == []
    assert b["records"][0]["seq"] == a["records"][0]["seq"]  # no spurious version bump


async def test_photos_merge_as_a_set(client, auth):
    i = new_id()
    await push(client, auth, 0, change(i, 1000, photos=["u/a.jpg"]))
    res = await push(client, auth, 0, change(i, 900, photos=["u/b.jpg"]))  # older ts, still kept
    assert sorted(res["records"][0]["photos"]) == ["u/a.jpg", "u/b.jpg"]


async def test_delete_is_a_replicated_tombstone(client, auth):
    i = new_id()
    first = await push(client, auth, 0, change(i, 1000, title="Temp"))
    res = await push(client, auth, first["cursor"], change(i, 2000, deleted=True))
    assert res["records"][0]["deleted"] is True


async def test_invalid_fields_are_rejected_without_blocking_the_batch(client, auth):
    good, bad = new_id(), new_id()
    res = await push(
        client, auth, 0, change(bad, 1000, severity=99, title="x"), change(good, 1000, title="ok")
    )
    assert {r["id"] for r in res["records"]} == {good, bad}
    assert [(c["field"], c["reason"]) for c in res["conflicts"]] == [("severity", "invalid")]


async def test_users_are_isolated(client, auth):
    i = new_id()
    await push(client, auth, 0, change(i, 1000, title="Secret"))

    r = await client.post("/api/auth/register", json={"email": f"{new_id()}@x.io", "password": "password123"})
    other = {"Authorization": f"Bearer {r.json()['access_token']}"}

    assert (await push(client, other, 0))["records"] == []
    hijack = await push(client, other, 0, change(i, 9999, title="Pwned"))
    assert hijack["conflicts"][0]["reason"] == "invalid"
    assert (await push(client, auth, 0))["records"][0]["title"] == "Secret"


async def test_requires_auth(client):
    assert (await client.post("/api/sync", json={"cursor": 0, "changes": []})).status_code == 401
