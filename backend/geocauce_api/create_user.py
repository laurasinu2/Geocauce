"""Create a private GeoCauce account: docker compose exec api python -m geocauce_api.create_user email@example.org"""
import argparse
import getpass
from sqlalchemy import select
from .database import Base, SessionLocal, User, engine
from .security import hashed_password


def main():
    parser = argparse.ArgumentParser(description="Create a GeoCauce user without public sign-up")
    parser.add_argument("email", help="Email address")
    parser.add_argument("--id", default=None, help="Existing Supabase Auth UUID for a verified migration")
    args = parser.parse_args()
    password = getpass.getpass("Contraseña nueva (mínimo 12 caracteres): ")
    confirm = getpass.getpass("Confirmar contraseña: ")
    if password != confirm:
        raise SystemExit("Las contraseñas no coinciden")
    Base.metadata.create_all(engine)
    try:
        digest = hashed_password(password)
    except ValueError as e:
        raise SystemExit(str(e))
    email = args.email.strip().lower()
    with SessionLocal.begin() as db:
        if db.scalar(select(User).where(User.email == email)):
            raise SystemExit("Ese email ya está registrado")
        kw = {"email": email, "password_hash": digest}
        if args.id:
            from uuid import UUID
            kw["id"] = str(UUID(args.id))
        user = User(**kw)
        db.add(user)
        db.flush()
        print("Cuenta creada con UUID:", user.id)


if __name__ == "__main__":
    main()
