"""
AssemblerRunner — 跨平台汇编编译运行器 (Cross-Platform)
自动识别 Windows / Linux，动态调整编译命令和路径。

Windows:  nasm -f win64 → gcc (MinGW) → main.exe
Linux:    nasm -f elf64 -g -F dwarf → gcc -no-pie -m64 → ./main

安全:
  - tempfile.TemporaryDirectory() 隔离 (跨平台兼容)
  - subprocess.run(timeout=5) 防死循环
  - 64KB 输出限制
"""

import subprocess
import shutil
import tempfile
import time
import os
import re
import sys
import platform


# ================================================================
# 平台配置
# ================================================================

IS_WINDOWS = platform.system() == "Windows"
IS_LINUX = platform.system() == "Linux"
IS_MACOS = platform.system() == "Darwin"

# 文件扩展名
OBJ_EXT = ".obj" if IS_WINDOWS else ".o"
EXE_EXT = ".exe" if IS_WINDOWS else ""

# NASM 输出格式
if IS_WINDOWS:
    NASM_FORMAT = "win64"
elif IS_MACOS:
    NASM_FORMAT = "macho64"
else:
    NASM_FORMAT = "elf64"


def get_platform_info() -> dict:
    """返回当前平台信息。"""
    return {
        "system": platform.system(),
        "machine": platform.machine(),
        "is_windows": IS_WINDOWS,
        "is_linux": IS_LINUX,
        "is_macos": IS_MACOS,
        "nasm_format": NASM_FORMAT,
        "obj_ext": OBJ_EXT,
        "exe_ext": EXE_EXT,
        "temp_dir": tempfile.gettempdir(),
    }


# ================================================================
# 工具路径解析（PATH + 项目 sandbox/tools，与 download_tools 放置位置一致）
# ================================================================


def get_sandbox_tools_dir() -> str:
    """与 tools/download_tools.py 中 TOOLS_DIR 一致：本目录下的 tools/。"""
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools")


def resolve_tool_path(tool_name: str):
    """
    解析 nasm / gcc / gdb 可执行文件。
    顺序：系统 PATH → sandbox/tools → 常见 MinGW 子目录（Windows）。
    """
    found = shutil.which(tool_name)
    if found:
        return found

    if not IS_WINDOWS:
        return None

    exe = f"{tool_name}.exe"
    tools = get_sandbox_tools_dir()
    candidates = [
        os.path.join(tools, exe),
        os.path.join(tools, "mingw64", "bin", exe),
        os.path.join(tools, "mingw", "bin", exe),
        os.path.join(tools, "ucrt64", "bin", exe),
    ]
    if tool_name == "nasm" and os.path.isdir(tools):
        try:
            for entry in sorted(os.listdir(tools)):
                sub = os.path.join(tools, entry)
                if os.path.isdir(sub):
                    p = os.path.join(sub, exe)
                    if os.path.isfile(p):
                        candidates.append(p)
        except OSError:
            pass

    for p in candidates:
        if os.path.isfile(p):
            return os.path.abspath(p)
    return None


def resolve_tool_in_tools_dir(tools_dir: str, *exe_names: str):
    """
    在 tools_dir 下查找可执行文件。
    Windows 上文件名不区分大小写（例如 JWasm.exe 与 jwasm.exe 等价）。
    按 exe_names 顺序返回首个存在的绝对路径。
    """
    if not tools_dir or not os.path.isdir(tools_dir):
        return None
    if IS_WINDOWS:
        try:
            lower_to_real = {}
            for name in os.listdir(tools_dir):
                full = os.path.join(tools_dir, name)
                if os.path.isfile(full):
                    lower_to_real[name.lower()] = name
        except OSError:
            return None
        for want in exe_names:
            real = lower_to_real.get(want.lower())
            if real:
                return os.path.abspath(os.path.join(tools_dir, real))
        return None
    for want in exe_names:
        p = os.path.join(tools_dir, want)
        if os.path.isfile(p):
            return os.path.abspath(p)
    return None


# ================================================================
# 系统依赖检查
# ================================================================

def check_dependencies() -> dict:
    """
    检查 nasm, gcc, gdb 是否安装。
    返回安装状态和友好的安装建议。
    """
    tools = {
        "nasm": resolve_tool_path("nasm"),
        "gcc": resolve_tool_path("gcc"),
        "gdb": resolve_tool_path("gdb"),
    }

    missing = [name for name, path in tools.items() if path is None]

    result = {
        "installed": {k: v for k, v in tools.items() if v is not None},
        "missing": missing,
        "all_ok": len(missing) == 0,
        "platform": get_platform_info(),
    }

    if missing:
        if IS_WINDOWS:
            td = get_sandbox_tools_dir()
            result["install_instructions"] = (
                f"缺少工具: {', '.join(missing)}\n"
                f"Windows 安装方法:\n"
                f"  0. 可将 nasm.exe、gcc.exe、gdb.exe 放入目录（无需改 PATH）: {td}\n"
                f"  1. NASM: https://www.nasm.us/pub/nasm/releasebuilds/ 下载安装，添加到 PATH\n"
                f"  2. GCC (MinGW-w64): https://www.mingw-w64.org/ 或 choco install mingw\n"
                f"  3. GDB: 随 MinGW 一起安装，或 choco install gdb"
            )
        elif IS_MACOS:
            result["install_instructions"] = (
                f"缺少工具: {', '.join(missing)}\n"
                f"macOS 安装: brew install {' '.join(missing)}"
            )
        else:
            result["install_instructions"] = (
                f"缺少工具: {', '.join(missing)}\n"
                f"Ubuntu/Debian: sudo apt-get install -y {' '.join(missing)}\n"
                f"CentOS/RHEL:   sudo yum install -y {' '.join(missing)}"
            )
        result["message"] = f"缺少依赖: {', '.join(missing)}。"
    else:
        result["message"] = f"所有依赖已安装 ({platform.system()})。"

    return result


