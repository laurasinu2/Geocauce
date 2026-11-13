import os
from uuid import uuid4
from urllib.parse import quote

os.environ["JWT_SECRET"] = "test-only-secret-abcdefghijklmnopqrstuvwxyz-0123456789"
os.environ["ALLOW_SIGNUP"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import geocauce_api.app as api_module
from geocauce_api.app import app
from geocauce_api.database import Base, User, get_db
from geocauce_api.security import hashed_password


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    maker = sessionmaker(engine, expire_on_commit=False, autoflush=False)

    def override():
        with maker() as db:
            yield db

    app.dependency_overrides[get_db] = override
    monkeypatch.setattr(api_module, "FILE_ROOT", tmp_path)
    with maker.begin() as db:
        db.add(User(id="11111111-1111-4111-8111-111111111111", email="owner@example.org",
                    password_hash=hashed_password("correct-horse-battery-staple")))
        db.add(User(id="22222222-2222-4222-8222-222222222222", email="other@example.org",
                    password_hash=hashed_password("other-very-long-password")))
    client = TestClient(app)
    yield client, maker, tmp_path
    app.dependency_overrides.clear()
    engine.dispose()


def login(client, email="owner@example.org", password="correct-horse-battery-staple"):
    response = client.post("/auth/v1/token?grant_type=password", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def h(session):
    return {"Authorization": f"Bearer {session['access_token']}"}


def make_project(client, session):
    pid = str(uuid4())
    r = client.post("/rest/v1/projects?on_conflict=id", json=[{
        "id": pid, "owner_id": session["user"]["id"], "name": "Estudio de campo",
        "zone": "Mataró", "metadata": {"author": "L"}}], headers=h(session))
    assert r.status_code == 201, r.text
    return pid


def test_closed_signup_and_auth_required(env):
    c, _, _ = env
    assert c.get("/rest/v1/projects").status_code == 401
    assert c.post("/auth/v1/signup", json={"email": "new@example.org", "password": "long-enough-password"}).status_code == 403
    assert c.post("/auth/v1/token?grant_type=password", json={"email": "owner@example.org", "password": "wrong"}).status_code == 401
    assert c.get("/health").json()["status"] == "ok"


def test_supabase_r41_snapshot_compatibility_and_cas(env):
    c, _, _ = env
    session = login(c)
    pid = make_project(c, session)
    assert c.get("/rest/v1/projects?select=id&limit=0", headers=h(session)).json() == []
    r = c.post("/rest/v1/project_snapshots?on_conflict=project_id&select=updated_at",
               json=[{"project_id": pid, "owner_id": session["user"]["id"],
                      "state": {"projectId": pid, "assetMetadata": {}}, "palette": []}],
               headers={**h(session), "Prefer": "resolution=ignore-duplicates,return=representation"})
    assert r.status_code == 200, r.text
    version = r.json()[0]["updated_at"]
    assert version.endswith("+00:00")
    r2 = c.post("/rest/v1/project_snapshots?on_conflict=project_id", json=[{
        "project_id": pid, "state": {"projectId": pid, "deleted": True}}],
        headers={**h(session), "Prefer": "resolution=ignore-duplicates,return=representation"})
    assert r2.json() == []
    good = c.patch(f"/rest/v1/project_snapshots?project_id=eq.{pid}&updated_at=eq.{quote(version)}&select=updated_at",
                   json={"state": {"projectId": pid, "v": 2}},
                   headers={**h(session), "Prefer": "return=representation"})
    assert good.status_code == 200, good.text
    new_version = good.json()[0]["updated_at"]
    assert new_version != version
    stale = c.patch(f"/rest/v1/project_snapshots?project_id=eq.{pid}&updated_at=eq.{quote(version)}&select=updated_at",
                    json={"state": {"projectId": pid, "v": 0}},
                    headers={**h(session), "Prefer": "return=representation"})
    assert stale.status_code == 200 and stale.json() == []
    got = c.get(f"/rest/v1/project_snapshots?project_id=eq.{pid}&select=state,updated_at", headers=h(session))
    assert got.json() == [{"state": {"projectId": pid, "v": 2}, "updated_at": new_version}]


def test_storage_immutable_private_and_retrievable(env):
    c, _, _ = env
    owner = login(c)
    pid = make_project(c, owner)
    path = f"{owner['user']['id']}/{pid}/photos/abc.123.bin"
    url = "/storage/v1/object/geocauce-files/" + path
    result = c.post(url, headers={**h(owner), "Content-Type": "application/octet-stream"}, content=b"the-photo")
    assert result.status_code == 200, result.text
    assert c.post(url, headers=h(owner), content=b"the-photo").status_code == 200
    assert c.post(url, headers=h(owner), content=b"different").status_code == 409
    info = c.get("/storage/v1/object/info/geocauce-files/" + path, headers=h(owner))
    assert info.status_code == 200 and info.json()["metadata"]["size"] == len(b"the-photo")
    downloaded = c.get("/storage/v1/object/authenticated/geocauce-files/" + path, headers=h(owner))
    assert downloaded.content == b"the-photo"
    other = login(c, "other@example.org", "other-very-long-password")
    assert c.get("/storage/v1/object/authenticated/geocauce-files/" + path, headers=h(other)).status_code == 404
    assert c.request("DELETE", "/storage/v1/object/geocauce-files", json={"prefixes": [path]}, headers=h(owner)).status_code == 409


def test_permissions_sharing_and_role_revocation(env):
    c, _, _ = env
    owner = login(c)
    other = login(c, "other@example.org", "other-very-long-password")
    pid = make_project(c, owner)
    assert c.post("/rest/v1/rpc/geocauce_project_role", json={"p_project_id": pid}, headers=h(other)).json() is None
    invite = c.post("/rest/v1/rpc/geocauce_set_project_member", json={
        "p_project_id": pid, "p_email": "other@example.org", "p_role": "viewer"}, headers=h(owner))
    assert invite.status_code == 200, invite.text
    assert c.post("/rest/v1/rpc/geocauce_project_role", json={"p_project_id": pid}, headers=h(other)).json() == "viewer"
    r = c.post("/rest/v1/project_snapshots", json=[{"project_id": pid, "state": {"x": 1}}], headers=h(other))
    assert r.status_code == 404
    c.post("/rest/v1/rpc/geocauce_set_project_member", json={
        "p_project_id": pid, "p_email": "other@example.org", "p_role": "editor"}, headers=h(owner))
    r2 = c.post("/rest/v1/project_snapshots?on_conflict=project_id", json=[{"project_id": pid, "state": {"x": 1}}],
                headers={**h(other), "Prefer": "return=representation"})
    assert r2.status_code == 200, r2.text
    c.post("/rest/v1/rpc/geocauce_remove_project_member", json={"p_project_id": pid,
        "p_user_id": other["user"]["id"]}, headers=h(owner))
    assert c.get(f"/api/v1/projects/{pid}/snapshot", headers=h(other)).status_code == 404


def test_refresh_rotation_and_logout(env):
    c, _, _ = env
    session = login(c)
    r = c.post("/auth/v1/token?grant_type=refresh_token", json={"refresh_token": session["refresh_token"]})
    assert r.status_code == 200, r.text
    newer = r.json()
    assert c.post("/auth/v1/token?grant_type=refresh_token", json={"refresh_token": session["refresh_token"]}).status_code == 401
    assert c.post("/auth/v1/logout?scope=local", json={}, headers=h(newer)).status_code == 200
    assert c.post("/auth/v1/token?grant_type=refresh_token", json={"refresh_token": newer["refresh_token"]}).status_code == 401


def test_v1_api_contract(env):
    c, _, _ = env
    session = login(c)
    pid = make_project(c, session)
    r = c.put(f"/api/v1/projects/{pid}/snapshot", json={"state": {"campaigns": []}}, headers=h(session))
    assert r.status_code == 200, r.text
    version = r.json()["updated_at"]
    assert c.put(f"/api/v1/projects/{pid}/snapshot", json={"state": {"campaigns": []}}, headers=h(session)).status_code == 428
    assert c.put(f"/api/v1/projects/{pid}/snapshot", json={"state": {"campaigns": [], "v": 1},
                         "expected_updated_at": version}, headers=h(session)).status_code == 200
    assert c.put(f"/api/v1/projects/{pid}/snapshot", json={"state": {"campaigns": [], "v": 2},
                         "expected_updated_at": version}, headers=h(session)).status_code == 409


def test_first_cloud_sync_from_r43_with_map_and_photo(env):
    """Regression: first GET is empty, then create project, upload binary chunks and commit snapshot."""
    c, _, _ = env
    owner = login(c)
    stranger = login(c, "other@example.org", "other-very-long-password")
    pid = str(uuid4())
    base = f"/rest/v1/project_snapshots?project_id=eq.{pid}&select=updated_at&limit=1"

    # A new local-only project does not exist in PostgreSQL yet; GET is NOT an error.
    response = c.get(base, headers=h(owner))
    assert response.status_code == 200 and response.json() == []
    assert c.get(base, headers=h(stranger)).status_code == 200
    assert c.get("/rest/v1/projects?select=id&limit=0", headers=h(owner)).json() == []

    project = {"id": pid, "owner_id": owner["user"]["id"], "name": "Test Cauces",
               "zone": "Ensayo", "crs": "EPSG:25831", "metadata": {"author": "Laura"}}
    register = c.post("/rest/v1/projects?on_conflict=id",
                      json=[project], headers={**h(owner),
                                             "Prefer": "resolution=merge-duplicates,return=minimal"})
    assert register.status_code in (200, 201), register.text
    assert c.get(base, headers=h(owner)).json() == []
    assert c.get(base, headers=h(stranger)).status_code == 404

    path = f"{owner['user']['id']}/{pid}/rasters/map-file.part0000"
    object_url = f"/storage/v1/object/geocauce-files/{path}"
    chunk = b"example-geotiff-fragment"
    uploaded = c.post(object_url, content=chunk, headers=h(owner))
    assert uploaded.status_code == 200, uploaded.text
    info = c.get(f"/storage/v1/object/info/geocauce-files/{path}", headers=h(owner))
    assert info.status_code == 200
    assert info.json()["metadata"]["size"] == len(chunk)

    state = {"projectId": "P-local", "campaigns": [{"id": "D01", "upserts": [
        {"id": "r1", "type": "watercourse"}, {"id": "r2", "type": "reach"}]}],
        "assetMetadata": {"photos": [], "rasters": [{"id": "m1", "cloudPreviewPath": path}],
                          "vectorLayers": []}}
    inserted = c.post("/rest/v1/project_snapshots?on_conflict=project_id&select=updated_at",
                      json=[{"project_id": pid, "owner_id": owner["user"]["id"],
                             "state": state, "palette": []}],
                      headers={**h(owner), "Prefer": "resolution=ignore-duplicates,return=representation"})
    assert inserted.status_code == 200, inserted.text
    assert len(inserted.json()) == 1
    version = inserted.json()[0]["updated_at"]

    restored = c.get(f"/rest/v1/project_snapshots?project_id=eq.{pid}&select=state,updated_at",
                     headers=h(owner))
    assert restored.status_code == 200
    assert restored.json()[0]["state"] == state
    assert restored.json()[0]["updated_at"] == version
    downloaded = c.get(f"/storage/v1/object/authenticated/geocauce-files/{path}", headers=h(owner))
    assert downloaded.status_code == 200 and downloaded.content == chunk

    # A stale device must not overwrite the committed version.
    first_patch = c.patch(
        f"/rest/v1/project_snapshots?project_id=eq.{pid}&updated_at=eq.{quote(version)}&select=updated_at",
        json={"state": {**state, "revision": 2}},
        headers={**h(owner), "Prefer": "return=representation"})
    assert first_patch.status_code == 200 and len(first_patch.json()) == 1
    stale_patch = c.patch(
        f"/rest/v1/project_snapshots?project_id=eq.{pid}&updated_at=eq.{quote(version)}&select=updated_at",
        json={"state": {**state, "revision": -1}},
        headers={**h(owner), "Prefer": "return=representation"})
    assert stale_patch.status_code == 200 and stale_patch.json() == []
    verify = c.get(f"/rest/v1/project_snapshots?project_id=eq.{pid}&select=state", headers=h(owner))
    assert verify.json()[0]["state"]["revision"] == 2


def test_snapshot_not_found_is_not_permission_bypass(env):
    c, _, _ = env
    owner = login(c)
    stranger = login(c, "other@example.org", "other-very-long-password")
    pid = make_project(c, owner)
    # Existing private project must not be readable by another user even with no snapshot.
    response = c.get(f"/rest/v1/project_snapshots?project_id=eq.{pid}&select=updated_at",
                     headers=h(stranger))
    assert response.status_code == 404
    response = c.get(f"/rest/v1/project_snapshots?project_id=eq.{pid}&select=updated_at",
                     headers=h(owner))
    assert response.status_code == 200 and response.json() == []
