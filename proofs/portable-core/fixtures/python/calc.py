# Synthetic work candidate. Public checks are smoke checks, not the scoring oracle.


def total(values):
    return sum(values)


def mean(values):
    if not values:
        return 0.0
    return sum(values) / len(values)
