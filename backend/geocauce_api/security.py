import hashlib
import os
import secrets
from datetime import datetime, timezone, timedelta

import jwt
from argon2 import PasswordHasher
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import RefreshSession, User, get_db, utcnow

ph = PasswordHasher()
bearer = HTTPBearer(auto_error=False)
ACCESS_MINUTES = 30
REFRESH_DAYS = 30


def jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET must be a strong, unique secret of at least 32 characters")
    return secret


def hashed_password(password: str) -> str:
    if len(password) < 12:
        raise ValueError("Password must contain at least 12 characters")
    return ph.hash(password)


def verify_password(hash_value: str, password: str) -> bool:
    try:
        return ph.verify(hash_value, password)
    except Exception:
        return False


def issue_session(db: Session, user: User) -> dict:
    now = utcnow()
    access = jwt.encode({"sub": user.id, "type": "access", "iat": now,
                         "exp": now + timedelta(minutes=ACCESS_MINUTES)}, jwt_secret(), algorithm="HS256")
    raw = secrets.token_urlsafe(48)
    db.add(RefreshSession(user_id=user.id, digest=hashlib.sha256(raw.encode()).hexdigest(),
                          expires_at=now + timedelta(days=REFRESH_DAYS)))
    db.commit()
    return {"access_token": access, "refresh_token": raw, "token_type": "bearer",
            "expires_in": ACCESS_MINUTES * 60,
            "expires_at": int((now + timedelta(minutes=ACCESS_MINUTES)).timestamp()),
            "user": {"id": user.id, "email": user.email}}


def refresh_session(db: Session, raw: str) -> dict:
    digest = hashlib.sha256(raw.encode()).hexdigest()
    row = db.scalar(select(RefreshSession).where(RefreshSession.digest == digest).with_for_update())
    now = utcnow()
    if not row or row.revoked_at or aware(row.expires_at) < now:
        raise HTTPException(401, "Refresh token inválido o caducado")
    row.revoked_at = now
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(401, "Cuenta no encontrada")
    return issue_session(db, user)


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> User:
    if not creds:
        raise HTTPException(401, "Falta un token de acceso")
    try:
        payload = jwt.decode(creds.credentials, jwt_secret(), algorithms=["HS256"],
                             options={"require": ["sub", "exp", "type"]})
        if payload.get("type") != "access":
            raise ValueError("Token de tipo incorrecto")
        user = db.get(User, payload["sub"])
        if not user:
            raise ValueError("Usuario desconocido")
        return user
    except (InvalidTokenError, ValueError):
        raise HTTPException(401, "Sesión inválida o caducada")
