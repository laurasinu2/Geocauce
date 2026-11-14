import os
import uuid
from datetime import datetime, timezone
from typing import Generator

from sqlalchemy import DateTime, ForeignKey, JSON, String, create_engine
from sqlalchemy.engine import URL
from pathlib import Path
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session

JSON_COLUMN = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(300), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    digest: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(400), default="Proyecto")
    zone: Mapped[str | None] = mapped_column(String(400), nullable=True)
    torrent: Mapped[str | None] = mapped_column(String(400), nullable=True)
    crs: Mapped[str] = mapped_column(String(80), default="EPSG:25831")
    metadata_json: Mapped[dict] = mapped_column(JSON_COLUMN, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    snapshot: Mapped["Snapshot | None"] = relationship(back_populates="project", uselist=False)


class Snapshot(Base):
    __tablename__ = "project_snapshots"
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    state: Mapped[dict] = mapped_column(JSON_COLUMN, nullable=False)
    palette: Mapped[list] = mapped_column(JSON_COLUMN, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    project: Mapped[Project] = relationship(back_populates="snapshot")


class ProjectMember(Base):
    __tablename__ = "project_members"
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def make_engine():
    password_file = os.getenv("DB_PASSWORD_FILE")
    if password_file:
        password = Path(password_file).read_text(encoding="utf-8")
        # SQLAlchemy URL.create handles @, %, :, /, # and Unicode without
        # interpreting password characters as URL delimiters.
        url = URL.create(
            "postgresql+psycopg",
            username=os.environ["DB_USER"],
            password=password,
            host=os.getenv("DB_HOST", "db"),
            port=5432,
            database=os.getenv("DB_NAME", "geocauce"),
        )
    else:
        url = os.getenv("DATABASE_URL", "sqlite:///./geocauce-dev.sqlite")
    kwargs = {"pool_pre_ping": True}
    if url.startswith("sqlite:"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
