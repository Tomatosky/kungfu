# SPDX-License-Identifier: Apache-2.0

"""Agent Work Domain Profile contract, schema roots, and body validation."""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from kungfu import contract as contract_runtime
from kungfu.content_hash import compute_content_hash


SURFACE = "agent-work-domain-profile"
GEOMETRY_SURFACE = "action-geometry"
LEGACY_ROLE_BODY_SCHEMA = "kungfu.kfd7.profile-role/v1"


def contract() -> dict[str, Any]:
    return contract_runtime.load_contract(SURFACE)


def metadata() -> dict[str, str | int]:
    return contract_runtime.contract_metadata(SURFACE)


def _role_schema_path(row: Mapping[str, Any]) -> Path:
    profile_path = Path(contract_runtime.resolve_contract_path(SURFACE)).resolve()
    basename = Path(str(row["artifact"])).name
    candidates = [profile_path.parent / "role-schemas" / basename]
    for parent in [profile_path.parent, *profile_path.parents]:
        candidates.extend([parent / str(row["source"]), parent / str(row["artifact"])])
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"Agent Work role schema not found: {basename}")


def _load_role_schema(role: str) -> tuple[dict[str, Any], str]:
    profile = contract()
    row = profile["roleSchemas"].get(role)
    if not isinstance(row, dict):
        raise ValueError(f"Unknown Agent Work role: {role}")
    path = _role_schema_path(row)
    raw = path.read_bytes()
    actual_root = compute_content_hash(raw)
    if actual_root != row["root"]:
        raise ValueError(
            f"Agent Work {role} role schema root mismatch: "
            f"expected {row['root']}, got {actual_root}"
        )
    schema = json.loads(raw)
    if not isinstance(schema, dict):
        raise ValueError(f"Agent Work {role} role schema must be an object")
    Draft202012Validator.check_schema(schema)
    return schema, actual_root


def roots() -> dict[str, Any]:
    profile = contract()
    profile_metadata = metadata()
    geometry_metadata = contract_runtime.contract_metadata(GEOMETRY_SURFACE)
    expected_geometry = profile["actionGeometry"]["root"]
    if geometry_metadata["hash"] != expected_geometry:
        raise ValueError(
            "Agent Work Action Geometry root mismatch: "
            f"expected {expected_geometry}, got {geometry_metadata['hash']}"
        )
    role_roots = {role: _load_role_schema(role)[1] for role in profile["roleOrder"]}
    return {
        "actionGeometryRoot": geometry_metadata["hash"],
        "domainProfileRoot": profile_metadata["hash"],
        "roleSchemaRoots": role_roots,
    }


def role_schema_id(role: str) -> str:
    row = contract()["roleSchemas"].get(role)
    if not isinstance(row, dict):
        raise ValueError(f"Unknown Agent Work role: {role}")
    return str(row["schema"])


def role_bindings(role: str) -> dict[str, str]:
    resolved = roots()
    return {
        "actionGeometryRoot": str(resolved["actionGeometryRoot"]),
        "domainProfileRoot": str(resolved["domainProfileRoot"]),
        "roleSchemaRoot": str(resolved["roleSchemaRoots"][role]),
    }


def validate_role_body(
    body: Mapping[str, Any],
    *,
    allow_legacy: bool = True,
) -> dict[str, Any]:
    role = body.get("role")
    profile = contract()
    if role not in profile["roleOrder"]:
        raise ValueError(f"Unknown Agent Work role: {role!r}")

    if body.get("schema") == LEGACY_ROLE_BODY_SCHEMA:
        if not allow_legacy:
            raise ValueError("Legacy Agent Work role bodies are not accepted here")
        return {"role": role, "legacy": True}

    expected_schema = role_schema_id(str(role))
    if body.get("schema") != expected_schema:
        raise ValueError(
            f"Agent Work {role} role schema mismatch: expected {expected_schema}"
        )

    schema, _ = _load_role_schema(str(role))
    errors = sorted(
        Draft202012Validator(schema).iter_errors(dict(body)),
        key=lambda error: list(error.path),
    )
    if errors:
        error = errors[0]
        path = ".".join(str(part) for part in error.path) or "<root>"
        raise ValueError(
            f"Agent Work {role} role body validation failed at {path}: {error.message}"
        )

    expected_bindings = role_bindings(str(role))
    if body.get("bindings") != expected_bindings:
        raise ValueError(
            f"Agent Work {role} role body does not bind the exact contract roots"
        )
    return {"role": role, "legacy": False, "bindings": expected_bindings}
