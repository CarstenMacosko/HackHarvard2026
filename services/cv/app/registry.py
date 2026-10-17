"""Module registry. Adding a condition = write a CVModule subclass, decorate it with
@register, and import it in _load_builtin_modules().

Droid+Daytona approved modules are written as ``gen_*.py`` beside the builtins and
loaded dynamically so participant uploads can use them without a redeploy cycle in demos.
"""
from __future__ import annotations

import importlib
import logging
import pkgutil
from typing import Any

from .modules.base import CVModule

_REGISTRY: dict[str, CVModule] = {}
_LOADED = False

log = logging.getLogger(__name__)


def register(cls: type[CVModule]) -> type[CVModule]:
    if cls.id in _REGISTRY:
        # Allow re-registration of generated modules after a re-approve / hot reload.
        if not str(cls.id).startswith("gen_"):
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
    global _LOADED
    if _LOADED:
        _load_generated_modules()
        return
    from .modules import eczema, finger_tapping, hand_tremor  # noqa: F401  (import registers them)
    _LOADED = True
    _load_generated_modules()


def _load_generated_modules() -> None:
    """Import any ``gen_*.py`` modules produced by the Droid+Daytona approve path."""
    try:
        from . import modules as modules_pkg
    except Exception as e:  # pragma: no cover
        log.warning("could not import modules package: %s", e)
        return
    prefix = modules_pkg.__name__ + "."
    for info in pkgutil.iter_modules(modules_pkg.__path__, prefix):
        name = info.name.rsplit(".", 1)[-1]
        if not name.startswith("gen_"):
            continue
        try:
            importlib.import_module(info.name)
        except Exception as e:
            log.warning("skipping generated module %s: %s", name, e)
