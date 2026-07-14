# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
import os
import sys
import types
from pathlib import Path

import pytest
import click
from click.testing import CliRunner


def _install_fake_pykungfu():
    fake = types.ModuleType("pykungfu")
    fake.__file__ = "/nonexistent/pykungfu.so"
    fake.runtime = types.ModuleType("pykungfu.runtime")
    fake.runtime.coordinator = type("FakeNativeCoordinator", (), {})
    fake.yijinjing = types.SimpleNamespace()
    sys.modules.setdefault("pykungfu", fake)
    sys.modules.setdefault("pykungfu.runtime", fake.runtime)


_install_fake_pykungfu()

import kungfu  # noqa: E402

kungfu.__version__ = "test"

from kungfu import runtime_service, runtime_upgrade  # noqa: E402
from kungfu.cli.commands.runtime import runtime as runtime_cli  # noqa: E402


ROOT = Path(__file__).parents[4]
CASES = json.loads(
    (ROOT / "tests/fixtures/runtime-upgrade-control-plane/cases.json").read_text()
)["cases"]


@click.group()
@click.option("--home", type=click.Path(), required=True)
@click.pass_context
def upgrade_test_cli(ctx, home):
    ctx.name = "runtime-upgrade-test"
    ctx.config_home = str(Path(home) / "config")
    ctx.home = str(home)
    ctx.extension_path = None
    ctx.log_level = "warning"
    ctx.runtime_dir = str(Path(home) / "runtime")
    ctx.dataset_dir = str(Path(home) / "dataset")
    ctx.backtest_dir = str(Path(home) / "backtest")
    ctx.inbox_dir = str(Path(home) / "inbox")
    ctx.runtime_locator = None
    ctx.backtest_locator = None
    ctx.config_location = None
    ctx.console_location = None
    ctx.index_location = None
    ctx.stage = "test"


upgrade_test_cli.add_command(runtime_cli)


def _source(root: Path, name: str) -> Path:
    source = root / name
    (source / "bin").mkdir(parents=True)
    entrypoint = source / "bin" / "kungfu"
    entrypoint.write_text(f"#!/bin/sh\necho {name}\n", "utf-8")
    entrypoint.chmod(0o755)
    (source / "runtime.txt").write_text(name, "utf-8")
    return source


def _manifest(
    source: Path,
    build_id: str,
    *,
    protocol: int = 2,
    migration_class: str = "reversible",
    rollback_class: str = "automatic",
) -> dict:
    digest = runtime_upgrade.tree_digest(source)
    return {
        "schema": runtime_upgrade.MANIFEST_SCHEMA,
        "productVersion": "4.0.0-alpha.1",
        "releaseChannel": "alpha/v4/v4.0",
        "sourceCommit": "1" * 40,
        "runtimeBuildId": build_id,
        "runtimeArtifactDigest": digest,
        "runtimeEntrypoint": "bin/kungfu",
        "frontendBuildId": f"frontend-{build_id}",
        "controlProtocolRange": {"min": protocol, "max": protocol},
        "peerWireProtocolRange": {"min": protocol, "max": protocol},
        "journalSchemaReadRange": {"min": protocol, "max": protocol},
        "journalSchemaWriteVersion": protocol,
        "migrationClass": migration_class,
        "rollbackClass": rollback_class,
        "minimumSupportedFrontend": "4.0.0-alpha.1",
        "minimumSupportedRuntime": "4.0.0-alpha.1",
        "platform": "darwin",
        "architecture": "arm64",
        "artifacts": [
            {
                "kind": "runtime",
                "url": f"https://example.invalid/{build_id}.tar.zst",
                "size": 1,
                "digest": digest,
                "signature": f"fixture-signature-{build_id}",
            }
        ],
        "qualificationEvidenceRef": f"fixture:{build_id}",
        "documentationUrl": "https://www.kungfu.tech/docs/guides/upgrading",
    }


def _install(config_home: Path, source: Path, manifest: dict, clock_ns: int) -> dict:
    plan = runtime_upgrade.plan_install(
        manifest,
        source,
        config_home,
        clock_ns=clock_ns,
    )
    return runtime_upgrade.install_image(
        plan,
        expected_plan_id=plan["planId"],
        config_home=config_home,
        clock_ns=clock_ns,
    )


def _reference(build_id: str, state: str = "active") -> dict:
    return {
        "schema": runtime_upgrade.REFERENCE_SCHEMA,
        "ownerKind": "lease",
        "ownerId": f"lease-{build_id}",
        "buildId": build_id,
        "state": state,
    }


