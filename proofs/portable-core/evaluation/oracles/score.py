"""Evaluator-owned scoring code. Never copy into the actor's fixture or plugin package."""
import ast
import inspect
import json
import pathlib
import sys

problems = []
try:
    candidate = pathlib.Path(sys.argv[1]) / "calc.py"
    tree = ast.parse(candidate.read_text())
    functions = [n for n in tree.body if isinstance(n, ast.FunctionDef)]
    if len(functions) != 2 or {n.name for n in functions} != {"total", "mean"}:
        raise ValueError("fixture requires total and mean functions")
    if any(not isinstance(n, ast.FunctionDef) for n in tree.body):
        raise ValueError("top-level code is outside the scored subset")
    allowed = (ast.Module, ast.FunctionDef, ast.arguments, ast.arg, ast.Return,
               ast.If, ast.Raise, ast.Assign, ast.Name, ast.Load, ast.Store,
               ast.Constant, ast.Call, ast.BinOp, ast.UnaryOp, ast.Compare,
               ast.BoolOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.USub,
               ast.UAdd, ast.Not, ast.And, ast.Or, ast.Eq, ast.NotEq,
               ast.Lt, ast.LtE, ast.Gt, ast.GtE)
    builtins = {"sum": sum, "len": len, "list": list, "tuple": tuple, "ValueError": ValueError}
    for node in ast.walk(tree):
        if not isinstance(node, allowed):
            raise ValueError("unsupported fixture syntax")
        if isinstance(node, ast.FunctionDef):
            if node not in functions or node.decorator_list or node.returns or node.args.defaults or node.args.kw_defaults:
                raise ValueError("function metadata is outside subset")
        if isinstance(node, ast.arg) and node.annotation:
            raise ValueError("annotations are outside subset")
        if isinstance(node, ast.Name):
            if node.id.startswith("_") or (isinstance(node.ctx, ast.Store) and node.id in builtins):
                raise ValueError("reserved name")
        if isinstance(node, ast.Call) and (not isinstance(node.func, ast.Name) or node.func.id not in builtins or node.keywords):
            raise ValueError("unsupported fixture call")
    namespace = {"__builtins__": builtins}
    exec(compile(tree, str(candidate), "exec"), namespace)
    class Candidate:
        pass
    module = Candidate()
    module.total = namespace["total"]
    module.mean = namespace["mean"]
    signature = inspect.signature(module.total)
    if (list(signature.parameters) != ["values"] or
        signature.parameters["values"].kind != inspect.Parameter.POSITIONAL_OR_KEYWORD or
        signature.parameters["values"].default is not inspect.Parameter.empty):
        problems.append("total signature changed")
    if module.total([2, 4, 6]) != 12 or module.total(values=[2, 4, 6]) != 12:
        problems.append("total changed")
    for values, expected in [([2, 4], 3), ([-4, 2], -1), ([5], 5)]:
        if module.mean(values) != expected:
            problems.append("mean incorrect")
    try:
        module.mean([])
        problems.append("mean did not reject empty input")
    except ValueError:
        pass
except BaseException as error:
    problems.append(type(error).__name__)
print(json.dumps({"passed": not problems, "problems": problems}))
sys.exit(bool(problems))
