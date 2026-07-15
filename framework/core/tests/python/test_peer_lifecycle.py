# SPDX-License-Identifier: Apache-2.0

import json
import os
import sys
import time
from pathlib import Path

import psutil
import pytest
from jsonschema import Draft202012Validator

from kungfu import contract, peer_lifecycle


def _spec(*, process_exit="restart", durable_state="declared", max_restarts=3):
    return {
        "schema": peer_lifecycle.SPEC_SCHEMA,
        "peerId": "test.probe",
        "command": {"argv": ["probe", "--serve"]},
        "readiness": {"kind": "file-handshake", "timeoutSeconds": 10},
        "recovery": {
            "schema": peer_lifecycle.RECOVERY_SCHEMA,
            "processExit": process_exit,
            "durableState": durable_state,
            "maxRestarts": max_restarts,
            "windowSeconds": 30,
            "guidance": "Rebuild the probe from its durable declaration.",
        },
    }


def test_plan_is_stable_and_never_uses_a_shell(tmp_path):
    first = peer_lifecycle.plan(_spec(), tmp_path)
    second = peer_lifecycle.plan(_spec(), tmp_path)

    assert first == second
    assert first["schema"] == peer_lifecycle.PLAN_SCHEMA
    assert first["planId"].startswith("sha256:")
    assert first["shell"] is False


def test_restart_requires_a_declared_durable_recovery_boundary():
    with pytest.raises(peer_lifecycle.PeerLifecycleError) as failure:
        peer_lifecycle.validate_spec(
            _spec(process_exit="restart", durable_state="none")
        )

    assert failure.value.code == "unsafe-restart"


def test_registered_contract_rejects_the_same_unsafe_restart_fixture():
    lifecycle_contract = contract.load_contract("peer-lifecycle")
    errors = list(
        Draft202012Validator(lifecycle_contract["specSchema"]).iter_errors(
            _spec(process_exit="restart", durable_state="none")
        )
    )

    assert lifecycle_contract["states"] == [
        "stopped",
        "starting",
        "registering",
        "ready",
        "degraded",
        "orphaned",
        "ownership-unknown",
        "crash-loop",
        "ended",
        "lost-control",
    ]
    assert errors


def test_process_continuity_only_peer_declares_lost_control():
    spec = peer_lifecycle.validate_spec(
        _spec(process_exit="lost-control", durable_state="none")
    )

    assert spec["recovery"]["processExit"] == "lost-control"
    assert spec["recovery"]["durableState"] == "none"


def test_windows_process_identity_uses_the_kernel_filetime(monkeypatch):
    monkeypatch.setattr(peer_lifecycle.platform, "system", lambda: "Windows")
    monkeypatch.setattr(
        peer_lifecycle, "_windows_process_identity", lambda pid: f"filetime:{pid}"
    )

    assert peer_lifecycle._process_identity(42) == "filetime:42"


def test_status_distinguishes_ready_orphan_from_unowned_pid(tmp_path, monkeypatch):
    runtime_dir = str(tmp_path / "runtime")
    state = {
        "schema": peer_lifecycle.STATE_SCHEMA,
        "peerId": "test.probe",
        "hostGeneration": 7,
        "hostPid": 101,
        "hostStartIdentity": "host-old",
        "peerGeneration": 3,
        "peerPid": 202,
        "peerStartIdentity": "peer-start",
        "readinessState": "ready",
        "lifecycleState": "ready",
        "desiredState": "running",
    }
    peer_lifecycle._write_json(
        peer_lifecycle.state_path(runtime_dir, "test.probe"), state
    )
    identities = {101: None, 202: "peer-start"}
    monkeypatch.setattr(
        peer_lifecycle, "_process_identity", lambda pid: identities.get(pid)
    )

    orphan = peer_lifecycle.status(runtime_dir, "test.probe")
    assert orphan["lifecycleState"] == "orphaned"
    assert orphan["adoptable"] is True
    assert orphan["ownershipUnknown"] is False

    identities[101] = "replacement-host"
    unknown = peer_lifecycle.status(runtime_dir, "test.probe")
    assert unknown["lifecycleState"] == "ownership-unknown"
    assert unknown["ownershipUnknown"] is True
    assert unknown["adoptable"] is False


def test_ensure_fails_closed_on_pid_reuse(tmp_path, monkeypatch):
    runtime_dir = str(tmp_path / "runtime")
    peer_lifecycle._write_json(
        peer_lifecycle.state_path(runtime_dir, "test.probe"),
        {
            "schema": peer_lifecycle.STATE_SCHEMA,
            "peerId": "test.probe",
            "hostGeneration": 4,
            "hostPid": 404,
            "hostStartIdentity": "recorded-host",
            "desiredState": "running",
        },
    )
    monkeypatch.setattr(
        peer_lifecycle,
        "_process_identity",
        lambda pid: "replacement-host" if pid == 404 else None,
    )

    with pytest.raises(peer_lifecycle.PeerLifecycleError) as failure:
        peer_lifecycle.ensure(_spec(), runtime_dir, wait_seconds=0)

    assert failure.value.code == "ownership-unknown"


