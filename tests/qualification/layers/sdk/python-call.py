# SPDX-License-Identifier: Apache-2.0

import json
import os
import sys
import time

from kungfu_sdk import NativeStorage, REQUIRED_CAPABILITIES


def main() -> int:
    if len(sys.argv) != 4:
        print(
            "usage: python-call.py RUNTIME_DIR OPERATION REQUEST_JSON", file=sys.stderr
        )
        return 2
    runtime_dir, operation, request_json = sys.argv[1:]
    with NativeStorage(runtime_dir) as storage:
        if storage.capabilities & REQUIRED_CAPABILITIES != REQUIRED_CAPABILITIES:
            raise RuntimeError("incomplete native capability mask")
        result = storage.execute(operation, json.loads(request_json))
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    time.sleep(int(os.environ.get("KUNGFU_QUALIFICATION_HOLD_MS", "0")) / 1000)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
