# SPDX-License-Identifier: Apache-2.0

import importlib.util
from pathlib import Path

import click


MODULE_PATH = (
    Path(__file__).parents[2] / "src" / "python" / "kungfu" / "cli" / "help_manifest.py"
)
SPEC = importlib.util.spec_from_file_location("kungfu_help_manifest", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
HELP_MANIFEST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELP_MANIFEST)
build = HELP_MANIFEST.build


@click.group()
@click.option("-H", "--home", type=str, help="runtime home")
@click.option("-l", "--log_level", type=click.Choice(["debug", "warning"]))
@click.option("-ENV-verify-location", is_flag=True, help="verify locations")
@click.help_option("-h", "--help")
@click.version_option("1.2.3", "--version", message="1.2.3")
def sample(home, log_level, env_verify_location):
    del home, log_level, env_verify_location


@sample.command(help="inspect the runtime")
def doctor():
    pass


def test_manifest_projects_root_routing_from_live_click_options():
    manifest = build(sample, "1.2.3")

    assert "ROOTOPT\thome\t1\tKF_HOME\t-H,--home\t\n" in manifest
    assert (
        "ROOTOPT\tlog_level\t1\tKF_LOG_LEVEL\t-l,--log_level\tdebug,warning\n"
    ) in manifest
    assert (
        "ROOTOPT\tenv_verify_location\t0\tKF_VERIFY_LOCATION\t-ENV-verify-location\t\n"
    ) in manifest
    assert "ROOTOPT\thelp\t0\t\t-h,--help\t\n" in manifest
    assert "ROOTOPT\tversion\t0\t\t--version\t\n" in manifest


def test_manifest_keeps_human_help_and_machine_routing_in_lockstep():
    records = build(sample, "1.2.3").splitlines()
    option_count = sum(record.startswith("OPT\t") for record in records)
    route_count = sum(record.startswith("ROOTOPT\t") for record in records)

    assert option_count == route_count == len(sample.params)
    assert "CMD\tdoctor\tinspect the runtime\t100" in records
