"""Command line for tally."""
import sys

import calc
import readers


def main(argv: list[str]) -> int:
    rows = readers.load_rows(argv[1])
    print(calc.total([cell for row in rows for cell in row]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
