# SPDX-License-Identifier: Apache-2.0

"""Thin Python projection of the libkungfu durability authority."""

from __future__ import annotations

from typing import Any

import kungfu


def capabilities() -> dict[str, Any]:
    """Return the evidence-bound durability capability without widening it."""

    return dict(kungfu.__binding__.runtime.durability_capability_typed())
