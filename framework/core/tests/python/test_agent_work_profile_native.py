# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import importlib.util

import pytest


if importlib.util.find_spec("pykungfu") is None:
    pytest.skip("native pykungfu binding is not built", allow_module_level=True)

from kungfu.agent import work_profile  # noqa: E402


def _root(digit: str) -> str:
    return "sha256:" + digit * 64


def _request():
    roles = list(work_profile.ROLES)
    return {
        "schema": work_profile.ACTION_SCHEMA,
        "actionId": "native-bootstrap",
        "refName": "profiles/kfd-7/native-test",
        "basis": {"cutRoot": None, "revision": 0},
        "ref": {"cutRoot": None, "revision": 0},
        "subject": {
            "role": "fact",
            "operation": "create",
            "fromState": "absent",
            "toState": "declared",
        },
        "responsibilities": {
            role: {
                "objectId": f"fact:{index:032x}",
                "expectedVersionRoot": None,
            }
            for index, role in enumerate(roles, start=1)
        },
        "roleInputs": {
            "fact": {"state": "declared", "details": {"cutKind": "native-test"}},
            "episode": {
                "state": "open",
                "details": {"episodeId": "episode:native-test"},
            },
            "pursuit": {
                "state": "active",
                "details": {"success": "native CAS accepts Python revision zero"},
            },
            "atlas": {"state": "current", "details": {"validThroughRevision": 10}},
            "warrant": {
                "state": "issued",
                "details": {"validThroughRevision": 10, "allowedOperations": ["*"]},
            },
        },
        "relations": [],
        "support": {
            "createdByReceiptRoot": _root("1"),
            "schemaRoot": _root("2"),
            "declarationRoots": [_root("3")],
            "admissionRoots": [_root("4")],
            "reasonRoot": _root("5"),
        },
    }


def test_native_profile_bootstrap_accepts_python_revision_zero(tmp_path):
    runtime_dir = tmp_path / "runtime"
    request = _request()

    receipt = work_profile.apply_action(runtime_dir, request, execute=True)
    inspected = work_profile.inspect(runtime_dir, request["refName"])

    assert receipt["status"] == "accepted", receipt
    assert receipt["result"]["revision"] == 1
    assert inspected["status"] == "current"
    assert inspected["revision"] == 1
    assert set(inspected["roles"]) == set(work_profile.ROLES)
