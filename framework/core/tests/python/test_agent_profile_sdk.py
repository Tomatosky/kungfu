# SPDX-License-Identifier: Apache-2.0

import hashlib
import json
from pathlib import Path

from click.testing import CliRunner

from kungfu import profile_sdk
from kungfu.cli.commands import __registry__  # noqa: F401
from kungfu.cli.commands import kfc
from kungfu.storage import service as storage_service


def brief(**changes):
    value = {
        "schema": "kungfu.profile-brief/v1",
        "id": "example.week-day",
        "title": "Week / Day",
        "version": "1.0.0",
        "purposes": ["operator-review", "handoff"],
        "permissions": [],
        "identity": {"authority": "workspace-owner"},
        "evidence": {"strength": "reported-with-references"},
        "migration": {"mode": "additive"},
    }
    value.update(changes)
    return value


def collaboration_brief():
    return {
        "summary": "Coordinate Week and Day work without hiding authority.",
        "participantBenefits": [
            {
                "participantKind": "human",
                "description": "Review exact plans and receipts.",
            },
            {
                "participantKind": "agent",
                "description": "Discover constraints and execute authorized intents.",
            },
        ],
        "participants": [
            {
                "id": "owner",
                "kind": "human",
                "title": "Owner",
                "authorityClasses": ["workflow-owner"],
            },
            {"id": "worker", "kind": "agent", "title": "Agent", "authorityClasses": []},
        ],
        "constraints": [
            {
                "id": "authorization",
                "description": "Material actions require declared authority.",
                "enforcement": "runtime",
                "appliesTo": ["*"],
            }
        ],
        "knownLimits": [
            {
                "id": "identity",
                "description": "Actor identity is externally verified.",
                "effect": "external-verification-required",
            }
        ],
    }


def create_source(tmp_path):
    source = tmp_path / "profile"
    plan = profile_sdk.scaffold_plan(brief(), source)
    assert plan["ok"] is True
    receipt = profile_sdk.apply_scaffold(plan)
    assert receipt["verified"] is True
    return source, plan


def _write_json(path, value):
    data = json.dumps(value, indent=2, sort_keys=True).encode() + b"\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {
        "path": path.relative_to(path.parents[1]).as_posix(),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def add_collaboration(source):
    actions = {
        "schema": "kungfu.profile-actions/v1",
        "actions": [
            {
                "id": "complete-day",
                "title": "Complete day",
                "runner": "kfx-member",
                "operation": "example-week-day-actions",
                "authorityClass": "workflow-owner",
                "requiredCapabilities": [],
                "effects": ["append-admitted-fact"],
            }
        ],
    }
    views = {
        "schema": "kungfu.profile-views/v1",
        "views": [
            {
                "id": "week-state",
                "title": "Week state",
                "factSurfaces": ["example.week-day.day"],
                "definition": {"schema": "kungfu.query.definition/v1"},
                "view": {"kind": "table", "columns": ["subject_key"]},
            }
        ],
    }
    collaboration = {
        "schema": "kungfu.profile-collaboration/v1",
        "profileId": "example.week-day",
        "value": {
            "summary": "Coordinate Week and Day work without hiding authority.",
            "participantBenefits": [
                {
                    "participantKind": "human",
                    "description": "Review exact plans and receipts.",
                },
                {
                    "participantKind": "agent",
                    "description": "Discover constraints and execute authorized intents.",
                },
            ],
        },
        "participants": [
            {
                "id": "owner",
                "kind": "human",
                "title": "Owner",
                "authorityClasses": ["workflow-owner"],
            },
            {"id": "worker", "kind": "agent", "title": "Agent", "authorityClasses": []},
        ],
        "intents": [
            {
                "id": "complete-day",
                "title": "Complete day",
                "actionId": "complete-day",
                "inspectViewId": "week-state",
                "verifyViewId": "week-state",
                "requiredAuthority": "workflow-owner",
                "requiredCapabilities": [],
                "material": True,
                "protocol": {
                    "inspect": "profile.intent.inspect",
                    "advise": "profile.intent.advise",
                    "preview": "profile.intent.plan",
                    "authorize": "profile.decide",
                    "execute": "profile.intent.apply",
                    "receipt": "profile.intent.receipt",
                    "verify": "profile.intent.verify",
                },
            }
        ],
        "constraints": [
            {
                "id": "authorization",
                "description": "Owner approval is required.",
                "enforcement": "runtime",
                "appliesTo": ["*"],
            }
        ],
        "knownLimits": [
            {
                "id": "identity",
                "description": "Actor identity is externally verified.",
                "effect": "external-verification-required",
            }
        ],
        "presentation": {"mode": "generic", "homeViewId": "week-state"},
    }
    action_ref = _write_json(source / "actions" / "registry.json", actions)
    view_ref = _write_json(source / "views" / "registry.json", views)
    collaboration_ref = _write_json(
        source / "collaboration" / "interface.json", collaboration
    )
    profile_path = source / "profile.json"
    profile = json.loads(profile_path.read_text())
    profile["actions"]["registry"] = action_ref
    profile["views"]["registry"] = view_ref
    profile["kfd3"] = {"collaboration": collaboration_ref}
    profile_path.write_text(json.dumps(profile, indent=2, sort_keys=True) + "\n")
    return collaboration


