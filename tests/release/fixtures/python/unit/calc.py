"""Small summary statistics."""


def total(values: list[float]) -> float:
    """Return the sum of values."""
    return sum(values)


def mean(values: list[float]) -> float:
    """Return the arithmetic mean of values; raise ValueError on an empty list."""
    if not values:
        raise ValueError("mean of an empty list")
    return sum(values) / len(values)
