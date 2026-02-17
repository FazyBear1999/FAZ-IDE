"""Runtime Full Matrix Python diagnostics."""

from __future__ import annotations

import logging
import sys
import time
import traceback


def emit(title: str) -> None:
    print("\n" + "-" * 64)
    print(title)
    print("-" * 64)


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("runtime_full_matrix")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
    logger.addHandler(stream)
    return logger


def main() -> None:
    marker = f"runtime-full-matrix:python:{int(time.time())}"
    logger = setup_logger()

    emit("PY STEP 01 · STDOUT")
    print(f"{marker}:stdout:print")
    sys.stdout.write(f"{marker}:stdout:write\n")
    sys.stdout.flush()

    emit("PY STEP 02 · STDERR")
    sys.stderr.write(f"{marker}:stderr:write\n")
    sys.stderr.flush()

    emit("PY STEP 03 · LOGGING")
    logger.debug(f"{marker}:logger:debug")
    logger.info(f"{marker}:logger:info")

    emit("PY STEP 04 · TRACEBACK")
    try:
        _ = 42 / 0
    except Exception:
        print(f"{marker}:traceback:start")
        traceback.print_exc()

    emit("PY STEP 05 · TIMING")
    for tick in range(1, 4):
        print(f"{marker}:tick:{tick}", flush=True)
        time.sleep(0.1)

    emit("PY STEP 06 · DONE")
    print(f"{marker}:done")


if __name__ == "__main__":
    main()