def test_profile_resolution_skips_unreadable_unrelated_siblings(tmp_path, monkeypatch):
    source, _ = create_source(tmp_path)
    blocked_manifest = tmp_path / "unrelated" / "package.json"
    blocked_manifest.parent.mkdir()
    original_is_file = Path.is_file

    def guarded_is_file(path):
        if path == blocked_manifest:
            raise PermissionError("unrelated sibling is not readable")
        return original_is_file(path)

    monkeypatch.setattr(Path, "is_file", guarded_is_file)
    assert profile_sdk.validate_source(source, tmp_path / "runtime")["ok"] is True


def test_scaffold_is_plan_first_deterministic_and_does_not_self_certify(tmp_path):
    source = tmp_path / "profile"
    first = profile_sdk.scaffold_plan(brief(), source)
    second = profile_sdk.scaffold_plan(brief(), source)

    assert first["planId"] == second["planId"]
    assert first["selfCertifiedFields"] == []
    assert not source.exists()
    assert "profile_suite_root" not in first["files"]["profile.json"]


def test_scaffold_can_declare_generic_dual_first_collaboration(tmp_path):
    source = tmp_path / "profile"
    plan = profile_sdk.scaffold_plan(brief(collaboration=collaboration_brief()), source)
    profile_sdk.apply_scaffold(plan)

    profile = json.loads((source / "profile.json").read_text())
    assert profile["kfd3"]["collaboration"]["path"] == ("collaboration/interface.json")
    closure = profile_sdk.collaboration(source, tmp_path / "runtime")
    assert closure["declared"] is True
    assert closure["qualified"] is False
    assert closure["genericRenderer"] is True
    assert closure["actionIds"] == []
    qualification = profile_sdk.qualify_source(source, tmp_path / "runtime")
    assert qualification["kfd3"]["declared"] is True
    assert qualification["kfd3"]["qualified"] is False


def test_unresolved_semantics_return_open_decision_cards(tmp_path):
    incomplete = brief(identity={}, evidence={}, migration={})
    plan = profile_sdk.scaffold_plan(incomplete, tmp_path / "profile")

    assert plan["status"] == "needs-decision"
    assert {card["kind"] for card in plan["decisionCards"]} == {
        "identity-authority",
        "evidence-strength",
        "migration-mode",
    }
    assert all(card["answer"] is None for card in plan["decisionCards"])


def test_destructive_migration_and_unsupported_evidence_fail_closed(tmp_path):
    plan = profile_sdk.scaffold_plan(
        brief(
            evidence={"strength": "agent-self-certified"},
            migration={"mode": "explicit-destructive-plan"},
        ),
        tmp_path / "profile",
    )

    assert plan["status"] == "needs-decision"
    assert {card["kind"] for card in plan["decisionCards"]} == {
        "evidence-strength",
        "destructive-migration",
    }


def test_scaffold_rejects_tampered_plan_material(tmp_path):
    plan = profile_sdk.scaffold_plan(brief(), tmp_path / "profile")
    plan["files"]["profile.json"] += " "

    try:
        profile_sdk.apply_scaffold(plan)
    except profile_sdk.ProfileSdkError as error:
        assert error.diagnosis["code"] == "source-plan-tampered"
    else:
        raise AssertionError("tampered source plan was written")


def test_resolver_computes_exact_member_roots_and_core_verifies_closure(tmp_path):
    source, _ = create_source(tmp_path)
    runtime = tmp_path / "runtime"

    result = profile_sdk.validate_source(source, runtime)

    assert result["ok"] is True
    assert result["inspection"]["verified"] is True
    assert set(result["source"]["memberRoots"]) == {
        "example-week-day-contract",
        "example-week-day-actions",
        "example-week-day-assessment",
    }
    assert all(
        root.startswith("sha256:") for root in result["source"]["memberRoots"].values()
    )


