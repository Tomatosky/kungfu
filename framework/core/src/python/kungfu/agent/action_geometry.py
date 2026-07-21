# SPDX-License-Identifier: Apache-2.0

"""Versioned KFD-7 Action Geometry without adopter-domain policy.

Authority for evaluate* lives in libkungfu ``action_runtime``; this module keeps
contract/metadata discovery in Python and forwards evaluation to the native edge.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from kungfu import contract as contract_runtime
from kungfu.storage import service as storage_service


SURFACE = "action-geometry"
EVALUATION_SCHEMA = "kungfu.action-geometry.evaluation/v1"
SESSION_EVALUATION_SCHEMA = "kungfu.action-geometry.session-evaluation/v1"


def contract() -> dict[str, Any]:
    return contract_runtime.load_contract(SURFACE)


def metadata() -> dict[str, str | int]:
    return contract_runtime.contract_metadata(SURFACE)


def evaluate(
    responsibility_ids: Mapping[str, str],
    *,
    inference_claims: Sequence[str] = (),
) -> dict[str, Any]:
    """Evaluate responsibility topology and non-substitution invariants."""

    return storage_service.action_runtime(
        "",
        "evaluate",
        {
            "responsibility_ids": dict(responsibility_ids),
            "inference_claims": list(inference_claims),
        },
    )


def evaluate_session_refinement(
    before: Mapping[str, Any],
    after: Mapping[str, Any],
) -> dict[str, Any]:
    """Check the geometry's conservative session round-trip dimensions."""

    return storage_service.action_runtime(
        "",
        "evaluate_session_refinement",
        {"before": dict(before), "after": dict(after)},
    )
