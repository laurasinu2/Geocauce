"""GeoCauce personal VPS API.

Provides a small versioned REST API plus the specific Supabase-compatible
HTTP subset used by GeoCauce R41. This is not a general Supabase replacement.
"""
import hashlib
import os
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path, PurePosixPath
from typing import Any
from uuid import UUID

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import Base, Project, ProjectMember, RefreshSession, Snapshot, User, engine, get_db, utcnow
from .permissions import require_role, role_for, visible_projects
from .security import current_user, hashed_password, issue_session, refresh_session, jwt_secret, verify_password, aware

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(16 * 1024 * 1024)))
FILE_ROOT = Path(os.getenv("FILE_ROOT", "/data/files")).resolve()


@asynccontextmanager
async def lifespan(app: FastAPI):
    jwt_secret()
    Base.metadata.create_all(bind=engine)  # Initial install only; use migrations for schema changes.
    FILE_ROOT.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="GeoCauce API", version="0.1.0", lifespan=lifespan,
              description="Self-hosted personal cloud service for GeoCauce R41")


@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok", "service": "geocauce-api"}


class Credentials(BaseModel):
    email: str
    password: str


class RefreshPayload(BaseModel):
    refresh_token: str


class MemberPayload(BaseModel):
    p_project_id: str
    p_email: str
    p_role: str


class MemberRemovePayload(BaseModel):
    p_project_id: str
    p_user_id: str


class RolePayload(BaseModel):
    p_project_id: str | None = None
    p_project: str | None = None


class SnapshotBody(BaseModel):
    state: dict[str, Any]
    palette: list[Any] = Field(default_factory=list)
    expected_updated_at: str | None = None


def norm_email(email: str) -> str:
    value = email.strip().lower()
    if len(value) > 320 or "@" not in value or any(c.isspace() for c in value):
        raise HTTPException(422, "Email inválido")
    return value


def norm_uuid(value: str) -> str:
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(422, "Identificador UUID inválido")


@app.post("/auth/v1/token", tags=["Authentication"])
@app.post("/api/v1/auth/login", tags=["Authentication"])
def auth_login(payload: dict = Body(...), grant_type: str = Query(default="password"),
               db: Session = Depends(get_db)):
    if grant_type == "refresh_token":
        token = payload.get("refresh_token")
        if not isinstance(token, str):
            raise HTTPException(422, "Falta refresh_token")
        return refresh_session(db, token)
    if grant_type != "password":
        raise HTTPException(400, "grant_type no soportado")
    email = norm_email(str(payload.get("email", "")))
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(user.password_hash, str(payload.get("password", ""))):
        raise HTTPException(401, "Email o contraseña incorrectos")
    return issue_session(db, user)


@app.post("/api/v1/auth/refresh", tags=["Authentication"])
def auth_refresh(payload: RefreshPayload, db: Session = Depends(get_db)):
    return refresh_session(db, payload.refresh_token)


@app.post("/auth/v1/signup", tags=["Authentication"])
@app.post("/api/v1/auth/signup", tags=["Authentication"])
def auth_signup(payload: Credentials, db: Session = Depends(get_db)):
    if os.getenv("ALLOW_SIGNUP", "false").lower() != "true":
        raise HTTPException(403, "Registro desactivado. Crea la cuenta desde la consola del servidor.")
    email = norm_email(payload.email)
    try:
        user = User(email=email, password_hash=hashed_password(payload.password))
    except ValueError as e:
        raise HTTPException(422, str(e))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Cuenta ya existente")
    db.refresh(user)
    return issue_session(db, user)


@app.post("/auth/v1/logout", tags=["Authentication"])
@app.post("/api/v1/auth/logout", tags=["Authentication"])
def auth_logout(payload: dict = Body(default={}), user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    for session in db.scalars(select(RefreshSession).where(RefreshSession.user_id == user.id,
                                                          RefreshSession.revoked_at.is_(None))):
        session.revoked_at = utcnow()
    db.commit()
    return {}


@app.get("/api/v1/auth/me", tags=["Authentication"])
def auth_me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email}