def test_collaboration_closure_binds_dual_first_actions_views_and_limits(tmp_path):
    source, _ = create_source(tmp_path)
    add_collaboration(source)

    result = profile_sdk.collaboration(source, tmp_path / "runtime")

    assert result["status"] == "declared-closed"
    assert result["declared"] is True
    assert result["qualified"] is False
    assert result["actionIds"] == ["complete-day"]
    assert result["viewIds"] == ["week-state"]
    assert result["closureRoot"].startswith("sha256:")
    assert {row["kind"] for row in result["participants"]} == {"human", "agent"}


def test_profile_without_collaboration_is_explicitly_not_declared(tmp_path):
    source, _ = create_source(tmp_path)

    result = profile_sdk.collaboration(source, tmp_path / "runtime")

    assert result["status"] == "not-declared"
    assert result["declared"] is False
    assert result["qualified"] is False


def test_collaboration_rejects_missing_agent_participant(tmp_path):
    source, _ = create_source(tmp_path)
    collaboration = add_collaboration(source)
    collaboration["participants"][1] = {
        "id": "reviewer",
        "kind": "human",
        "title": "Reviewer",
        "authorityClasses": [],
    }
    ref = _write_json(source / "collaboration" / "interface.json", collaboration)
    profile_path = source / "profile.json"
    profile = json.loads(profile_path.read_text())
    profile["kfd3"] = {"collaboration": ref}
    profile_path.write_text(json.dumps(profile, indent=2, sort_keys=True) + "\n")

    try:
        profile_sdk.collaboration(source, tmp_path / "runtime")
    except profile_sdk.ProfileSdkError as error:
        assert error.diagnosis["code"] == "collaboration-dual-first-required"
    else:
        raise AssertionError("single-participant collaboration was accepted")


def test_collaboration_rejects_action_capability_drift(tmp_path):
    source, _ = create_source(tmp_path)
    collaboration = add_collaboration(source)
    collaboration["intents"][0]["requiredCapabilities"] = ["network"]
    ref = _write_json(source / "collaboration" / "interface.json", collaboration)
    profile_path = source / "profile.json"
    profile = json.loads(profile_path.read_text())
    profile["kfd3"] = {"collaboration": ref}
    profile_path.write_text(json.dumps(profile, indent=2, sort_keys=True) + "\n")

    try:
        profile_sdk.collaboration(source, tmp_path / "runtime")
    except profile_sdk.ProfileSdkError as error:
        assert error.diagnosis["code"] == "collaboration-capability-drift"
    else:
        raise AssertionError("capability drift was accepted")


def test_collaboration_rejects_material_action_without_authority(tmp_path):
    source, _ = create_source(tmp_path)
    collaboration = add_collaboration(source)
    collaboration["intents"][0]["requiredAuthority"] = "none"
    collaboration_ref = _write_json(
        source / "collaboration" / "interface.json", collaboration
    )
    actions_path = source / "actions" / "registry.json"
    actions = json.loads(actions_path.read_text())
    actions["actions"][0]["authorityClass"] = "none"
    action_ref = _write_json(actions_path, actions)
    profile_path = source / "profile.json"
    profile = json.loads(profile_path.read_text())
    profile["actions"]["registry"] = action_ref
    profile["kfd3"] = {"collaboration": collaboration_ref}
    profile_path.write_text(json.dumps(profile, indent=2, sort_keys=True) + "\n")

    try:
        profile_sdk.collaboration(source, tmp_path / "runtime")
    except profile_sdk.ProfileSdkError as error:
        assert error.diagnosis["code"] == "profile-sdk-contract-invalid"
    else:
        raise AssertionError("material action without authority was accepted")


def test_missing_member_fails_with_stable_decision_card(tmp_path):
    source, _ = create_source(tmp_path)
    missing = source / "members" / "example-week-day-actions"
    for child in missing.iterdir():
        child.unlink()
    missing.rmdir()

    try:
        profile_sdk.resolve_source(source)
    except profile_sdk.ProfileSdkError as error:
        assert error.diagnosis["code"] == "member-resolution-failed"
        assert error.diagnosis["decisionCards"][0]["kind"] == "profile-member-missing"
    else:
        raise AssertionError("missing member was accepted")