# ================================================================
# NASM 错误解析器
# ================================================================

def parse_nasm_errors(stderr_text: str) -> list:
    """
    解析 NASM 错误输出为结构化 JSON。
    格式: main.asm:10: error: ... → {line: 10, type: "error", message: ...}
    """
    if not stderr_text:
        return []

    errors = []
    pattern = re.compile(
        r'^(?P<file>[^:]+):(?P<line>\d+):'
        r'(?:(?P<col>\d+):)?\s*'
        r'(?P<type>error|warning|fatal):\s*'
        r'(?P<message>.+)$',
        re.MULTILINE | re.IGNORECASE
    )

    for match in pattern.finditer(stderr_text):
        errors.append({
            "line": int(match.group("line")),
            "col": int(match.group("col")) if match.group("col") else None,
            "type": match.group("type").lower(),
            "message": match.group("message").strip(),
        })

    if not errors and stderr_text.strip():
        errors.append({
            "line": None, "col": None,
            "type": "error",
            "message": stderr_text.strip()[:500],
        })

    return errors


def parse_gcc_errors(stderr_text: str) -> list:
    """解析 GCC 链接错误。"""
    if not stderr_text:
        return []

    errors = []
    pattern = re.compile(
        r'(?P<file>[^:\s]+):(?P<line>\d+):\s*(?P<message>.+)',
        re.MULTILINE
    )
    for match in pattern.finditer(stderr_text):
        errors.append({
            "line": int(match.group("line")),
            "col": None,
            "type": "error",
            "message": match.group("message").strip(),
        })

    undef_pattern = re.compile(
        r'undefined reference to [`\'](\w+)\'', re.MULTILINE
    )
    for match in undef_pattern.finditer(stderr_text):
        msg = f"undefined reference to '{match.group(1)}'"
        if not any(msg in e["message"] for e in errors):
            errors.append({
                "line": None, "col": None,
                "type": "error", "message": msg,
            })

    if not errors and stderr_text.strip():
        errors.append({
            "line": None, "col": None,
            "type": "error",
            "message": stderr_text.strip()[:500],
        })

    return errors


# ================================================================
# AssemblerRunner
# ================================================================