def test_install_is_side_by_side_verified_and_idempotent(tmp_path):
    source = _source(tmp_path, "runtime-a")
    manifest = _manifest(source, "runtime-a")
    plan = runtime_upgrade.plan_install(
        manifest, source, tmp_path / "config", clock_ns=1
    )

    assert plan["state"] == "download-allowed"
    image = runtime_upgrade.install_image(
        plan,
        expected_plan_id=plan["planId"],
        config_home=tmp_path / "config",
        clock_ns=2,
    )
    repeated = runtime_upgrade.install_image(
        plan,
        expected_plan_id=plan["planId"],
        config_home=tmp_path / "config",
        clock_ns=3,
    )

    assert image == repeated
    assert Path(image["artifactRoot"]).name == "runtime-a"
    assert runtime_upgrade.tree_digest(source) == manifest["runtimeArtifactDigest"]
    assert runtime_upgrade.list_images(tmp_path / "config") == [image]


def test_cli_exposes_one_welded_upgrade_contract_and_inventory(tmp_path):
    runner = CliRunner()
    home = tmp_path / "home"
    contract_result = runner.invoke(
        upgrade_test_cli,
        ["--home", str(home), "runtime", "upgrade", "contract", "--json"],
    )
    inventory_result = runner.invoke(
        upgrade_test_cli,
        ["--home", str(home), "runtime", "upgrade", "inventory", "--json"],
    )

    assert contract_result.exit_code == 0, contract_result.output
    assert json.loads(contract_result.output)["schema"] == (
        "kungfu.product-upgrade.contract/v1"
    )
    assert inventory_result.exit_code == 0, inventory_result.output
    assert json.loads(inventory_result.output) == {
        "schema": "kungfu.runtime-image-inventory/v1",
        "images": [],
    }


def test_corrupt_artifact_is_rejected_and_quarantine_is_recorded(tmp_path):
    source = _source(tmp_path, "runtime-a")
    manifest = _manifest(source, "runtime-a")
    plan = runtime_upgrade.plan_install(
        manifest, source, tmp_path / "config", clock_ns=1
    )
    (source / "runtime.txt").write_text("corrupt", "utf-8")

    with pytest.raises(runtime_upgrade.UpgradeError) as failure:
        runtime_upgrade.install_image(
            plan,
            expected_plan_id=plan["planId"],
            config_home=tmp_path / "config",
        )

    assert failure.value.code == "artifact-digest-mismatch"
    assert not (tmp_path / "config/runtime/images/runtime-a").exists()
    assert len(list((tmp_path / "config/runtime/quarantine").glob("*.json"))) == 1


@pytest.mark.parametrize("case", CASES, ids=[case["id"] for case in CASES])
def test_upgrade_planning_matrix(case, tmp_path):
    old_source = _source(tmp_path, f"{case['id']}-old")
    target_source = _source(tmp_path, f"{case['id']}-target")
    old = _install(
        tmp_path / "config", old_source, _manifest(old_source, f"{case['id']}-old"), 1
    )
    target_protocol = 2 if case["compatible"] else 3
    target = _install(
        tmp_path / "config",
        target_source,
        _manifest(
            target_source,
            f"{case['id']}-target",
            protocol=target_protocol,
            migration_class=case["migrationClass"],
        ),
        2,
    )
    references = [_reference(old["buildId"])] if case["active"] else []

    plan = runtime_upgrade.plan_upgrade(
        workspace_id="workspace-test",
        target=target,
        current=old,
        references=references,
        active_generation="7" if case["active"] else None,
        provider_resume_required=case.get("providerResumeRequired", False),
        provider_resume_supported=case.get("providerResumeSupported", False),
        backup_ready=False,
        user_confirmed=False,
        clock_ns=3,
    )

    assert plan["state"] == case["expectedState"]
    assert plan["impact"]["activeWorkContinues"] is case["active"]


def test_stale_generation_cannot_stage_and_readiness_commits_or_rolls_back(tmp_path):
    config_home = tmp_path / "config"
    old_source = _source(tmp_path, "old")
    new_source = _source(tmp_path, "new")
    old = _install(config_home, old_source, _manifest(old_source, "old"), 1)
    new = _install(config_home, new_source, _manifest(new_source, "new"), 2)
    plan = runtime_upgrade.plan_upgrade(
        workspace_id="workspace-test",
        target=new,
        current=old,
        references=[],
        active_generation="4",
        clock_ns=3,
    )

    with pytest.raises(runtime_upgrade.UpgradeError) as failure:
        runtime_upgrade.stage_upgrade(
            plan,
            expected_plan_id=plan["planId"],
            current_generation="5",
            config_home=config_home,
        )
    assert failure.value.code == "stale-generation"

    receipt = runtime_upgrade.stage_upgrade(
        plan,
        expected_plan_id=plan["planId"],
        current_generation="4",
        config_home=config_home,
        clock_ns=4,
    )
    rolled_back = runtime_upgrade.reconcile_upgrade(
        receipt,
        readiness_passed=False,
        config_home=config_home,
    )
    assert rolled_back["state"] == "failed-rolled-back"
    assert (
        runtime_upgrade.active_image(config_home, "workspace-test")["buildId"] == "old"
    )

    with pytest.raises(runtime_upgrade.UpgradeError) as stale_receipt:
        runtime_upgrade.reconcile_upgrade(
            receipt,
            readiness_passed=True,
            config_home=config_home,
        )
    assert stale_receipt.value.code == "stale-receipt"

    retry = runtime_upgrade.plan_upgrade(
        workspace_id="workspace-commit-test",
        target=new,
        current=old,
        references=[],
        active_generation="4",
        clock_ns=5,
    )
    completed = runtime_upgrade.reconcile_upgrade(
        runtime_upgrade.stage_upgrade(
            retry,
            expected_plan_id=retry["planId"],
            current_generation="4",
            config_home=config_home,
            clock_ns=6,
        ),
        readiness_passed=True,
        config_home=config_home,
    )
    assert completed["state"] == "complete"
    assert (
        runtime_upgrade.active_image(config_home, "workspace-commit-test")["buildId"]
        == "new"
    )


