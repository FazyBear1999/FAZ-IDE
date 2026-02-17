"""Runtime Python Check: deterministic smoke test for FAZ IDE Python runtime."""

import sys
import time


def main() -> str:
    marker = f"runtime-python-check:{int(time.time())}"

    print(f"{marker}:step-01:start python test")
    print(f"{marker}:start")
    print(f"{marker}:step-02:stdout channel")
    print(f"{marker}:stdout:ok")
    print(f"{marker}:step-03:stderr channel")
    sys.stderr.write(f"{marker}:stderr:ok\n")
    sys.stderr.flush()

    values = [2, 3, 5, 8]
    total = sum(values)
    print(f"{marker}:step-04:math check")
    print(f"{marker}:calc:sum={total}")

    done = f"{marker}:done"
    print(f"{marker}:step-05:done python path is good to go")
    print(done)
    return done


main()
