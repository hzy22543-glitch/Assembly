"""
GDB Controller — 持久化 GDB MI 交互会话
通过 subprocess.Popen 维持对 gdb --interpreter=mi 的持久连接。

功能:
  - start_debug(executable)  — 启动 GDB 调试会话
  - set_breakpoint(location)  — 设置断点
  - run_program()             — 运行到第一个断点
  - step_instruction()        — 单步执行 (stepi - 汇编级)
  - step_over()               — 步过 (nexti - 汇编级)
  - get_registers()           — 获取所有寄存器值 → JSON
  - get_memory(addr, count)   — 读取内存 → JSON
  - get_disassembly(n)        — 读取当前位置反汇编
  - continue_run()            — 继续运行
  - quit()                    — 退出 GDB

安全:
  - 每个会话独立 (一个 Popen 实例)
  - 可超时终止
"""

import subprocess
import shutil
import threading
import time
import os
import re
import queue

from gdb_mi_parser import (
    parse_mi_output, parse_mi_line,
    extract_register_values, extract_memory_values, extract_frame_info
)


class GDBController:
    """
    维护一个持久的 GDB MI 子进程连接。
    所有命令通过 stdin 发送，输出通过 stdout 读取并解析。
    """

    # x86-64 通用寄存器编号 (GDB 顺序)
    X86_64_GP_REGS = "0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17"
    # 对应名称
    REG_NAMES = [
        "rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rbp", "rsp",
        "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15",
        "rip", "eflags"
    ]

    def __init__(self, gdb_path: str = None, timeout: float = 10.0):
        if gdb_path:
            self.gdb_path = gdb_path
        else:
            from assembler_runner import resolve_tool_path

            self.gdb_path = resolve_tool_path("gdb") or shutil.which("gdb") or "gdb"
        self.timeout = timeout
        self.process = None
        self._output_queue = queue.Queue()
        self._reader_thread = None
        self._token_counter = 100
        self._alive = False

    @property
    def is_alive(self) -> bool:
        return self._alive and self.process and self.process.poll() is None

    def start_debug(self, executable_path: str) -> dict:
        """
        启动 GDB MI 会话并加载可执行文件。

        Returns:
            {"status": "ok", "gdb_version": "...", "file": executable_path}
        """
        if self.process:
            self.quit()

        self.process = subprocess.Popen(
            [self.gdb_path, "--interpreter=mi", "--quiet", executable_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,  # Unbuffered
            env={
                "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                "HOME": os.environ.get("HOME", "/tmp"),
                "TERM": "dumb",
            }
        )
        self._alive = True

        # Start background reader thread
        self._reader_thread = threading.Thread(
            target=self._reader_loop, daemon=True
        )
        self._reader_thread.start()

        # Read initial GDB startup output
        startup = self._read_until_prompt(timeout=5.0)

        # Extract GDB version from console output
        version = ""
        for record in startup:
            if record.get("record_type") == "console":
                text = record.get("text", "")
                if "GNU gdb" in text:
                    version = text.strip()

        # Set breakpoint at _start or main
        self._send_command("-break-insert _start")
        bp_result = self._read_until_result(timeout=3.0)

        # If no _start, try main
        if bp_result and bp_result.get("class") != "done":
            self._send_command("-break-insert main")
            bp_result = self._read_until_result(timeout=3.0)

        return {
            "status": "ok",
            "gdb_version": version,
            "file": executable_path
        }

    def run_program(self, input_data: str = "") -> dict:
        """
        运行程序直到第一个断点。

        Returns:
            {"status": "stopped"|"running"|"exited", "frame": {...}, "registers": {...}}
        """
        self._send_command("-exec-run")
        records = self._read_until_stopped(timeout=self.timeout)

        # Find the *stopped record
        for r in records:
            if r.get("record_type") == "exec" and r.get("class") == "stopped":
                frame = extract_frame_info(r)
                regs = self._fetch_registers()
                return {
                    "status": "stopped",
                    "frame": frame,
                    "registers": regs,
                }

        return {"status": "unknown", "raw": records}

    def step_instruction(self) -> dict:
        """
        单步执行一条汇编指令 (stepi)。

        Returns:
            {
                "status": "stopped"|"exited",
                "frame": {"addr": "0x...", "func": "...", "line": "..."},
                "registers": {"rax": "0x...", "rbx": "0x...", ...}
            }
        """
        self._send_command("-exec-step-instruction")
        return self._process_stop_event()

    def step_over(self) -> dict:
        """
        步过 (nexti) — 不进入 CALL 指令内部。
        """
        self._send_command("-exec-next-instruction")
        return self._process_stop_event()

    def continue_run(self) -> dict:
        """继续运行到下一个断点或程序结束。"""
        self._send_command("-exec-continue")
        return self._process_stop_event()

    def get_registers(self) -> dict:
        """
        获取所有通用寄存器值。

        Returns:
            {"rax": "0x5", "rbx": "0xa", "rcx": "0x0", ...}
        """
        return self._fetch_registers()

    def get_memory(self, address: str, count: int = 64) -> dict:
        """
        读取内存。

        Args:
            address: 起始地址 (十六进制字符串或表达式, 如 "0x601000" 或 "$rsp")
            count:   读取字节数

        Returns:
            {"address": "0x601000", "bytes": [0x48, 0x65, ...], "ascii": "He..."}
        """
        self._send_command(f"-data-read-memory-bytes {address} {count}")
        result = self._read_until_result(timeout=3.0)

        if result and result.get("class") == "done":
            mem_blocks = extract_memory_values(result)
            if mem_blocks:
                block = mem_blocks[0]
                # Add ASCII representation
                ascii_repr = ""
                for b in block["bytes"]:
                    ascii_repr += chr(b) if 32 <= b < 127 else "."
                block["ascii"] = ascii_repr
                return block

        return {"address": address, "bytes": [], "ascii": "",
                "error": result.get("msg", "Memory read failed") if result else "Timeout"}

    def get_stack(self, count: int = 32) -> dict:
        """读取栈内存 (从 RSP 开始)。"""
        return self.get_memory("$rsp", count)

    def set_breakpoint(self, location: str) -> dict:
        """
        设置断点。

        Args:
            location: 行号 ("10"), 函数名 ("_start"), 或地址 ("*0x401000")
        """
        self._send_command(f"-break-insert {location}")
        result = self._read_until_result(timeout=3.0)
        if result and result.get("class") == "done":
            bkpt = result.get("bkpt", {})
            return {
                "status": "ok",
                "number": bkpt.get("number", ""),
                "addr": bkpt.get("addr", ""),
                "func": bkpt.get("func", ""),
                "file": bkpt.get("file", ""),
                "line": bkpt.get("line", ""),
            }
        return {"status": "error", "message": result.get("msg", "") if result else "Timeout"}

    def get_disassembly(self, lines: int = 5) -> list:
        """
        获取当前位置的反汇编。

        Returns:
            [{"addr": "0x401000", "inst": "mov eax, 1"}, ...]
        """
        self._send_command(f"-data-disassemble -s $pc -e $pc+{lines * 8} -- 0")
        result = self._read_until_result(timeout=3.0)

        if result and result.get("class") == "done":
            asm_insns = result.get("asm_insns", [])
            if isinstance(asm_insns, list):
                disasm = []
                for insn in asm_insns:
                    if isinstance(insn, dict):
                        disasm.append({
                            "addr": insn.get("address", ""),
                            "inst": insn.get("inst", ""),
                            "offset": insn.get("offset", ""),
                        })
                return disasm

        return []

    def evaluate_expression(self, expr: str) -> str:
        """求值表达式 (例如 "$rax + 4")"""
        self._send_command(f"-data-evaluate-expression {expr}")
        result = self._read_until_result(timeout=3.0)
        if result and result.get("class") == "done":
            return result.get("value", "")
        return ""

    def quit(self):
        """退出 GDB 会话。"""
        self._alive = False
        if self.process:
            try:
                self._send_command("-gdb-exit")
                self.process.wait(timeout=2)
            except Exception:
                try:
                    self.process.kill()
                    self.process.wait(timeout=1)
                except Exception:
                    pass
            self.process = None

    # ---- Internal Methods ----

    def _send_command(self, command: str):
        """发送 MI 命令到 GDB。"""
        if not self.is_alive:
            raise RuntimeError("GDB process is not running")

        self._token_counter += 1
        full_cmd = f"{self._token_counter}{command}\n"
        try:
            self.process.stdin.write(full_cmd.encode("utf-8"))
            self.process.stdin.flush()
        except (BrokenPipeError, OSError) as e:
            self._alive = False
            raise RuntimeError(f"GDB pipe broken: {e}")

    def _reader_loop(self):
        """后台线程：持续读取 GDB stdout 并放入队列。"""
        try:
            while self._alive and self.process and self.process.poll() is None:
                line = self.process.stdout.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").rstrip('\r\n')
                if decoded:
                    record = parse_mi_line(decoded)
                    if record:
                        self._output_queue.put(record)
        except Exception:
            pass
        finally:
            self._alive = False

    def _read_until_prompt(self, timeout: float = 5.0) -> list:
        """读取直到 (gdb) 提示符。"""
        records = []
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                record = self._output_queue.get(timeout=0.1)
                records.append(record)
                if record.get("record_type") == "prompt":
                    break
            except queue.Empty:
                continue
        return records

    def _read_until_result(self, timeout: float = 5.0) -> dict:
        """读取直到收到 ^ result record。"""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                record = self._output_queue.get(timeout=0.1)
                if record.get("record_type") == "result":
                    return record
            except queue.Empty:
                continue
        return None

    def _read_until_stopped(self, timeout: float = None) -> list:
        """读取直到 *stopped 或 *running 后的 *stopped。"""
        timeout = timeout or self.timeout
        records = []
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                record = self._output_queue.get(timeout=0.1)
                records.append(record)
                if record.get("record_type") == "exec":
                    cls = record.get("class", "")
                    if cls == "stopped":
                        return records
                    if cls == "error":
                        return records
            except queue.Empty:
                continue
        return records

    def _process_stop_event(self) -> dict:
        """处理 step/next/continue 后的停止事件。"""
        records = self._read_until_stopped(timeout=self.timeout)

        for r in records:
            if r.get("record_type") == "exec" and r.get("class") == "stopped":
                reason = r.get("reason", "")
                if reason in ("exited", "exited-normally", "exited-signalled"):
                    return {
                        "status": "exited",
                        "exit_code": r.get("exit-code", "0"),
                        "frame": {},
                        "registers": {},
                    }

                frame = extract_frame_info(r)
                regs = self._fetch_registers()
                return {
                    "status": "stopped",
                    "frame": frame,
                    "registers": regs,
                }

        # Check if exited
        for r in records:
            if r.get("record_type") == "result" and r.get("class") == "error":
                return {
                    "status": "error",
                    "message": r.get("msg", "Unknown error"),
                    "frame": {},
                    "registers": {},
                }

        return {
            "status": "timeout",
            "message": f"No response within {self.timeout}s",
            "frame": {},
            "registers": {},
        }

    def _fetch_registers(self) -> dict:
        """获取所有通用寄存器。"""
        try:
            self._send_command(f"-data-list-register-values x {self.X86_64_GP_REGS}")
            result = self._read_until_result(timeout=3.0)
            if result and result.get("class") == "done":
                return extract_register_values(result)
        except Exception:
            pass
        return {}


class DebugSession:
    """
    完整的调试会话管理器。
    封装：编译 → 启动 GDB → 逐步调试 → 获取状态 → 清理。
    """

    def __init__(self, runner=None, gdb_timeout: float = 10.0):
        from assembler_runner import AssemblerRunner
        self.runner = runner or AssemblerRunner(timeout=10)
        self.gdb = GDBController(timeout=gdb_timeout)
        self._tmpdir = None
        self._exe_path = None

    def start(self, source_code: str) -> dict:
        """
        编译源代码并启动 GDB 调试会话。

        Returns:
            {"status": "ok"|"error", "frame": {...}, "registers": {...}}
        """
        import tempfile

        # 创建临时目录
        self._tmpdir = tempfile.mkdtemp(prefix="asm_debug_")
        asm_file = os.path.join(self._tmpdir, "main.asm")
        obj_file = os.path.join(self._tmpdir, "main.o")
        exe_file = os.path.join(self._tmpdir, "main")

        # 写入源代码
        with open(asm_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        # 编译 (使用 AssemblerRunner 的逻辑)
        include_dir = self.runner.include_dir

        # 第一步: 汇编
        nasm_result = subprocess.run(
            [self.runner.nasm_path, "-f", "elf64", "-g", "-F", "dwarf",
             "-I", include_dir + os.sep, asm_file, "-o", obj_file],
            capture_output=True, text=True, timeout=10, cwd=self._tmpdir
        )

        if nasm_result.returncode != 0:
            self.cleanup()
            from assembler_runner import parse_nasm_errors
            return {
                "status": "error",
                "stage": "assemble",
                "errors": parse_nasm_errors(nasm_result.stderr),
                "stderr": nasm_result.stderr,
            }

        # 第二步: 链接
        needs_libc = self.runner._uses_libc(source_code)
        gcc_cmd = [self.runner.gcc_path, "-no-pie", "-m64", obj_file, "-o", exe_file]
        if not needs_libc:
            gcc_cmd.append("-nostartfiles")

        link_result = subprocess.run(
            gcc_cmd, capture_output=True, text=True, timeout=10, cwd=self._tmpdir
        )

        if link_result.returncode != 0:
            self.cleanup()
            from assembler_runner import parse_gcc_errors
            return {
                "status": "error",
                "stage": "link",
                "errors": parse_gcc_errors(link_result.stderr),
                "stderr": link_result.stderr,
            }

        self._exe_path = exe_file

        # 启动 GDB
        self.gdb.start_debug(exe_file)

        # 运行到第一个断点
        run_result = self.gdb.run_program()
        return run_result

    def step(self) -> dict:
        """单步执行一条汇编指令。"""
        return self.gdb.step_instruction()

    def step_over(self) -> dict:
        """步过 (不进入 CALL)。"""
        return self.gdb.step_over()

    def continue_run(self) -> dict:
        """继续运行。"""
        return self.gdb.continue_run()

    def get_registers(self) -> dict:
        """获取寄存器。"""
        return self.gdb.get_registers()

    def get_memory(self, address: str, count: int = 64) -> dict:
        """读取内存。"""
        return self.gdb.get_memory(address, count)

    def get_stack(self, count: int = 64) -> dict:
        """读取栈。"""
        return self.gdb.get_stack(count)

    def get_disassembly(self, lines: int = 10) -> list:
        """获取反汇编。"""
        return self.gdb.get_disassembly(lines)

    def set_breakpoint(self, location: str) -> dict:
        return self.gdb.set_breakpoint(location)

    def cleanup(self):
        """清理会话。"""
        try:
            self.gdb.quit()
        except Exception:
            pass
        if self._tmpdir:
            import shutil
            try:
                shutil.rmtree(self._tmpdir, ignore_errors=True)
            except Exception:
                pass
            self._tmpdir = None

    def __del__(self):
        self.cleanup()