def test_generation_pin_is_immutable_when_current_pointer_changes(
    tmp_path, monkeypatch
):
    config_home = tmp_path / "config"
    source_a = _source(tmp_path, "runtime-a")
    source_b = _source(tmp_path, "runtime-b")
    image_a = _install(config_home, source_a, _manifest(source_a, "runtime-a"), 1)
    image_b = _install(config_home, source_b, _manifest(source_b, "runtime-b"), 2)

    command_a = runtime_upgrade.pinned_entry_command(image_a)
    monkeypatch.setenv("KF_RUNTIME_BUILD_ID", image_b["buildId"])
    monkeypatch.setenv("KF_RUNTIME_ARTIFACT_ROOT", image_b["artifactRoot"])
    monkeypatch.setenv("KF_RUNTIME_ENTRYPOINT", image_b["entrypoint"])
    monkeypatch.setenv("KF_RUNTIME_MANIFEST_DIGEST", image_b["manifestDigest"])

    assert runtime_upgrade.pinned_entry_command(image_a) == command_a
    assert command_a != runtime_upgrade.pinned_entry_command(image_b)
    assert runtime_upgrade.image_from_environment(os.environ)["buildId"] == "runtime-b"

    coordinator = runtime_service.coordinator_run_command(
        str(tmp_path / "home"),
        str(tmp_path / "runtime"),
        "warning",
        image_a,
    )
    child_env = runtime_service.command_env(
        str(tmp_path / "home"),
        str(tmp_path / "runtime"),
        "warning",
        str(config_home),
        image_a,
    )
    assert coordinator[0] == command_a[0]
    assert child_env["KF_RUNTIME_BUILD_ID"] == "runtime-a"
    assert child_env["KF_RUNTIME_ARTIFACT_ROOT"] == image_a["artifactRoot"]


def test_gc_retains_live_images_and_fails_closed_on_unknown_references(tmp_path):
    config_home = tmp_path / "config"
    source_a = _source(tmp_path, "runtime-a")
    source_b = _source(tmp_path, "runtime-b")
    image_a = _install(config_home, source_a, _manifest(source_a, "runtime-a"), 1)
    image_b = _install(config_home, source_b, _manifest(source_b, "runtime-b"), 2)

    blocked = runtime_upgrade.plan_gc(
        [image_a, image_b],
        [_reference("runtime-a")],
        unknown_references=True,
        clock_ns=3,
    )
    assert blocked["state"] == "action-required"
    assert blocked["candidates"] == []

    plan = runtime_upgrade.plan_gc(
        [image_a, image_b],
        [_reference("runtime-a")],
        clock_ns=4,
    )
    assert [item["buildId"] for item in plan["blocked"]] == ["runtime-a"]
    assert [item["buildId"] for item in plan["candidates"]] == ["runtime-b"]
    assert runtime_upgrade.apply_gc(
        plan,
        expected_plan_id=plan["planId"],
        config_home=config_home,
        references=[_reference("runtime-a")],
    ) == ["runtime-b"]
    assert Path(image_a["artifactRoot"]).is_dir()
    assert not Path(image_b["artifactRoot"]).exists()


def test_gc_apply_rejects_a_new_reference_without_deleting_any_image(tmp_path):
    config_home = tmp_path / "config"
    source = _source(tmp_path, "runtime-a")
    image = _install(config_home, source, _manifest(source, "runtime-a"), 1)
    plan = runtime_upgrade.plan_gc([image], [], clock_ns=2)

    with pytest.raises(runtime_upgrade.UpgradeError) as failure:
        runtime_upgrade.apply_gc(
            plan,
            expected_plan_id=plan["planId"],
            config_home=config_home,
            references=[_reference("runtime-a")],
        )

    assert failure.value.code == "stale-plan"
    assert Path(image["artifactRoot"]).is_dir()