def test_member_package_symlink_fails_closed(tmp_path):
    source, _ = create_source(tmp_path)
    outside = tmp_path / "outside.txt"
    outside.write_text("outside")
    (source / "members" / "example-week-day-contract" / "outside-link").symlink_to(
        outside
    )

    try:
        profile_sdk.resolve_source(source)
    except profile_sdk.ProfileSdkError as error:
        assert error.diagnosis["code"] == "member-package-symlink"
    else:
        raise AssertionError("symlinked member material was accepted")


def test_member_package_ignores_dependency_directory_symlinks(tmp_path):
    source, _ = create_source(tmp_path)
    member = source / "members" / "example-week-day-contract"
    dependencies = member / "node_modules"
    dependencies.mkdir()
    (dependencies / "dependency").symlink_to(tmp_path)

    result = profile_sdk.validate_source(source, tmp_path / "runtime")

    assert result["ok"] is True


def test_cli_exposes_collaboration_closure_to_agents(tmp_path):
    source, _ = create_source(tmp_path)
    add_collaboration(source)
    runner = CliRunner()

    result = runner.invoke(
        kfc,
        [
            "--home",
            str(tmp_path / "home"),
            "profile",
            "collaboration",
            str(source),
            "--json",
        ],
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["status"] == "declared-closed"
    assert payload["protocol"] == [
        "inspect",
        "advise",
        "preview",
        "authorize",
        "execute",
        "receipt",
        "verify",
    ]


def test_cli_installed_flow_plans_then_applies_core_lifecycle(tmp_path):
    source, _ = create_source(tmp_path)
    home = tmp_path / "home"
    runner = CliRunner()

    capability = runner.invoke(
        kfc, ["--home", str(home), "profile", "capabilities", "--json"]
    )
    assert capability.exit_code == 0, capability.output
    capability_payload = json.loads(capability.output)
    assert capability_payload["schema"] == "kungfu.agent-profile-sdk/v1"
    assert (
        capability_payload["schemas"]["collaboration"]["properties"]["schema"]["const"]
        == "kungfu.profile-collaboration/v1"
    )

    plan_file = tmp_path / "install-plan.json"
    planned = runner.invoke(
        kfc,
        [
            "--home",
            str(home),
            "profile",
            "plan",
            "install",
            str(source),
            "--out",
            str(plan_file),
            "--json",
        ],
    )
    assert planned.exit_code == 0, planned.output
    plan_payload = json.loads(planned.output)
    assert plan_payload["decisionCard"]["answer"] is None
    assert plan_file.is_file()

    answer_file = tmp_path / "answer.json"
    decided = runner.invoke(
        kfc,
        [
            "--home",
            str(home),
            "profile",
            "decide",
            str(plan_file),
            "--choice",
            "approve",
            "--authorized-by",
            "test-operator",
            "--out",
            str(answer_file),
            "--json",
        ],
    )
    assert decided.exit_code == 0, decided.output
    assert answer_file.is_file()

    applied = runner.invoke(
        kfc,
        [
            "--home",
            str(home),
            "profile",
            "apply",
            str(plan_file),
            "--authorization-file",
            str(answer_file),
            "--json",
        ],
    )
    assert applied.exit_code == 0, applied.output
    assert json.loads(applied.output)["state"]["state"] == "installed"


def test_cli_exports_and_imports_profile_source_without_lifecycle_mutation(tmp_path):
    source, _ = create_source(tmp_path)
    home = tmp_path / "home"
    full_path = tmp_path / "profile.full.json"
    thin_path = tmp_path / "profile.thin.json"
    imported_source = tmp_path / "imported-profile"
    runner = CliRunner()

    exported = runner.invoke(
        kfc,
        [
            "--home",
            str(home),
            "profile",
            "export",
            str(source),
            "--out",
            str(full_path),
            "--json",
        ],
    )
    assert exported.exit_code == 0, exported.output
    full = json.loads(full_path.read_text())
    assert full["schema"] == "kungfu.profile-source-bundle/v1"
    assert full["mode"] == "full"
    assert all("contentBase64" in row for row in full["entries"])

    planned = runner.invoke(
        kfc,
        [
            "--home",
            str(home),
            "profile",
            "import",
            str(full_path),
            "--out",
            str(imported_source),
            "--json",
        ],
    )
    assert planned.exit_code == 0, planned.output
    assert json.loads(planned.output)["requiresAuthorization"] is True
    imported = runner.invoke(
        kfc,
        [
            "--home",
            str(home),
            "profile",
            "import",
            str(full_path),
            "--out",
            str(imported_source),
            "--execute",
            "--authorized-by",
            "test-owner",
            "--json",
        ],
    )
    assert imported.exit_code == 0, imported.output
    receipt = json.loads(imported.output)
    assert receipt["lifecycleMutation"] is False
    assert profile_sdk.validate_source(imported_source, home / "runtime")["ok"]
    assert (
        storage_service.profile_lifecycle(
            home / "runtime", "list", include_removed=True
        )["profiles"]
        == []
    )

    thin = runner.invoke(
        kfc,
        [
            "--home",
            str(home),
            "profile",
            "export",
            str(source),
            "--out",
            str(thin_path),
            "--thin",
            "--json",
        ],
    )
    assert thin.exit_code == 0, thin.output
    assert all(
        "contentBase64" not in row
        for row in json.loads(thin_path.read_text())["entries"]
    )
    thin_import = runner.invoke(
        kfc,
        [
            "--home",
            str(home),
            "profile",
            "import",
            str(thin_path),
            "--out",
            str(tmp_path / "thin-import"),
            "--execute",
            "--authorized-by",
            "test-owner",
            "--json",
        ],
    )
    assert thin_import.exit_code == 2
    assert json.loads(thin_import.output)["code"] == "source-import-not-ready"


def test_lifecycle_apply_rejects_tampered_decision_answer(tmp_path):
    source, _ = create_source(tmp_path)
    runtime = tmp_path / "runtime"
    plan = profile_sdk.lifecycle_plan(runtime, "install", source)
    answer = profile_sdk.answer_decision(
        plan["decisionCard"], "approve", "test-operator"
    )
    answer["authorizedBy"] = "another-actor"

    try:
        profile_sdk.authorized_lifecycle_apply(runtime, plan, answer)
    except profile_sdk.ProfileSdkError as error:
        assert error.diagnosis["code"] == "decision-answer-tampered"
    else:
        raise AssertionError("tampered decision answer was accepted")


def test_semantic_diff_classifies_permission_and_requires_decision(tmp_path):
    left = tmp_path / "left"
    right = tmp_path / "right"
    profile_sdk.apply_scaffold(profile_sdk.scaffold_plan(brief(), left))
    profile_sdk.apply_scaffold(
        profile_sdk.scaffold_plan(brief(permissions=["journal.read.batch"]), right)
    )

    result = profile_sdk.semantic_diff(left, right)

    assert "permission" in result["changedCategories"]
    assert result["decisionCards"][0]["kind"] == "profile-permission-change"


def test_action_invoke_rechecks_active_root_and_returns_core_receipt(tmp_path):
    source, _ = create_source(tmp_path)
    registry_path = source / "actions" / "registry.json"
    registry = {
        "schema": "kungfu.profile-actions/v1",
        "actions": [
            {
                "id": "retire",
                "title": "Retire Profile",
                "runner": "profile-lifecycle",
                "operation": "remove",
                "authorityClass": "workspace-profile-operator",
                "requiredCapabilities": [],
                "effects": ["append-Removed-event"],
            }
        ],
    }
    registry_bytes = (json.dumps(registry, indent=2, sort_keys=True) + "\n").encode()
    registry_path.write_bytes(registry_bytes)
    profile_path = source / "profile.json"
    profile = json.loads(profile_path.read_text())
    profile["actions"]["registry"]["sha256"] = hashlib.sha256(
        registry_bytes
    ).hexdigest()
    profile_path.write_text(json.dumps(profile, indent=2, sort_keys=True) + "\n")
    runtime = tmp_path / "runtime"

    install = profile_sdk.lifecycle_plan(runtime, "install", source)["corePlan"]
    profile_sdk.lifecycle_apply(runtime, install, "test:install")
    qualify = profile_sdk.lifecycle_plan(runtime, "qualify", source)["corePlan"]
    profile_sdk.lifecycle_apply(runtime, qualify, "test:qualify")
    activate = profile_sdk.lifecycle_plan(runtime, "activate", source)["corePlan"]
    profile_sdk.lifecycle_apply(runtime, activate, "test:activate")

    action_plan = profile_sdk.plan_action(source, runtime, "retire", {})
    answer = profile_sdk.answer_decision(
        action_plan["decisionCard"], "approve", "test-operator"
    )
    receipt = profile_sdk.authorized_action_invoke(runtime, action_plan, answer)

    assert receipt["schema"] == "kungfu.profile-action-receipt/v1"
    assert receipt["coreReceipt"]["state"]["state"] == "removed"
    assert receipt["verified"] is True