def test_stale_host_generation_cannot_stop_new_owner(tmp_path, monkeypatch):
    runtime_dir = str(tmp_path / "runtime")
    peer_lifecycle._write_json(
        peer_lifecycle.state_path(runtime_dir, "test.probe"),
        {
            "schema": peer_lifecycle.STATE_SCHEMA,
            "peerId": "test.probe",
            "hostGeneration": 9,
            "hostPid": 909,
            "hostStartIdentity": "host-909",
            "desiredState": "running",
        },
    )
    monkeypatch.setattr(
        peer_lifecycle,
        "_process_identity",
        lambda pid: "host-909" if pid == 909 else None,
    )

    with pytest.raises(peer_lifecycle.PeerLifecycleError) as failure:
        peer_lifecycle.stop(
            runtime_dir,
            "test.probe",
            expected_host_generation=8,
            timeout=0,
        )

    assert failure.value.code == "stale-host-generation"


def test_ready_handshake_binds_peer_generation_process_and_token(tmp_path, monkeypatch):
    ready_file = tmp_path / "ready.json"
    state_dir = tmp_path / "peer-state"
    monkeypatch.setenv("KF_PEER_READY_FILE", str(ready_file))
    monkeypatch.setenv("KF_PEER_STATE_DIR", str(state_dir))
    monkeypatch.setenv("KF_PEER_ID", "test.probe")
    monkeypatch.setenv("KF_PEER_HOST_GENERATION", "11")
    monkeypatch.setenv("KF_PEER_GENERATION", "12")
    monkeypatch.setenv("KF_PEER_READY_TOKEN", "token-12")
    peer_lifecycle._write_json(
        state_dir / "state.json",
        {
            "peerId": "test.probe",
            "peerOwnerHostGeneration": 11,
            "peerGeneration": 12,
            "readyToken": "token-12",
            "peerPid": os.getpid(),
            "peerStartIdentity": "host-bound-start",
        },
    )
    monkeypatch.setattr(
        peer_lifecycle, "_process_identity", lambda pid: "self-observed-start"
    )

    payload = peer_lifecycle.declare_ready_from_environment({"registered": True})

    assert json.loads(ready_file.read_text("utf-8")) == payload
    assert payload["pid"] == os.getpid()
    assert payload["hostGeneration"] == 11
    assert payload["peerGeneration"] == 12
    assert payload["readyToken"] == "token-12"
    assert payload["processStartIdentity"] == "host-bound-start"


def test_ready_handshake_rejects_an_unbound_managed_process(tmp_path, monkeypatch):
    state_dir = tmp_path / "peer-state"
    monkeypatch.setenv("KF_PEER_READY_FILE", str(tmp_path / "ready.json"))
    monkeypatch.setenv("KF_PEER_STATE_DIR", str(state_dir))
    monkeypatch.setenv("KF_PEER_ID", "test.probe")
    monkeypatch.setenv("KF_PEER_HOST_GENERATION", "11")
    monkeypatch.setenv("KF_PEER_GENERATION", "12")
    monkeypatch.setenv("KF_PEER_READY_TOKEN", "token-12")
    monkeypatch.setattr(peer_lifecycle, "PROCESS_IDENTITY_TIMEOUT_SECONDS", 0)
    peer_lifecycle._write_json(
        state_dir / "state.json",
        {
            "peerId": "test.probe",
            "peerOwnerHostGeneration": 10,
            "peerGeneration": 12,
            "readyToken": "token-12",
            "peerPid": os.getpid(),
            "peerStartIdentity": "stale-host-binding",
        },
    )

    with pytest.raises(peer_lifecycle.PeerLifecycleError) as failure:
        peer_lifecycle.declare_ready_from_environment()

    assert failure.value.code == "handshake-unavailable"
    assert not (tmp_path / "ready.json").exists()


