"""Row readers. `load_rows` is called by other tools; its signature is a contract."""


def load_rows(path: str) -> list[list[float]]:
    """Return the numeric rows of a comma-separated file."""
    with open(path) as handle:
        return [[float(cell) for cell in line.split(",")] for line in handle if line.strip()]
