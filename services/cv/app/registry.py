"""Module registry. Adding a condition = write a CVModule subclass, decorate it with
@register, and import it in _load_builtin_modules()."""
from __future__ import annotations

from typing import Any

from .modules.base import CVModule

_REGISTRY: dict[str, CVModule] = {}


def register(cls: type[CVModule]) -> type[CVModule]:
    if cls.id in _REGISTRY:
        raise ValueError(f"duplicate CV module id {cls.id!r}")
    _REGISTRY[cls.id] = cls()
    return cls


def get(module_id: str) -> CVModule:
    _load_builtin_modules()
    try:
        return _REGISTRY[module_id]
    except KeyError:
        raise KeyError(f"unknown CV module {module_id!r}; known: {sorted(_REGISTRY)}") from None


def catalog() -> list[dict[str, Any]]:
    _load_builtin_modules()
    return [type(m).describe() for m in _REGISTRY.values()]


def _load_builtin_modules() -> None:
    from .modules import eczema, finger_tapping, hand_tremor  # noqa: F401  (import registers them)
