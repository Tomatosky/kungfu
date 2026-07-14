# SPDX-License-Identifier: Apache-2.0

import json

from click.testing import CliRunner

from kungfu import durability
from kungfu.cli.commands import __registry__  # noqa: F401
from kungfu.cli.commands import kfc


def test_python_projection_preserves_libkungfu_capability():
    report = durability.capabilities()
    assert report["schema"] == "kungfu.durability.capability/v1"
    assert report["authority"] == "libkungfu"
    assert report["support_level"] == "production-candidate"
    assert report["production_eligible"] is False
    assert report["restore"]["verified"] is True
    assert report["restore"]["off_host"] is True
    assert report["restore"]["independent_failure_domain"] is False
    assert report["admission"]["current_hardware_candidate_complete"] is True
    assert report["admission"]["candidate_profile_default_enabled"] is False
    assert report["admission"]["clean_host_restart_qualified"] is True
    assert report["admission"]["physical_power_loss_qualified"] is False
    assert report["admission"]["production_eligible"] is False
    assert {row["name"] for row in report["profiles"]} == {
        "visible",
        "durable_group",
        "durable_sync",
        "replicated",
    }


def test_agent_capabilities_embeds_the_same_durability_report(tmp_path):
    result = CliRunner().invoke(
        kfc,
        ["--home", str(tmp_path / "home"), "agent", "capabilities", "--json"],
    )
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["durability"] == durability.capabilities()
