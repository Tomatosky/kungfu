# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import copy
import importlib.util

import pytest


if importlib.util.find_spec("pykungfu") is None:
    pytest.skip("native pykungfu binding is not built", allow_module_level=True)

from kungfu.agent import work_profile  # noqa: E402
from kungfu.storage import service  # noqa: E402


FILE = "content-addressed-file"
ROCKS = "rocksdb"


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


def _successor_request(previous, *, action_id: str):
    request = _request()
    request["actionId"] = action_id
    request["basis"] = {
        "cutRoot": previous["result"]["cutRoot"],
        "revision": previous["result"]["revision"],
    }
    request["ref"] = copy.deepcopy(request["basis"])
    request["subject"] = {
        "role": "pursuit",
        "operation": "continue",
        "fromState": "active",
        "toState": "active",
    }
    request["responsibilities"] = {
        role: {
            "objectId": request["responsibilities"][role]["objectId"],
            "expectedVersionRoot": previous["result"]["roleVersions"][role],
        }
        for role in work_profile.ROLES
    }
    request.pop("roleInputs")
    request["payload"] = {"continuation": action_id}
    return request


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


def test_native_profile_authority_bundle_restores_clean_home_exactly(tmp_path):
    source = tmp_path / "source"
    destination = tmp_path / "clean-home"
    request = _request()
    created = work_profile.apply_action(source, request, execute=True)
    continued = work_profile.apply_action(
        source,
        _successor_request(created, action_id="source-continuation"),
        execute=True,
    )

    exported = work_profile.export_authority(source)
    assert exported["ok"] is True, exported
    bundle = exported["result"]["bundle"]
    assert bundle["schema"] == work_profile.AUTHORITY_BUNDLE_SCHEMA
    assert bundle["finalState"]["refs"][request["refName"]]["revision"] == 2

    tampered = copy.deepcopy(bundle)
    tampered["operations"][0]["request"]["object_type"] = "tampered"
    rejected = work_profile.import_authority(destination, tampered)
    assert rejected["ok"] is False
    assert rejected["failure_code"] == "bundle-root-mismatch"

    planned = work_profile.import_authority(destination, bundle)
    assert planned["ok"] is True, planned
    assert planned["status"] == "planned"
    assert planned["write_occurred"] is False
    assert work_profile.inspect(destination, request["refName"])["status"] == "absent"

    imported = work_profile.import_authority(destination, bundle, execute=True)
    assert imported["ok"] is True, imported
    assert imported["status"] == "imported"
    assert imported["result"]["record_roots_preserved"] is True
    assert imported["result"]["refs_preserved"] is True

    source_state = work_profile.inspect(source, request["refName"])
    destination_state = work_profile.inspect(destination, request["refName"])
    assert destination_state == source_state
    assert destination_state["cutRoot"] == continued["result"]["cutRoot"]
    assert destination_state["revision"] == 2

    destination_export = work_profile.export_authority(destination)
    assert destination_export["result"]["bundle_root"] == bundle["bundleRoot"]

    resumed = work_profile.apply_action(
        destination,
        _successor_request(continued, action_id="clean-home-continuation"),
        execute=True,
    )
    assert resumed["status"] == "accepted", resumed
    assert resumed["result"]["revision"] == 3


def test_native_profile_backend_switch_and_rollback_preserve_five_role_identity(
    tmp_path, monkeypatch
):
    runtime_dir = tmp_path / "runtime"
    request = _request()
    monkeypatch.setenv("KUNGFU_STORAGE_PROVIDER", FILE)
    created = work_profile.apply_action(runtime_dir, request, execute=True)
    before = work_profile.inspect(runtime_dir, request["refName"])
    before_bundle = work_profile.export_authority(runtime_dir)["result"]["bundle"]

    switched = service.backend_switch(runtime_dir, target_provider=ROCKS)
    assert switched["ok"] is True, switched
    assert switched["source_provider"] == FILE
    assert switched["target_provider"] == ROCKS
    assert switched["pre_cut"] == switched["post_cut"]
    monkeypatch.delenv("KUNGFU_STORAGE_PROVIDER")

    after_switch = work_profile.inspect(runtime_dir, request["refName"])
    after_switch_bundle = work_profile.export_authority(runtime_dir)["result"]["bundle"]
    assert after_switch == before
    assert after_switch_bundle == before_bundle
    assert set(after_switch["roles"]) == set(work_profile.ROLES)

    continued = work_profile.apply_action(
        runtime_dir,
        _successor_request(created, action_id="rocks-continuation"),
        execute=True,
    )
    before_rollback = work_profile.inspect(runtime_dir, request["refName"])
    before_rollback_bundle = work_profile.export_authority(runtime_dir)["result"][
        "bundle"
    ]
    monkeypatch.setenv("KUNGFU_STORAGE_PROVIDER", FILE)
    rolled_back = service.backend_rollback(runtime_dir, expected_generation=2)
    assert rolled_back["source_provider"] == ROCKS
    assert rolled_back["target_provider"] == FILE
    assert rolled_back["target_generation"] == 3
    monkeypatch.delenv("KUNGFU_STORAGE_PROVIDER")

    assert work_profile.inspect(runtime_dir, request["refName"]) == before_rollback
    assert (
        work_profile.export_authority(runtime_dir)["result"]["bundle"]
        == before_rollback_bundle
    )
    assert continued["result"]["revision"] == 2
