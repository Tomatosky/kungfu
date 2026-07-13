# SPDX-License-Identifier: Apache-2.0

from pathlib import Path

import pytest

from kungfu import config


ROOT = Path(__file__).resolve().parents[4]
CONTRACT = ROOT / "framework" / "config" / "kungfu-config.contract.json"
ROOT_HASH = "sha256:" + "a" * 64


def _contract():
    return config.load_contract(str(CONTRACT))


def _work_ref():
    return {
        "schema": "kungfu.work-ref/v1",
        "workspaceId": "workspace:test",
        "profileId": "kungfu.mission-control",
        "profileRoot": ROOT_HASH,
        "entityType": "go",
        "entityId": "go:test",
        "entityRoot": ROOT_HASH,
        "purpose": "delegated-work",
        "systemTimeCut": "2026-07-13T00:00:00Z",
    }


def test_agent_runtime_profile_is_part_of_the_global_config_contract():
    value = config.raw_default_config(str(CONTRACT))
    value["agent"]["runtimeProfiles"] = [
        {
            "schema": "kungfu.agent-runtime-profile/v1",
            "id": "codex-app",
            "label": "Codex App CLI",
            "provider": "codex",
            "launch": {
                "executable": "/Applications/Codex.app/Contents/Resources/codex",
                "argv": [],
                "shellMode": False,
            },
            "cwdPolicy": "workspace-root",
            "backendDefault": "tmux",
            "bootstrap": {"adapter": "codex", "envelope": "required"},
            "source": "discovered",
            "lastVerified": None,
        }
    ]
    value["agent"]["defaultRuntimeProfile"] = "codex-app"
    config.validate_config(value, contract=_contract())


def test_agent_runtime_profile_rejects_opaque_extra_fields():
    value = config.raw_default_config(str(CONTRACT))
    value["agent"]["runtimeProfiles"] = [
        {
            "schema": "kungfu.agent-runtime-profile/v1",
            "id": "unsafe",
            "label": "Unsafe",
            "provider": "codex",
            "launch": {
                "executable": "/bin/sh",
                "argv": ["-lc", "codex"],
                "shellMode": True,
                "secret": "must-not-be-stored",
            },
            "cwdPolicy": "workspace-root",
            "backendDefault": "direct",
            "bootstrap": {"adapter": "codex", "envelope": "required"},
            "source": "user",
        }
    ]
    with pytest.raises(ValueError):
        config.validate_config(value, contract=_contract())


def test_work_console_requires_a_bound_work_ref_for_work_bindings():
    value = {
        "schema": "kungfu.work-console-registry/v1",
        "workspaceId": "workspace:test",
        "consoles": [
            {
                "consoleId": "console:go-test",
                "bindingKind": "work",
                "workRef": _work_ref(),
                "runtimeProfileId": "codex-app",
                "backend": "tmux",
                "attempts": [
                    {
                        "attemptId": "attempt:1",
                        "runId": "run:1",
                        "status": "running",
                        "startedAt": 1,
                    }
                ],
                "createdAt": 1,
                "updatedAt": 1,
            }
        ],
        "presentation": {"tabs": [], "splits": [], "drawer": None, "windows": []},
    }
    config.validate_value("workConsoleRegistry", value, contract=_contract())
    del value["consoles"][0]["workRef"]
    with pytest.raises(ValueError):
        config.validate_value("workConsoleRegistry", value, contract=_contract())


def test_agent_console_envelope_binds_work_and_discovery_entrypoints():
    value = {
        "schema": "kungfu.agent-console-envelope/v1",
        "workspaceId": "workspace:test",
        "consoleId": "console:go-test",
        "attemptId": "attempt:1",
        "runtimeProfileId": "codex-app",
        "provider": "codex",
        "activeProfiles": [{"id": "kungfu.mission-control", "root": ROOT_HASH}],
        "workRef": _work_ref(),
        "entrypoints": {
            "context": ["kungfu", "agent", "context", "--json"],
            "capabilities": ["kungfu", "agent", "capabilities", "--json"],
            "profiles": ["kungfu", "profile", "manager", "--json"],
        },
        "knownLimits": ["terminal transcript is not proof"],
        "envelopeRoot": ROOT_HASH,
    }
    config.validate_value("agentConsoleEnvelope", value, contract=_contract())
    value["workRef"]["profileRoot"] = "latest"
    with pytest.raises(ValueError):
        config.validate_value("agentConsoleEnvelope", value, contract=_contract())
