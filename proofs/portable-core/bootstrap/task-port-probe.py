"""Synthetic task-port positive control. Supervisor supplies its own live child PID only."""
from __future__ import annotations

import ctypes
import json
import sys


def probe(pid: int) -> dict[str, int | bool]:
    if sys.platform != "darwin" or pid <= 1:
        raise ValueError("unsupported synthetic target")
    lib = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
    lib.mach_task_self.argtypes = []
    lib.mach_task_self.restype = ctypes.c_uint
    lib.task_for_pid.argtypes = [ctypes.c_uint, ctypes.c_int, ctypes.POINTER(ctypes.c_uint)]
    lib.task_for_pid.restype = ctypes.c_int
    lib.mach_port_deallocate.argtypes = [ctypes.c_uint, ctypes.c_uint]
    lib.mach_port_deallocate.restype = ctypes.c_int
    port = ctypes.c_uint(0)
    own_task = lib.mach_task_self()
    code = lib.task_for_pid(own_task, pid, ctypes.byref(port))
    released = code != 0 or lib.mach_port_deallocate(own_task, port.value) == 0
    return {"allowed": code == 0, "code": code, "released": released}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise ValueError("one owned synthetic PID required")
    print(json.dumps(probe(int(sys.argv[1]))), flush=True)