def project_json(p: Project) -> dict:
    return {"id": p.id, "owner_id": p.owner_id, "name": p.name, "zone": p.zone,
            "torrent": p.torrent, "crs": p.crs, "metadata": p.metadata_json or {},
            "updated_at": iso(p.updated_at), "created_at": iso(p.created_at)}


def iso(dt: datetime | None) -> str | None:
    return aware(dt).isoformat(timespec="microseconds") if dt else None


def datetime_from_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return aware(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except (ValueError, TypeError):
        raise HTTPException(422, "Fecha de versión inválida")


def unique_updated_at(previous: datetime | None = None) -> datetime:
    now = utcnow()
    if previous and now <= aware(previous):
        return aware(previous) + timedelta(microseconds=1)
    return now


def upsert_project(db: Session, user: User, data: dict) -> Project:
    if not isinstance(data, dict):
        raise HTTPException(422, "Proyecto JSON inválido")
    project_id = norm_uuid(data.get("id", ""))
    p = db.get(Project, project_id)
    if p:
        require_role(db, user, project_id, edit=True)
        owner_id = norm_uuid(data.get("owner_id") or p.owner_id)
        if owner_id != p.owner_id:
            raise HTTPException(403, "No puedes cambiar el propietario del proyecto")
    else:
        owner_id = norm_uuid(data.get("owner_id") or user.id)
        if owner_id != user.id:
            raise HTTPException(403, "No puedes crear un proyecto de otro propietario")
        p = Project(id=project_id, owner_id=user.id)
        db.add(p)
    if not isinstance(data.get("metadata", {}), dict):
        raise HTTPException(422, "metadata debe ser un objeto")
    p.name = str(data.get("name") or "Proyecto")[:400]
    p.zone = str(data["zone"])[:400] if data.get("zone") is not None else None
    p.torrent = str(data["torrent"])[:400] if data.get("torrent") is not None else None
    p.crs = str(data.get("crs") or "EPSG:25831")[:80]
    p.metadata_json = data.get("metadata") or {}
    p.updated_at = unique_updated_at(p.updated_at)
    db.flush()
    return p


@app.get("/api/v1/projects", tags=["Projects"])
@app.get("/rest/v1/projects", tags=["R41 compatibility"])
def list_projects(select: str = "*", order: str | None = None, limit: int = 1000,
                  offset: int = 0, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if limit == 0:
        return []
    rows = visible_projects(db, user)
    return [project_json(p) for p in rows[max(0, offset):max(0, offset) + min(limit, 1000)]]


@app.post("/api/v1/projects", tags=["Projects"])
@app.post("/rest/v1/projects", tags=["R41 compatibility"])
def post_projects(payload: list[dict] = Body(...), prefer: str = Header(default=""),
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not payload or len(payload) > 20:
        raise HTTPException(422, "Se requieren entre 1 y 20 proyectos")
    results = [project_json(upsert_project(db, user, data)) for data in payload]
    db.commit()
    return results if "return=representation" in prefer else JSONResponse(status_code=201, content=[])


@app.get("/api/v1/projects/{project_id}", tags=["Projects"])
def get_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = require_role(db, user, norm_uuid(project_id))
    return project_json(p)


def snapshot_json(s: Snapshot, select_fields: str = "*") -> dict:
    if "assets:state->assetMetadata" in select_fields:
        return {"assets": (s.state or {}).get("assetMetadata")}
    data = {"project_id": s.project_id, "owner_id": s.owner_id, "updated_at": iso(s.updated_at),
            "state": s.state, "palette": s.palette or []}
    if select_fields in {"*", ""}:
        return data
    return {k: data[k] for k in select_fields.split(",") if k in data}


def query_project_id(project_id: str | None, id_project: str | None) -> str | None:
    raw = project_id or id_project
    if raw is None:
        return None
    if not raw.startswith("eq."):
        raise HTTPException(422, "Filtro inválido: se requiere eq.UUID")
    return norm_uuid(raw[3:])


@app.get("/rest/v1/project_snapshots", tags=["R41 compatibility"])
def list_snapshots(project_id: str | None = None, id_project: str | None = None,
                   select: str = "*", limit: int = 1000, offset: int = 0,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    selected_id = query_project_id(project_id, id_project)
    if limit == 0:
        return []
    if selected_id:
        # PostgREST returns an empty array for a missing row. R41 checks for a
        # missing snapshot BEFORE creating a new project's DB row.
        # Keep 404 for an existing project that is not visible to this user.
        if db.get(Project, selected_id) is None:
            return []
        require_role(db, user, selected_id)
        s = db.get(Snapshot, selected_id)
        return [snapshot_json(s, select)] if s else []
    ids = [p.id for p in visible_projects(db, user)]
    if not ids:
        return []
    snapshots = list(db.scalars(select_query_snapshots(db, ids)))[max(0, offset):max(0, offset) + min(limit, 1000)]
    return [snapshot_json(s, select) for s in snapshots]


def select_query_snapshots(db: Session, ids: list[str]):
    return select(Snapshot).where(Snapshot.project_id.in_(ids)).order_by(Snapshot.updated_at.desc())


def update_snapshot(db: Session, user: User, project_id: str, data: dict, expected: str | None,
                    create: bool) -> Snapshot | None:
    project_id = norm_uuid(project_id)
    require_role(db, user, project_id, edit=True)
    # Row lock serializes writes on PostgreSQL, including the initial insert.
    project = db.scalar(select(Project).where(Project.id == project_id).with_for_update())
    old = db.get(Snapshot, project_id)
    if old and create:
        return None
    if not old and not create:
        return None
    if old and (expected is None or datetime_from_iso(expected) != aware(old.updated_at)):
        return None
    state = data.get("state")
    if not isinstance(state, dict):
        raise HTTPException(422, "state debe ser JSON objeto")
    palette = data.get("palette", [])
    if not isinstance(palette, list):
        raise HTTPException(422, "palette debe ser una lista")
    next_at = unique_updated_at(old.updated_at if old else None)
    if old:
        old.state = state
        old.palette = palette
        old.updated_at = next_at
        s = old
    else:
        s = Snapshot(project_id=project_id, owner_id=project.owner_id,
                     state=state, palette=palette, updated_at=next_at)
        db.add(s)
    project.updated_at = next_at
    db.flush()
    return s


@app.post("/rest/v1/project_snapshots", tags=["R41 compatibility"])
def insert_snapshot(payload: list[dict] = Body(...), prefer: str = Header(default=""),
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    if len(payload) != 1:
        raise HTTPException(422, "Se admite exactamente un snapshot")
    data = payload[0]
    project_id = data.get("project_id") or data.get("id_project")
    if not project_id:
        raise HTTPException(422, "project_id requerido")
    row = update_snapshot(db, user, project_id, data, None, create=True)
    db.commit()
    result = [snapshot_json(row)] if row else []
    return result if "return=representation" in prefer else JSONResponse(status_code=201, content=[])


@app.patch("/rest/v1/project_snapshots", tags=["R41 compatibility"])
def patch_snapshot(data: dict = Body(...), project_id: str | None = None,
                   id_project: str | None = None, updated_at: str | None = None,
                   select: str = "*", prefer: str = Header(default=""),
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    pid = query_project_id(project_id, id_project)
    if not pid or not updated_at or not updated_at.startswith("eq."):
        raise HTTPException(422, "Se requieren project_id e updated_at=eq.version")
    row = update_snapshot(db, user, pid, data, updated_at[3:], create=False)
    db.commit()
    return [snapshot_json(row, select)] if row and "return=representation" in prefer else []


@app.get("/api/v1/projects/{project_id}/snapshot", tags=["Projects"])
def get_snapshot(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project_id = norm_uuid(project_id)
    require_role(db, user, project_id)
    row = db.get(Snapshot, project_id)
    if not row:
        raise HTTPException(404, "No existe snapshot")
    return snapshot_json(row)


@app.put("/api/v1/projects/{project_id}/snapshot", tags=["Projects"])
def put_snapshot(project_id: str, payload: SnapshotBody, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    project_id = norm_uuid(project_id)
    require_role(db, user, project_id, edit=True)
    existing = db.get(Snapshot, project_id)
    create = existing is None
    if existing and not payload.expected_updated_at:
        raise HTTPException(428, "expected_updated_at obligatorio al actualizar")
    row = update_snapshot(db, user, project_id, payload.model_dump(),
                          payload.expected_updated_at, create=create)
    if not row:
        db.rollback()
        raise HTTPException(409, "Otro dispositivo modificó el snapshot")
    db.commit()
    return snapshot_json(row)


@app.post("/rest/v1/rpc/geocauce_project_role", tags=["R41 compatibility"])
def rpc_project_role(payload: RolePayload, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pid = norm_uuid(payload.p_project_id or payload.p_project or "")
    return role_for(db, user, pid)


@app.post("/rest/v1/rpc/geocauce_is_project_owner", tags=["R41 compatibility"])
def rpc_is_owner(payload: RolePayload, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return rpc_project_role(payload, user, db) == "owner"


@app.post("/rest/v1/rpc/geocauce_can_edit_project", tags=["R41 compatibility"])
def rpc_can_edit(payload: RolePayload, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return rpc_project_role(payload, user, db) in ("owner", "editor")


@app.post("/rest/v1/rpc/geocauce_can_view_project", tags=["R41 compatibility"])
def rpc_can_view(payload: RolePayload, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return rpc_project_role(payload, user, db) in ("owner", "editor", "viewer")


@app.post("/rest/v1/rpc/geocauce_my_project_roles", tags=["R41 compatibility"])
def rpc_roles(payload: dict = Body(default={}), user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    return [{"project_id": p.id, "role": role_for(db, user, p.id)} for p in visible_projects(db, user)]


@app.post("/rest/v1/rpc/geocauce_list_project_members", tags=["R41 compatibility"])
def rpc_list_members(payload: RolePayload, user: User = Depends(current_user),
                     db: Session = Depends(get_db)):
    pid = norm_uuid(payload.p_project_id or "")
    require_role(db, user, pid, owner=True)
    rows = db.scalars(select(ProjectMember).where(ProjectMember.project_id == pid,
                                                  ProjectMember.deleted_at.is_(None)))
    return [{"user_id": m.user_id, "email": db.get(User, m.user_id).email,
             "role": m.role} for m in rows]


@app.post("/rest/v1/rpc/geocauce_set_project_member", tags=["R41 compatibility"])
def rpc_set_member(payload: MemberPayload, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    pid = norm_uuid(payload.p_project_id)
    require_role(db, user, pid, owner=True)
    if payload.p_role not in {"viewer", "editor"}:
        raise HTTPException(422, "Rol inválido")
    person = db.scalar(select(User).where(User.email == norm_email(payload.p_email)))
    if not person or person.id == user.id:
        raise HTTPException(404, "Destinatario no registrado o inválido")
    member = db.get(ProjectMember, (pid, person.id))
    if member:
        member.role = payload.p_role
        member.deleted_at = None
    else:
        db.add(ProjectMember(project_id=pid, user_id=person.id, role=payload.p_role))
    db.commit()
    return True


@app.post("/rest/v1/rpc/geocauce_remove_project_member", tags=["R41 compatibility"])
def rpc_remove_member(payload: MemberRemovePayload, user: User = Depends(current_user),
                      db: Session = Depends(get_db)):
    pid = norm_uuid(payload.p_project_id)
    require_role(db, user, pid, owner=True)
    member = db.get(ProjectMember, (pid, norm_uuid(payload.p_user_id)))
    if member:
        member.deleted_at = utcnow()
        db.commit()
    return True


def validated_blob_path(user: User, object_path: str, db: Session, write: bool) -> Path:
    # Paths: owner UUID / project UUID / photos|rasters|vectors / immutable filename.
    if ("\\" in object_path or "\x00" in object_path or "%" in object_path or
            object_path.startswith("/") or "//" in object_path):
        raise HTTPException(400, "Ruta inválida")
    parts = PurePosixPath(object_path).parts
    if len(parts) < 4 or any(p in {".", "..", ""} for p in parts):
        raise HTTPException(400, "Ruta incompleta o insegura")
    owner_id = norm_uuid(parts[0])
    pid = norm_uuid(parts[1])
    p = require_role(db, user, pid, edit=write)
    if p.owner_id != owner_id:
        raise HTTPException(403, "El propietario de la ruta no coincide")
    if parts[2] not in {"photos", "rasters", "vectors"} or len(object_path) > 900:
        raise HTTPException(400, "Tipo o longitud de ruta inválidos")
    target = (FILE_ROOT / object_path).resolve()
    if not target.is_relative_to(FILE_ROOT):
        raise HTTPException(400, "Ruta insegura")
    return target


@app.post("/storage/v1/object/geocauce-files/{object_path:path}", tags=["R41 compatibility"])
async def storage_upload(object_path: str, request: Request,
                         user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = validated_blob_path(user, object_path, db, write=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".upload-", delete=False) as temp:
            tmp_path = Path(temp.name)
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "Archivo demasiado grande; divide el archivo en fragmentos")
                temp.write(chunk)
            temp.flush()
            os.fsync(temp.fileno())
        # Immutable files are created atomically without overwriting a competing upload.
        try:
            os.link(tmp_path, target)
        except FileExistsError:
            if target.stat().st_size != size or sha256_file(target) != sha256_file(tmp_path):
                raise HTTPException(409, "La ruta ya existe con contenido diferente")
            return {"Key": object_path, "existing": True}
        return {"Key": object_path}
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


@app.get("/storage/v1/object/info/geocauce-files/{object_path:path}", tags=["R41 compatibility"])
def storage_info(object_path: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = validated_blob_path(user, object_path, db, write=False)
    if not target.is_file():
        raise HTTPException(404, "Archivo no encontrado")
    return {"name": target.name, "size": target.stat().st_size,
            "metadata": {"size": target.stat().st_size}}


@app.get("/storage/v1/object/authenticated/geocauce-files/{object_path:path}", tags=["R41 compatibility"])
def storage_get(object_path: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = validated_blob_path(user, object_path, db, write=False)
    if not target.is_file():
        raise HTTPException(404, "Archivo no encontrado")
    return FileResponse(target, media_type="application/octet-stream",
                        headers={"Cache-Control": "private, no-store"})


@app.delete("/storage/v1/object/geocauce-files", tags=["R41 compatibility"])
def storage_delete(payload: dict = Body(...), user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    paths = payload.get("prefixes", [])
    if not isinstance(paths, list) or len(paths) > 100:
        raise HTTPException(422, "Lista de rutas inválida")
    # Do not purge old media while offline conflict recovery is not fully validated.
    raise HTTPException(409, "Limpieza automática desactivada para proteger versiones anteriores")


@app.get("/api/v1/projects/{project_id}/files/{object_path:path}", tags=["Files"])
def files_get(project_id: str, object_path: str, user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    p = require_role(db, user, norm_uuid(project_id))
    return storage_get(f"{p.owner_id}/{project_id}/{object_path}", user, db)