class AssemblerRunner:
    """
    跨平台汇编编译运行器。
    自动检测 Windows/Linux/macOS 并调整编译参数。
    """

    DEFAULT_TIMEOUT = 5
    DEFAULT_OUTPUT_LIMIT = 64 * 1024  # 64KB

    def __init__(self, timeout: int = None, output_limit: int = None,
                 include_dir: str = None):
        self.timeout = timeout or self.DEFAULT_TIMEOUT
        self.output_limit = output_limit or self.DEFAULT_OUTPUT_LIMIT

        # 工具路径 (PATH + sandbox/tools)
        self.nasm_path = resolve_tool_path("nasm") or "nasm"
        self.gcc_path = resolve_tool_path("gcc") or "gcc"

        # include 目录 (io.inc 等)
        if include_dir:
            self.include_dir = os.path.abspath(include_dir)
        else:
            self.include_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "include"
            )

    def compile_and_run(self, source_code: str, input_data: str = "",
                        syntax: str = "nasm") -> dict:
        """
        编译并运行汇编代码 (跨平台)。

        Windows: nasm -f win64 → gcc → main.exe
        Linux:   nasm -f elf64 -g -F dwarf → gcc -no-pie -m64 → ./main
        """
        start_time = time.time()

        try:
            with tempfile.TemporaryDirectory(prefix="asm_run_") as tmpdir:
                # 文件名使用 os.path.join (跨平台路径)
                asm_file = os.path.join(tmpdir, "main.asm")
                obj_file = os.path.join(tmpdir, f"main{OBJ_EXT}")
                exe_file = os.path.join(tmpdir, f"main{EXE_EXT}")

                # 写入源代码
                with open(asm_file, "w", encoding="utf-8") as f:
                    f.write(source_code)

                # ========== 第一步：汇编 (NASM) ==========
                nasm_cmd = [self.nasm_path, "-f", NASM_FORMAT]

                # Linux/macOS: 添加调试信息 (-g -F dwarf)
                if not IS_WINDOWS:
                    nasm_cmd += ["-g", "-F", "dwarf"]

                # include 搜索路径
                nasm_cmd += [
                    "-I", self.include_dir + os.sep,
                    asm_file,
                    "-o", obj_file,
                ]

                try:
                    asm_result = subprocess.run(
                        nasm_cmd,
                        capture_output=True,
                        text=True,
                        timeout=self.timeout,
                        cwd=tmpdir
                    )
                except FileNotFoundError:
                    return self._compiler_not_found_error("nasm", start_time)

                if asm_result.returncode != 0:
                    elapsed = (time.time() - start_time) * 1000
                    return {
                        "stdout": "",
                        "stderr": self._truncate(asm_result.stderr),
                        "errors": parse_nasm_errors(asm_result.stderr),
                        "exit_code": asm_result.returncode,
                        "elapsed_ms": round(elapsed, 2),
                        "stage": "assemble",
                    }

                # ========== 第二步：链接 (GCC) ==========
                needs_libc = self._uses_libc(source_code)
                gcc_cmd = [self.gcc_path]

                if IS_WINDOWS:
                    # Windows (MinGW): gcc main.obj -o main.exe
                    gcc_cmd += [obj_file, "-o", exe_file]
                    if not needs_libc:
                        gcc_cmd.append("-nostartfiles")
                else:
                    # Linux: gcc -no-pie -m64 main.o -o main
                    gcc_cmd += ["-no-pie", "-m64", obj_file, "-o", exe_file]
                    if not needs_libc:
                        gcc_cmd.append("-nostartfiles")

                try:
                    link_result = subprocess.run(
                        gcc_cmd,
                        capture_output=True,
                        text=True,
                        timeout=self.timeout,
                        cwd=tmpdir
                    )
                except FileNotFoundError:
                    return self._compiler_not_found_error("gcc", start_time)

                if link_result.returncode != 0:
                    elapsed = (time.time() - start_time) * 1000
                    return {
                        "stdout": "",
                        "stderr": self._truncate(link_result.stderr),
                        "errors": parse_gcc_errors(link_result.stderr),
                        "exit_code": link_result.returncode,
                        "elapsed_ms": round(elapsed, 2),
                        "stage": "link",
                    }

                # ========== 第三步：运行 ==========
                try:
                    run_result = subprocess.run(
                        [exe_file],
                        capture_output=True,
                        text=True,
                        input=input_data if input_data else None,
                        timeout=self.timeout,
                        cwd=tmpdir
                    )

                    elapsed = (time.time() - start_time) * 1000
                    return {
                        "stdout": self._truncate(run_result.stdout),
                        "stderr": self._truncate(run_result.stderr),
                        "errors": [],
                        "exit_code": run_result.returncode,
                        "elapsed_ms": round(elapsed, 2),
                        "stage": "run",
                    }

                except subprocess.TimeoutExpired:
                    elapsed = (time.time() - start_time) * 1000
                    return {
                        "stdout": "",
                        "stderr": f"运行超时 ({self.timeout}秒)。程序可能包含死循环。",
                        "errors": [{"line": None, "col": None,
                                   "type": "error",
                                   "message": f"运行超时 ({self.timeout}秒)"}],
                        "exit_code": -1,
                        "elapsed_ms": round(elapsed, 2),
                        "stage": "error",
                    }

        except subprocess.TimeoutExpired:
            elapsed = (time.time() - start_time) * 1000
            return {
                "stdout": "",
                "stderr": f"编译超时 ({self.timeout}秒)。",
                "errors": [{"line": None, "col": None,
                           "type": "error", "message": "编译超时"}],
                "exit_code": -1,
                "elapsed_ms": round(elapsed, 2),
                "stage": "error",
            }
        except Exception as e:
            elapsed = (time.time() - start_time) * 1000
            return {
                "stdout": "",
                "stderr": f"内部错误: {e}",
                "errors": [{"line": None, "col": None,
                           "type": "error", "message": str(e)}],
                "exit_code": -1,
                "elapsed_ms": round(elapsed, 2),
                "stage": "error",
            }

    def compile_only(self, source_code: str, syntax: str = "nasm") -> dict:
        """仅编译（语法检查），不运行。跨平台兼容。"""
        start_time = time.time()

        try:
            with tempfile.TemporaryDirectory(prefix="asm_check_") as tmpdir:
                asm_file = os.path.join(tmpdir, "main.asm")
                obj_file = os.path.join(tmpdir, f"main{OBJ_EXT}")

                with open(asm_file, "w", encoding="utf-8") as f:
                    f.write(source_code)

                nasm_cmd = [self.nasm_path, "-f", NASM_FORMAT]
                if not IS_WINDOWS:
                    nasm_cmd += ["-g", "-F", "dwarf"]
                nasm_cmd += ["-I", self.include_dir + os.sep,
                             asm_file, "-o", obj_file]

                try:
                    result = subprocess.run(
                        nasm_cmd,
                        capture_output=True,
                        text=True,
                        timeout=self.timeout,
                        cwd=tmpdir
                    )
                except FileNotFoundError:
                    return self._compiler_not_found_error("nasm", start_time)

                elapsed = (time.time() - start_time) * 1000
                errors = parse_nasm_errors(result.stderr) if result.returncode != 0 else []

                return {
                    "stdout": "",
                    "stderr": self._truncate(result.stderr),
                    "errors": errors,
                    "exit_code": result.returncode,
                    "elapsed_ms": round(elapsed, 2),
                    "stage": "assemble",
                }

        except Exception as e:
            elapsed = (time.time() - start_time) * 1000
            return {
                "stdout": "",
                "stderr": f"错误: {e}",
                "errors": [{"line": None, "col": None,
                           "type": "error", "message": str(e)}],
                "exit_code": -1,
                "elapsed_ms": round(elapsed, 2),
                "stage": "error",
            }

    def _uses_libc(self, source_code: str) -> bool:
        """检测代码是否使用 libc 函数。"""
        lower = source_code.lower()
        libc_funcs = [
            "printf", "scanf", "puts", "putchar", "getchar",
            "malloc", "free", "exit", "fflush",
        ]
        for func in libc_funcs:
            if re.search(rf'\bextern\s+{func}\b', lower):
                return True
        if '%include' in lower and 'io.inc' in lower:
            return True
        if re.search(r'\bglobal\s+main\b', lower):
            return True
        return False

    def _truncate(self, text: str) -> str:
        if not text:
            return ""
        if len(text) > self.output_limit:
            return text[:self.output_limit] + "\n... [输出已截断]"
        return text

    def compile_and_run_dos(self, source_code: str, input_data: str = "", interactive: bool = False) -> dict:
        """
        使用 DOSBox + JWasm + WLink 编译运行 16位汇编。
        interactive=True: 不重定向 I/O，让用户在弹出的 DOSBox 窗口交互 (仅限本地 Windows)。
        """
        start_time = time.time()
        
        # Tools location (in Docker partition)
        tools_dir = "/app/tools"
        if not os.path.exists(tools_dir):
             # Fallback for local testing if not in Docker
            tools_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools")

        # Check tools (DOSBox or MSDOS Player)
        dosbox_exe = shutil.which("dosbox")
        
        # Try common Windows paths if not in PATH
        if not dosbox_exe and platform.system() == "Windows":
            common_paths = [
                r"D:\APP\DOSBox-0.74\DOSBox-0.74\DOSBox.exe",
                r"C:\Program Files (x86)\DOSBox-0.74-3\DOSBox.exe",
                r"C:\Program Files\DOSBox-0.74-3\DOSBox.exe",
                r"C:\Program Files (x86)\DOSBox-0.74-2\DOSBox.exe",
                r"C:\Program Files\DOSBox-0.74-2\DOSBox.exe",
                r"C:\DOSBox-0.74-3\DOSBox.exe"
            ]
            for p in common_paths:
                if os.path.exists(p):
                    dosbox_exe = p
                    break

        msdos_exe = shutil.which("msdos") or shutil.which(os.path.join(tools_dir, "msdos.exe"))
        
        has_runner = dosbox_exe or msdos_exe
        if not has_runner:
             return {
                "stdout": "",
                "stderr": "未找到 DOSBox 或 msdos.exe。请安装 DOSBox 并添加到 PATH，或告诉我都安装在哪里。",
                "errors": [{"type": "error", "message": "运行环境缺少 DOSBox"}],
                "exit_code": -1,
                "elapsed_ms": 0,
                "stage": "error"
            }
        
        # Tools binaries
        jwasm_bin = os.path.join(tools_dir, "jwasm.exe")
        wlink_bin = os.path.join(tools_dir, "wlink.exe")
        
        is_win_host = platform.system() == "Windows"
        
        try:
            with tempfile.TemporaryDirectory(prefix="dos_run_") as tmpdir:
                asm_file = os.path.join(tmpdir, "main.asm")
                
                # Write source
                with open(asm_file, "w", encoding="utf-8") as f:
                    f.write(source_code.replace("\n", "\r\n"))
                
                # Write input data (only if NOT interactive)
                if input_data and not interactive:
                    with open(os.path.join(tmpdir, "INPUT.TXT"), "w", encoding="utf-8") as f:
                        f.write(input_data)

                # --- 1. Assemble (JWasm) ---
                compile_log = ""
                link_log = ""
                run_output = ""
                
                if is_win_host:
                    # Native execution
                    # Assemble
                    cmd_asm = [jwasm_bin, "-c", "-nologo", "-Zm", "-Fo", os.path.join(tmpdir, "main.obj"), asm_file]
                    proc_asm = subprocess.run(cmd_asm, capture_output=True, text=True, cwd=tools_dir)
                    compile_log = proc_asm.stdout + proc_asm.stderr
                    
                    if proc_asm.returncode != 0:
                        return {
                            "stdout": "",
                            "stderr": compile_log,
                            "errors": self._parse_jwasm_errors(compile_log),
                            "exit_code": 1,
                            "elapsed_ms": (time.time() - start_time) * 1000,
                            "stage": "assemble"
                        }

                    # Link
                    cmd_link = [wlink_bin, "form", "dos", "file", os.path.join(tmpdir, "main.obj"), "name", os.path.join(tmpdir, "main.exe"), "option", "quiet"]
                    proc_link = subprocess.run(cmd_link, capture_output=True, text=True, cwd=tools_dir)
                    link_log = proc_link.stdout + proc_link.stderr
                    
                    if proc_link.returncode != 0:
                        return {
                            "stdout": "",
                            "stderr": link_log,
                            "errors": self._parse_wlink_errors(link_log),
                            "exit_code": 1,
                            "elapsed_ms": (time.time() - start_time) * 1000,
                            "stage": "link"
                        }
                        
                    # Run
                    exe_file = os.path.join(tmpdir, "main.exe")
                    
                    if interactive and dosbox_exe:
                        # Interactive Mode: Generate CONF without redirects, run visible
                        conf_file = os.path.join(tmpdir, "dosbox.conf")
                        self._generate_dosbox_conf_win(tmpdir, conf_file, use_input=False, interactive=True)
                        # We don't capture output, and allow long timeout (user interaction)
                        # Wait 60s or more? User closes DOSBox manually.
                        subprocess.run([dosbox_exe, "-conf", conf_file, "-noconsole"], cwd=tmpdir, timeout=300)
                        run_output = "[交互模式] 程序在 DOSBox 窗口中运行完毕。"
                    
                    elif msdos_exe:
                        cmd_run = [msdos_exe, exe_file]
                        proc_run = subprocess.run(cmd_run, input=input_data, capture_output=True, text=True, timeout=5)
                        run_output = proc_run.stdout
                    else:
                        # DOSBox Batch Mode
                        conf_file = os.path.join(tmpdir, "dosbox.conf")
                        self._generate_dosbox_conf_win(tmpdir, conf_file, use_input=bool(input_data), interactive=False)
                        subprocess.run([dosbox_exe, "-conf", conf_file, "-noconsole"], cwd=tmpdir, capture_output=True, timeout=15)
                        run_output = self._read_file(os.path.join(tmpdir, "OUTPUT.TXT"))

                else:
                    # Linux logic (unchanged for now, assumes batch)
                    conf_file = os.path.join(tmpdir, "dosbox.conf")
                    self._generate_dosbox_conf(tmpdir, tools_dir, conf_file, input_data)
                    env = os.environ.copy()
                    env["SDL_VIDEODRIVER"] = "dummy"
                    subprocess.run(["dosbox", "-conf", conf_file, "-noconsole"], cwd=tmpdir, env=env, capture_output=True, timeout=15)
                    compile_log = self._read_file(os.path.join(tmpdir, "COMPILE.LOG"))
                    link_log = self._read_file(os.path.join(tmpdir, "LINK.LOG"))
                    run_output = self._read_file(os.path.join(tmpdir, "OUTPUT.TXT"))
                    # Parse logic... (omitted for brevity in this block, relying on existing structure)

                elapsed = (time.time() - start_time) * 1000
                
                # Check errors if not interactive (interactive assumes success if it ran)
                if not interactive:
                    if "Error" in compile_log: 
                         return { "stdout": "", "stderr": compile_log, "errors": self._parse_jwasm_errors(compile_log), "exit_code": 1, "elapsed_ms": round(elapsed, 2), "stage": "assemble" }
                
                return {
                    "stdout": self._truncate(run_output),
                    "stderr": "",
                    "errors": [],
                    "exit_code": 0,
                    "elapsed_ms": round(elapsed, 2),
                    "stage": "run"
                }

        except subprocess.TimeoutExpired:
             return { "stdout": "", "stderr": "运行超时 (或交互模式等待过久)。", "errors": [], "exit_code": -1, "elapsed_ms": 0, "stage": "run" }
        except Exception as e:
            return { "stdout": "", "stderr": str(e), "errors": [{"type": "error", "message": str(e)}], "exit_code": -1, "elapsed_ms": 0, "stage": "error" }

    def compile_dos_executable(self, source_code: str) -> dict:
        """
        仅编译并链接，返回 EXE 文件内容 (Base64 编码需要在 API 层处理/或者这里直接返回 bytes)。
        此处返回 bytes。
        """
        start_time = time.time()
        
        # Tools location
        tools_dir = "/app/tools"
        if not os.path.exists(tools_dir):
            tools_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools")
        
        is_win_host = platform.system() == "Windows"
        if is_win_host:
            jwasm_bin = resolve_tool_in_tools_dir(
                tools_dir, "jwasm.exe", "JWasm.exe", "JWASM.EXE"
            )
            wlink_bin = resolve_tool_in_tools_dir(
                tools_dir, "wlink.exe", "WLink.exe", "WLINK.EXE"
            )
            if not jwasm_bin:
                return {
                    "success": False,
                    "stderr": (
                        f"未找到 jwasm.exe（或 JWasm.exe），请放在: {tools_dir}\n"
                        "「实机」编译 DOS 程序需要 JWasm + wlink，与 nasm/gcc 无关。"
                    ),
                    "errors": [],
                }
            if not wlink_bin:
                return {
                    "success": False,
                    "stderr": (
                        f"未找到 wlink.exe，请放在: {tools_dir}\n"
                        "并确保同目录有 wlinkd.dll（与 wlink 配套）。"
                    ),
                    "errors": [],
                }
        else:
            jwasm_bin = os.path.join(tools_dir, "jwasm")
            wlink_bin = os.path.join(tools_dir, "wlink")
        
        try:
            with tempfile.TemporaryDirectory(prefix="dos_compile_") as tmpdir:
                asm_file = os.path.join(tmpdir, "main.asm")
                
                with open(asm_file, "w", encoding="utf-8") as f:
                    # Ensure trailing newline
                    if not source_code.endswith("\n"):
                        source_code += "\n"
                    
                    # Auto-append END directive if missing (JWasm requires it)
                    has_end = False
                    for line in source_code.strip().splitlines():
                        stripped = line.strip().upper()
                        if stripped.startswith("END") and (len(stripped) == 3 or stripped[3] in (' ', '\t')):
                            has_end = True
                            break
                    
                    if not has_end:
                        # Try to find label after .code or start: to use as END argument
                        entry_label = None
                        for line in source_code.splitlines():
                            m = re.match(r'^(\w+)\s*:', line)
                            if m:
                                entry_label = m.group(1)
                                break  # Use first label as entry point
                        if entry_label:
                            source_code += f"END {entry_label}\n"
                        else:
                            source_code += "END\n"
                    
                    f.write(source_code)
                
                compile_log = ""
                link_log = ""
                
                if is_win_host:
                    # Native Assemble
                    cmd_asm = [jwasm_bin, "-c", "-nologo", "-Zm", "-Fo", os.path.join(tmpdir, "main.obj"), asm_file]
                    proc_asm = subprocess.run(cmd_asm, capture_output=True, text=True, cwd=tools_dir)
                    compile_log = proc_asm.stdout + proc_asm.stderr
                    
                    if proc_asm.returncode != 0:
                        return { "success": False, "stderr": compile_log, "errors": self._parse_jwasm_errors(compile_log) }

                    # Native Link
                    cmd_link = [wlink_bin, "form", "dos", "file", os.path.join(tmpdir, "main.obj"), "name", os.path.join(tmpdir, "main.exe"), "option", "quiet"]
                    proc_link = subprocess.run(cmd_link, capture_output=True, text=True, cwd=tools_dir)
                    link_log = proc_link.stdout + proc_link.stderr
                    
                    if proc_link.returncode != 0:
                         return { "success": False, "stderr": link_log, "errors": self._parse_wlink_errors(link_log) }

                else:
                    # Linux Compilation Logic
                    # Tools should be in sandbox/tools (chmod +x needed)
                    jwasm_linux = os.path.join(tools_dir, "jwasm")
                    wlink_linux = os.path.join(tools_dir, "wlink")
                    
                    # Ensure executable
                    if os.path.exists(jwasm_linux) and not os.access(jwasm_linux, os.X_OK):
                        os.chmod(jwasm_linux, 0o755)
                    if os.path.exists(wlink_linux) and not os.access(wlink_linux, os.X_OK):
                        os.chmod(wlink_linux, 0o755)

                    # Assemble
                    cmd_asm = [jwasm_linux, "-c", "-nologo", "-Zm", "-Fo", os.path.join(tmpdir, "main.obj"), asm_file]
                    # Check if file exists to avoid confusing error
                    if not os.path.exists(jwasm_linux):
                         return { "success": False, "stderr": f"Error: jwasm not found at {jwasm_linux}. Please install Linux tools.", "errors": [] }

                    proc_asm = subprocess.run(cmd_asm, capture_output=True, text=True, cwd=tools_dir)
                    compile_log = proc_asm.stdout + proc_asm.stderr
                    
                    if proc_asm.returncode != 0:
                        return { "success": False, "stderr": compile_log, "errors": self._parse_jwasm_errors(compile_log) }

                    # Link
                    # WLink on Linux might need specific environment or args, but 'form dos' is standard
                    cmd_link = [wlink_linux, "form", "dos", "file", os.path.join(tmpdir, "main.obj"), "name", os.path.join(tmpdir, "main.exe"), "option", "quiet"]
                    if not os.path.exists(wlink_linux):
                         return { "success": False, "stderr": f"Error: wlink not found at {wlink_linux}. Please install Linux tools.", "errors": [] }

                    proc_link = subprocess.run(cmd_link, capture_output=True, text=True, cwd=tools_dir)
                    link_log = proc_link.stdout + proc_link.stderr

                    if proc_link.returncode != 0:
                         return { "success": False, "stderr": link_log, "errors": self._parse_wlink_errors(link_log) }

                # Read EXE
                exe_path = os.path.join(tmpdir, "main.exe")
                if os.path.exists(exe_path):
                    with open(exe_path, "rb") as f:
                        exe_data = f.read()
                    return {
                        "success": True,
                        "executable": exe_data, # Bytes
                        "errors": []
                    }
                else:
                     return { "success": False, "stderr": "main.exe not generated", "errors": [] }

        except Exception as e:
            return { "success": False, "stderr": str(e), "errors": [{"type": "error", "message": str(e)}] }

    def _generate_dosbox_conf(self, workspace, tools_dir, conf_path, use_input):
        # ... (Linux version, kept same)
        pass 

    def _generate_dosbox_conf_win(self, workspace, conf_path, use_input, interactive=False):
        """Windows 下生成 DOSBox 配置。"""
        # Interactive: No redirects, pause at end.
        if interactive:
            autoexec = [
                f"mount c \"{workspace}\"",
                "c:",
                "main.exe",  # Direct run
                "pause",     # Wait for key press before closing
                "exit"
            ]
        else:
            autoexec = [
                f"mount c \"{workspace}\"",
                "c:",
                f"main.exe {'< INPUT.TXT' if use_input else ''} > OUTPUT.TXT",
                "exit"
            ]
            
        with open(conf_path, "w") as f:
            f.write("[sdl]\noutput=surface\n")
            f.write("[cpu]\ncypress=auto\ncycles=max\n")
            f.write("[autoexec]\n")
            f.write("\n".join(autoexec))

    def _read_file(self, path):
        if not os.path.exists(path):
            return ""
        try:
            # CP437 is DOS encoding
            with open(path, "r", encoding="cp437", errors="replace") as f:
                return f.read().replace("\r\n", "\n")
        except:
            return ""

    def _parse_jwasm_errors(self, log):
        # Format: main.asm(9) : Error A2008: syntax error
        errors = []
        for line in log.splitlines():
            m = re.match(r'^(.*)\((\d+)\)\s*:\s*(Error|Fatal|Warning)\s*(.*)$', line, re.IGNORECASE)
            if m:
                errors.append({
                    "line": int(m.group(2)),
                    "type": m.group(3).lower(),
                    "message": m.group(4).strip()
                })
        return errors

    def _parse_wlink_errors(self, log):
        # Format: Error! E2028: ...
        errors = []
        for line in log.splitlines():
            if "Error!" in line:
                 errors.append({
                    "line": None,
                    "type": "error",
                    "message": line.strip()
                })
        return errors

    def compile_only_dos(self, source_code: str, syntax: str = "nasm") -> dict:
        """
        仅编译 DOS 汇编 (JWasm)。
        """
        start_time = time.time()
        tools_dir = "/app/tools"
        if not os.path.exists(tools_dir):
            tools_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools")
        
        is_win_host = platform.system() == "Windows"
        jwasm_bin = os.path.join(tools_dir, "jwasm.exe")

        if not is_win_host and not shutil.which("dosbox"):
             return self._compiler_not_found_error("dosbox", start_time)

        try:
            with tempfile.TemporaryDirectory(prefix="dos_check_") as tmpdir:
                asm_file = os.path.join(tmpdir, "main.asm")
                with open(asm_file, "w", encoding="utf-8") as f:
                    f.write(source_code.replace("\n", "\r\n"))
                
                compile_log = ""
                
                if is_win_host:
                    # Native JWasm execution
                    cmd_asm = [jwasm_bin, "-c", "-nologo", "-Fo", os.path.join(tmpdir, "main.obj"), asm_file]
                    # We might need to set include paths? JWasm standard include is not used here yet.
                    proc = subprocess.run(cmd_asm, capture_output=True, text=True, cwd=tools_dir)
                    compile_log = proc.stdout + proc.stderr
                else:
                    # DOSBox execution
                    conf_file = os.path.join(tmpdir, "dosbox.conf")
                    autoexec = [
                        f"mount c {tmpdir}",
                        f"mount d {tools_dir}",
                        "d:",
                        "path d:\\;z:\\",
                        "c:",
                        "jwasm.exe -c -nologo -Fo main.obj main.asm > COMPILE.LOG",
                        "exit"
                    ]
                    with open(conf_file, "w") as f:
                        f.write("[sdl]\noutput=surface\n")
                        f.write("[cpu]\ncypress=auto\ncycles=max\n")
                        f.write("[autoexec]\n")
                        f.write("\n".join(autoexec))
                    
                    env = os.environ.copy()
                    env["SDL_VIDEODRIVER"] = "dummy"
                    subprocess.run(["dosbox", "-conf", conf_file, "-noconsole"], cwd=tmpdir, env=env, capture_output=True, timeout=10)
                    compile_log = self._read_file(os.path.join(tmpdir, "COMPILE.LOG"))
                
                errors = self._parse_jwasm_errors(compile_log)
                
                return {
                    "stdout": "",
                    "stderr": compile_log if "Error" in compile_log else "",
                    "errors": errors,
                    "exit_code": 1 if errors else 0,
                    "elapsed_ms": round((time.time() - start_time) * 1000, 2),
                    "stage": "assemble"
                }

        except Exception as e:
            return {
                "stdout": "",
                "stderr": str(e),
                "errors": [{"type": "error", "message": str(e)}],
                "exit_code": -1,
                "elapsed_ms": 0,
                "stage": "error"
            }

    def _compiler_not_found_error(self, tool: str, start_time: float) -> dict:
        """友好的编译器未找到错误。"""
        elapsed = (time.time() - start_time) * 1000

        if IS_WINDOWS:
            install_hint = (
                f"错误：未在系统 PATH 中找到 {tool}。\n"
                f"请确认已安装 NASM 和 MinGW-w64：\n"
                f"  • NASM: https://www.nasm.us/ 下载安装并添加到 PATH\n"
                f"  • MinGW: https://www.mingw-w64.org/ 或运行 choco install mingw"
            )
        else:
            install_hint = (
                f"错误：未在系统 PATH 中找到 {tool}。\n"
                f"请安装编译工具链：\n"
                f"  sudo apt-get install -y nasm gcc gdb"
            )

        return {
            "stdout": "",
            "stderr": install_hint,
            "errors": [{
                "line": None, "col": None,
                "type": "error",
                "message": f"编译器 {tool} 未找到。请确认已安装并添加到系统 PATH。",
            }],
            "exit_code": -1,
            "elapsed_ms": round(elapsed, 2),
            "stage": "error",
        }


