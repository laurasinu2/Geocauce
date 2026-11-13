from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import Project, ProjectMember, User


def role_for(db: Session, user: User, project_id: str) -> str | None:
    project = db.get(Project, project_id)
    if not project:
        return None
    if project.owner_id == user.id:
        return "owner"
    row = db.get(ProjectMember, (project_id, user.id))
    return row.role if row and not row.deleted_at else None


def require_role(db: Session, user: User, project_id: str, edit: bool = False, owner: bool = False) -> Project:
    role = role_for(db, user, project_id)
    if not role or (owner and role != "owner") or (edit and role not in {"owner", "editor"}):
        raise HTTPException(404, "Proyecto no encontrado o sin permisos")
    return db.get(Project, project_id)


def visible_projects(db: Session, user: User) -> list[Project]:
    member_ids = select(ProjectMember.project_id).where(
        ProjectMember.user_id == user.id, ProjectMember.deleted_at.is_(None)
    )
    return list(db.scalars(select(Project).where((Project.owner_id == user.id) |
                                                 Project.id.in_(member_ids)).order_by(Project.updated_at.desc())))
