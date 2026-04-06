"""
Спецсписок пользователей: при первом появлении в любом боте им начисляются искры во всех ботах.
Запуск скрипта scripts/add_sparks_to_users.py.
"""
import subprocess
import sys
from pathlib import Path

SPECIAL_USERNAMES = {"DiFit", "Margaret1511", "DAKUDATI"}


def is_special_username(username: str) -> bool:
    if not username:
        return False
    normalized = (username or "").strip().lower().lstrip("@")
    return normalized in {s.lower() for s in SPECIAL_USERNAMES}


def trigger_sparks_script():
    """Запускает scripts/add_sparks_to_users.py (начисление искр спецпользователям во всех ботах)."""
    root = Path(__file__).resolve().parent
    script = root / "scripts" / "add_sparks_to_users.py"
    if not script.exists():
        return
    try:
        subprocess.run(
            [sys.executable, str(script)],
            cwd=str(root),
            timeout=30,
            capture_output=True,
        )
    except Exception:
        pass
