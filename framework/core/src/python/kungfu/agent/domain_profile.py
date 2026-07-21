# SPDX-License-Identifier: Apache-2.0

"""Agent Work Domain Profile contract, schema roots, and body validation.

Authority for roots / bindings / validate_role_body lives in libkungfu
``action_runtime``; this module keeps contract/metadata discovery in Python.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from kungfu import contract as contract_runtime
from kungfu.storage import service as storage_service


SURFACE = "agent-work-domain-profile"
LEGACY_ROLE_BODY_SCHEMA = "kungfu.kfd7.profile-role/v1"


def contract() -> dict[str, Any]:
    return contract_runtime.load_contract(SURFACE)


def metadata() -> dict[str, str | int]:
    return contract_runtime.contract_metadata(SURFACE)


def _native(action: str, request: dict[str, Any] | None = None) -> Any:
    try:
        return storage_service.action_runtime("", action, request)
    except Exception as error:  # noqa: BLE001 - preserve ValueError surface for callers
        raise ValueError(str(error)) from error


def roots() -> dict[str, Any]:
    return _native("roots")


def role_schema_id(role: str) -> str:
    return str(_native("role_schema_id", {"role": role})["schema"])


def role_bindings(role: str) -> dict[str, str]:
    return _native("role_bindings", {"role": role})


def validate_role_body(
    body: Mapping[str, Any],
    *,
    allow_legacy: bool = True,
) -> dict[str, Any]:
    return _native(
        "validate_role_body",
        {"body": dict(body), "allow_legacy": allow_legacy},
    )
