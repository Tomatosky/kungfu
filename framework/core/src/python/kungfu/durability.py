# SPDX-License-Identifier: Apache-2.0

"""Thin Python projection of the libkungfu durability authority."""

from __future__ import annotations

from typing import Any

import kungfu


def capabilities() -> dict[str, Any]:
    """Return the evidence-bound durability capability without widening it."""

    return dict(kungfu.__binding__.runtime.durability_capability_typed())


def reconcile(
    *,
    data_root: str,
    request_id: int,
    stream_id: int,
    container_epoch: int,
    sequence: int,
    frame_uid: int,
    requested_profile: str,
    writer_resource_id: str,
    qualification_profile: str,
) -> dict[str, Any]:
    """Reconcile a request against the C++ checkpoint-covered receipt index."""

    return dict(
        kungfu.__binding__.runtime.durability_reconcile_typed(
            data_root,
            request_id,
            stream_id,
            container_epoch,
            sequence,
            frame_uid,
            requested_profile,
            writer_resource_id,
            qualification_profile,
        )
    )
