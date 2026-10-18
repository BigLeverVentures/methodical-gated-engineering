"""Actor-visible smoke checks. The evaluator uses its own frozen scoring checks."""
from calc import mean, total

assert total([2, 4]) == 6
assert mean([2, 4]) == 3