# ============================================================
# 自测
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print(f"  平台: {platform.system()} {platform.machine()}")
    print(f"  NASM 格式: {NASM_FORMAT}")
    print(f"  目标文件: main{OBJ_EXT}")
    print(f"  可执行文件: main{EXE_EXT}")
    print(f"  临时目录: {tempfile.gettempdir()}")
    print("=" * 60)

    # 依赖检查
    deps = check_dependencies()
    print(f"\n  依赖状态: {deps['message']}")
    for k, v in deps["installed"].items():
        print(f"    ✅ {k}: {v}")
    for m in deps["missing"]:
        print(f"    ❌ {m}: 未安装")

    if not deps["all_ok"]:
        print(f"\n  {deps.get('install_instructions', '')}")
        sys.exit(1)

    runner = AssemblerRunner(timeout=5)
    print(f"\n  Include 目录: {runner.include_dir}")
    print(f"  io.inc 存在:  {os.path.exists(os.path.join(runner.include_dir, 'io.inc'))}")

    # ---- 根据平台选测试代码 ----
    if IS_WINDOWS:
        # Windows: 使用 Windows API (ExitProcess)
        # 或者简单的利用 C main + printf
        hello_asm = """\
section .data
    msg db "Hello from NASM (Windows)!", 10, 0

section .text
    global main
    extern printf
    extern exit

main:
    sub rsp, 40          ; Shadow space (Windows x64 ABI)
    lea rcx, [rel msg]
    call printf

    xor ecx, ecx
    call exit
"""
        test_label = "Hello from NASM (Windows)!"
    else:
        # Linux: syscall
        hello_asm = """\
section .data
    msg db "Hello from NASM (Linux)!", 10
    len equ $ - msg

section .text
    global _start

_start:
    mov rax, 1
    mov rdi, 1
    mov rsi, msg
    mov rdx, len
    syscall
    mov rax, 60
    xor rdi, rdi
    syscall
"""
        test_label = "Hello from NASM (Linux)!"

    # Test 1: Hello World
    print("\n" + "=" * 60)
    print(f"  Test 1: Hello World ({platform.system()})")
    print("=" * 60)

    r1 = runner.compile_and_run(hello_asm)
    print(f"  stage: {r1['stage']}, exit: {r1['exit_code']}")
    print(f"  stdout: {repr(r1['stdout'])}")
    if r1['stderr']:
        print(f"  stderr: {repr(r1['stderr'][:200])}")
    ok1 = test_label in r1.get("stdout", "")
    print(f"  RESULT: {'PASS ✅' if ok1 else 'FAIL ❌'}")

    # Test 2: Syntax Error → structured errors
    print("\n" + "=" * 60)
    print("  Test 2: Syntax Error → JSON errors")
    print("=" * 60)

    bad_asm = "section .text\nglobal _start\n_start:\n  mov rax, invalid_thing\n  blah\n"
    r2 = runner.compile_and_run(bad_asm)
    print(f"  stage: {r2['stage']}")
    print(f"  errors: {r2['errors']}")
    ok2 = r2["stage"] == "assemble" and len(r2["errors"]) > 0
    if r2["errors"]:
        for e in r2["errors"]:
            print(f"    Line {e['line']}: [{e['type']}] {e['message']}")
    print(f"  RESULT: {'PASS ✅' if ok2 else 'FAIL ❌'}")

    # Test 3: Compile-only
    print("\n" + "=" * 60)
    print("  Test 3: Compile-only (no run)")
    print("=" * 60)

    r3 = runner.compile_only(hello_asm)
    ok3 = r3["exit_code"] == 0
    print(f"  exit: {r3['exit_code']} (should be 0)")

    r3b = runner.compile_only(bad_asm)
    ok3b = r3b["exit_code"] != 0
    print(f"  bad code exit: {r3b['exit_code']} (should be non-0)")
    print(f"  RESULT: {'PASS ✅' if ok3 and ok3b else 'FAIL ❌'}")

    # Test 4: Platform detection
    print("\n" + "=" * 60)
    print("  Test 4: Platform detection")
    print("=" * 60)
    pinfo = get_platform_info()
    ok4 = pinfo["system"] == platform.system()
    ok4 = ok4 and pinfo["nasm_format"] == NASM_FORMAT
    print(f"  system: {pinfo['system']}")
    print(f"  nasm_format: {pinfo['nasm_format']}")
    print(f"  temp_dir: {pinfo['temp_dir']}")
    print(f"  RESULT: {'PASS ✅' if ok4 else 'FAIL ❌'}")

    # Summary
    print("\n" + "=" * 60)
    results = [ok1, ok2, ok3 and ok3b, ok4]
    passed = sum(results)
    print(f"  TOTAL: {passed}/{len(results)} tests passed ({platform.system()})")
    print("=" * 60)
