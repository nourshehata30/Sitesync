async def test_local_upload_roundtrip_and_ownership(client, auth):
    t = (await client.post("/api/uploads/ticket", headers=auth)).json()
    assert t["blob_name"].endswith(".jpg")

    path = t["upload_url"].replace("http://localhost:8000", "")
    put = await client.put(path, content=b"\xff\xd8fakejpeg", headers={**auth, **t["headers"]})
    assert put.status_code == 201

    url = (await client.get("/api/uploads/read-url", params={"blob_name": t["blob_name"]}, headers=auth)).json()["url"]
    got = await client.get(url.replace("http://localhost:8000", ""), headers=auth)
    assert got.content == b"\xff\xd8fakejpeg"

    # Another user cannot read or write into this user's namespace.
    r = await client.post("/api/auth/register", json={"email": "intruder@x.io", "password": "password123"})
    other = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert (await client.get(path, headers=other)).status_code == 404
    assert (await client.put(path, content=b"x", headers=other)).status_code == 403
