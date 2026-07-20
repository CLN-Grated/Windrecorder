from __future__ import annotations

import hashlib
import hmac
import secrets
from typing import Optional

import bcrypt
from fastapi import HTTPException, Request, Response

from windrecorder.config import config
from windrecorder.logger import get_logger

logger = get_logger(__name__)

COOKIE_NAME = "wr_webui_auth"
# In-process session tokens issued after successful password login.
_AUTH_SESSIONS: set[str] = set()


def _get_hash() -> str:
    return (getattr(config, "webui_access_password_hash", None) or "").strip()


def _get_md5() -> str:
    return (getattr(config, "webui_access_password_md5", None) or "").strip()


def password_enabled() -> bool:
    return bool(_get_hash() or _get_md5())


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _check_bcrypt(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError) as e:
        logger.warning("bcrypt check failed: %s", e)
        return False


def _upgrade_md5_to_bcrypt(plain: str) -> None:
    """One-shot migration: store bcrypt and clear legacy md5 (Streamlit no longer supported for password)."""
    try:
        hashed = hash_password(plain)
        config.set_and_save_config("webui_access_password_hash", hashed)
        config.set_and_save_config("webui_access_password_md5", "")
        logger.info("Migrated webui password from md5 to bcrypt")
    except Exception:
        logger.exception("Failed to migrate password md5 → bcrypt")


def verify_password(plain: str) -> bool:
    if not password_enabled():
        return True

    hashed = _get_hash()
    if hashed:
        return _check_bcrypt(plain, hashed)

    # Legacy MD5-only configs: verify then upgrade
    md5 = _get_md5()
    if md5:
        digest = hashlib.md5(plain.encode("utf-8")).hexdigest()
        if hmac.compare_digest(digest, md5):
            _upgrade_md5_to_bcrypt(plain)
            return True
        return False

    return True


def set_password(plain: str) -> None:
    """Set or clear WebUI password (bcrypt only; clear legacy md5)."""
    if plain is None:
        return
    if plain == "":
        config.set_and_save_config("webui_access_password_hash", "")
        config.set_and_save_config("webui_access_password_md5", "")
        return
    hashed = hash_password(plain)
    config.set_and_save_config("webui_access_password_hash", hashed)
    config.set_and_save_config("webui_access_password_md5", "")


def issue_token() -> str:
    token = secrets.token_urlsafe(32)
    _AUTH_SESSIONS.add(token)
    return token


def revoke_token(token: Optional[str]) -> None:
    if token:
        _AUTH_SESSIONS.discard(token)


def token_valid(token: Optional[str]) -> bool:
    if not password_enabled():
        return True
    if not token:
        return False
    return token in _AUTH_SESSIONS


def read_token_from_request(request: Request) -> Optional[str]:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        return token
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.headers.get("X-WebUI-Token")


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=60 * 60 * 24 * 14,
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


def require_auth(request: Request) -> None:
    if not password_enabled():
        return
    if not token_valid(read_token_from_request(request)):
        raise HTTPException(status_code=401, detail="authentication_required")


def is_public_path(path: str) -> bool:
    """Paths that do not require password when protection is enabled."""
    if path in (
        "/api/health",
        "/api/auth/status",
        "/api/auth/login",
        "/api/auth/logout",
        "/api/i18n",
    ):
        return True
    if path.startswith("/assets/"):
        return True
    if path in ("/", "/favicon.svg", "/icons.svg", "/index.html"):
        return True
    # SPA client routes — index shell only; APIs stay protected
    if not path.startswith("/api") and not path.startswith("/media"):
        return True
    return False