def test_host_self_binding_is_atomic_and_rejects_an_existing_owner(
    tmp_path, monkeypatch
):
    runtime_dir = str(tmp_path / "runtime")
    state_file = peer_lifecycle.state_path(runtime_dir, "test.probe")
    state = {
        "schema": peer_lifecycle.STATE_SCHEMA,
        "peerId": "test.probe",
        "hostGeneration": 7,
        "hostPid": None,
        "hostStartIdentity": None,
        "planId": "sha256:plan",
        "desiredState": "running",
    }
    peer_lifecycle._write_json(state_file, state)
    monkeypatch.setattr(peer_lifecycle, "_process_identity", lambda pid: "self-start")

    bound = peer_lifecycle._host_bind_state(runtime_dir, "test.probe", 7, "sha256:plan")

    assert bound["hostPid"] == os.getpid()
    assert bound["hostStartIdentity"] == "self-start"

    state.update({"hostPid": os.getpid() + 1, "hostStartIdentity": "other-start"})
    peer_lifecycle._write_json(state_file, state)

    rejected = peer_lifecycle._host_bind_state(
        runtime_dir, "test.probe", 7, "sha256:plan"
    )

    assert rejected == {}
    assert peer_lifecycle._read_json(state_file)["hostStartIdentity"] == "other-start"


def _wait_status(runtime_dir, predicate, timeout=10):
    deadline = time.monotonic() + timeout
    current = peer_lifecycle.status(runtime_dir, "test.probe")
    while time.monotonic() < deadline and not predicate(current):
        time.sleep(0.05)
        current = peer_lifecycle.status(runtime_dir, "test.probe")
    return current


def _assert_healthy(started):
    if started["healthy"]:
        return
    log = Path(started["logPath"])
    details = log.read_text("utf-8", errors="replace") if log.is_file() else ""
    pytest.fail(
        "Peer host did not become healthy:\n"
        + json.dumps(started, indent=2, sort_keys=True)
        + "\nPeer log:\n"
        + details[-8000:]
    )


def test_real_host_crash_adoption_and_peer_restart_are_fenced(tmp_path):
    runtime_dir = str(tmp_path / "runtime")
    probe = Path(__file__).parents[1] / "fixtures" / "peer_lifecycle_probe.py"
    spec = _spec()
    spec["command"] = {"argv": [sys.executable, str(probe)]}
    started = peer_lifecycle.ensure(spec, runtime_dir, wait_seconds=10)
    _assert_healthy(started)
    first_host_generation = started["host"]["generation"]
    first_peer_generation = started["peer"]["generation"]
    first_peer_pid = started["peer"]["pid"]
    try:
        host_process = psutil.Process(started["host"]["pid"])
        host_process.kill()
        host_process.wait(timeout=5)
        orphan = _wait_status(runtime_dir, lambda value: value["orphaned"])
        assert orphan["adoptable"]
        assert orphan["peer"]["pid"] == first_peer_pid

        adopted = peer_lifecycle.ensure(spec, runtime_dir, wait_seconds=10)
        assert adopted["healthy"]
        assert adopted["host"]["generation"] == first_host_generation + 1
        assert adopted["peer"]["pid"] == first_peer_pid

        with pytest.raises(peer_lifecycle.PeerLifecycleError) as stale:
            peer_lifecycle.stop(
                runtime_dir,
                "test.probe",
                expected_host_generation=first_host_generation,
                timeout=0,
            )
        assert stale.value.code == "stale-host-generation"

        peer_process = psutil.Process(first_peer_pid)
        peer_process.kill()
        restarted = _wait_status(
            runtime_dir,
            lambda value: (
                value["healthy"]
                and value["peer"]["generation"] == first_peer_generation + 1
            ),
        )
        assert restarted["healthy"]
        assert restarted["peer"]["pid"] != first_peer_pid
        assert restarted["restartAttempts"] == 1
    finally:
        peer_lifecycle.stop(runtime_dir, "test.probe")


@pytest.mark.parametrize(
    ("process_exit", "durable_state", "max_restarts", "terminal_state"),
    [
        ("restart", "declared", 0, "crash-loop"),
        ("lost-control", "none", 3, "lost-control"),
    ],
)
def test_real_peer_exit_honors_bounded_or_nonrecoverable_declaration(
    tmp_path, process_exit, durable_state, max_restarts, terminal_state
):
    runtime_dir = str(tmp_path / terminal_state / "runtime")
    probe = Path(__file__).parents[1] / "fixtures" / "peer_lifecycle_probe.py"
    spec = _spec(
        process_exit=process_exit,
        durable_state=durable_state,
        max_restarts=max_restarts,
    )
    spec["command"] = {"argv": [sys.executable, str(probe)]}
    started = peer_lifecycle.ensure(spec, runtime_dir, wait_seconds=10)
    _assert_healthy(started)
    try:
        peer_process = psutil.Process(started["peer"]["pid"])
        peer_process.kill()
        terminal = _wait_status(
            runtime_dir,
            lambda value: value["lifecycleState"] == terminal_state,
        )
        assert terminal["lifecycleState"] == terminal_state
        assert terminal["healthy"] is False
        assert terminal["peer"]["alive"] is False
    finally:
        peer_lifecycle.stop(runtime_dir, "test.probe")
