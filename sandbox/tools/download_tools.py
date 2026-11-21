"""
汇编工具下载脚本 - 支持多种下载方式
自动尝试: urllib -> powershell -> curl
"""

import os
import sys
import zipfile
import tarfile
import subprocess
import stat
import shutil

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TOOLS_DIR = SCRIPT_DIR


def run_cmd(cmd, timeout=300):
    """执行系统命令"""
    try:
        if isinstance(cmd, str):
            result = subprocess.run(
                cmd, shell=True, capture_output=True,
                text=False, timeout=timeout
            )
        else:
            result = subprocess.run(
                cmd, capture_output=True, text=False, timeout=timeout
            )
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, b"", b"timeout"
    except Exception as e:
        return False, b"", str(e).encode()


def make_exe(path):
    """确保可执行"""
    try:
        st = os.stat(path)
        os.chmod(path, st.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    except Exception:
        pass


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


# ================================================================
# 方式1: urllib 下载
# ================================================================
def download_urllib(url, dest, desc):
    if os.path.exists(dest):
        print(f"  [跳过] {desc} 已存在")
        return True
    print(f"  [urllib] 下载 {desc}...")
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        import urllib.request
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = downloaded * 100 // total
                        print(f"\r         {pct}% ({downloaded//1024}KB/{total//1024}KB)", end="", flush=True)
            print()
        return True
    except Exception as e:
        print(f"  [失败] {e}")
        if os.path.exists(dest):
            os.remove(dest)
        return False


# ================================================================
# 方式2: PowerShell 下载
# ================================================================
def download_powershell(url, dest, desc):
    if os.path.exists(dest):
        print(f"  [跳过] {desc} 已存在")
        return True
    print(f"  [PowerShell] 下载 {desc}...")
    ps = f'''
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri "{url}" -OutFile "{dest}" -TimeoutSec 300 -UseBasicParsing
    '''
    ok, _, _ = run_cmd(["powershell", "-NoProfile", "-Command", ps], timeout=330)
    return ok and os.path.exists(dest)


# ================================================================
# 方式3: curl.exe 下载（Windows 10+ 自带）
# ================================================================
def download_curl(url, dest, desc):
    if os.path.exists(dest):
        print(f"  [跳过] {desc} 已存在")
        return True
    print(f"  [curl] 下载 {desc}...")
    ok, _, _ = run_cmd(
        ["curl", "-L", "-o", dest, "--connect-timeout", "30", "--max-time", "300", url],
        timeout=330
    )
    return ok and os.path.exists(dest)


# ================================================================
# 尝试所有方式下载
# ================================================================
def download_with_fallback(url, dest, desc):
    methods = [
        ("urllib", download_urllib),
        ("PowerShell", download_powershell),
        ("curl", download_curl),
    ]
    for name, fn in methods:
        print(f"\n  尝试 {name}...")
        if fn(url, dest, desc):
            return True
    return False


# ================================================================
# 诊断已有文件
# ================================================================
def diagnose_files():
    print("\n[诊断] 检查已下载的文件...")
    files = {}
    for fname in os.listdir(TOOLS_DIR):
        fpath = os.path.join(TOOLS_DIR, fname)
        if os.path.isfile(fpath):
            size = os.path.getsize(fpath)
            # 读取文件头
            header = b""
            try:
                with open(fpath, "rb") as f:
                    header = f.read(16)
            except Exception:
                pass

            # 检测文件类型
            ftype = "unknown"
            if header.startswith(b"PK"):
                ftype = "zip"
            elif header.startswith(b"\xfd\x7a\x5c\x00") or b"7-zip" in header.lower():
                ftype = "7z"
            elif header.startswith(b"Rar!"):
                ftype = "rar"
            elif header.startswith(b"\x1f\x8b"):
                ftype = "tar.gz"
            elif header.startswith(b"<"):
                ftype = "html/redirect"
            else:
                ftype = f"raw ({header[:8].hex()})"

            files[fname] = {"path": fpath, "size": size, "type": ftype, "header": header}
            print(f"  {fname}: {size//1024}KB, 类型={ftype}")
    return files


# ================================================================
# 尝试解压各种格式
# ================================================================
def try_extract_any(zip_path):
    """尝试各种方式解压"""
    fname = os.path.basename(zip_path)
    print(f"\n  [尝试解压] {fname}")

    # 方案1: zipfile
    try:
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(TOOLS_DIR)
        print(f"  [成功] zipfile 解压")
        return True
    except Exception as e:
        print(f"  [失败] zipfile: {e}")

    # 方案2: 7z.exe / 7za.exe
    seven_exes = ["7z.exe", "7za.exe", "7z", "7za"]
    for exe in seven_exes:
        seven_zip = shutil.which(exe)
        if seven_zip:
            print(f"  [尝试] 7z: {seven_zip}")
            ok, _, err = run_cmd([seven_zip, "x", zip_path, f"-o{TOOLS_DIR}", "-y"], timeout=120)
            if ok:
                print(f"  [成功] 7z 解压")
                return True
            else:
                print(f"  [失败] 7z: {err[:200]}")
        else:
            print(f"  [未找到] {exe}")

    # 方案3: tarfile (可能是伪装成zip的tar.gz)
    try:
        import gzip
        # 可能是 tar.gz
        with gzip.open(zip_path, "rb") as gz:
            data = gz.read(8)
            if data.startswith(b"ustar"):
                print("  [尝试] tar.gz...")
                import tarfile as tf
                with tf.open(zip_path, "r:gz") as t:
                    t.extractall(TOOLS_DIR)
                print(f"  [成功] tar.gz 解压")
                return True
    except Exception as e:
        print(f"  [失败] tar.gz: {e}")

    return False


# ================================================================
# 提取可执行文件到 tools 根目录
# ================================================================
def copy_to_root(src, dest_name):
    dest = os.path.join(TOOLS_DIR, dest_name)
    if os.path.exists(dest):
        print(f"  [已有] {dest_name}")
        return True
    if os.path.exists(src):
        shutil.copy(src, dest)
        make_exe(dest)
        print(f"  [复制] {dest_name} <- {src}")
        return True
    else:
        print(f"  [未找到] {src}")
        return False


def find_and_copy(name, patterns):
    """在 TOOLS_DIR 子目录中搜索并复制"""
    for root, dirs, files in os.walk(TOOLS_DIR):
        for f in files:
            if f.lower() in [p.lower() for p in patterns]:
                src = os.path.join(root, f)
                dest = os.path.join(TOOLS_DIR, f)
                if not os.path.exists(dest):
                    shutil.copy(src, dest)
                    make_exe(dest)
                print(f"  [找到] {name}: {src}")
                return True
    return False


# ================================================================
# 验证工具
# ================================================================
def verify_tool(name, exe_name):
    paths = [
        os.path.join(TOOLS_DIR, exe_name),
        shutil.which(exe_name),
    ]
    for p in paths:
        if p and os.path.exists(p):
            try:
                result = subprocess.run([p, "--version"], capture_output=True, text=True, timeout=5)
                version = result.stdout.decode("utf-8", errors="ignore").split("\n")[0]
                print(f"  [OK] {name}: {p}")
                print(f"       {version}")
                return True
            except Exception:
                pass
    print(f"  [缺失] {name}")
    return False


# ================================================================
# 安装 7-Zip (用 winget 或 chocolatey)
# ================================================================
def install_7zip():
    print("\n[安装] 7-Zip...")
    # 尝试 winget
    ok, _, _ = run_cmd(["winget", "install", "7zip.7zip", "--accept-source-agreements", "--accept-package-agreements"], timeout=120)
    if ok:
        print("  [成功] 7-Zip 已安装")
        return True

    # 尝试 chocolatey
    ok, _, _ = run_cmd(["choco", "install", "7zip", "-y"], timeout=120)
    if ok:
        print("  [成功] 7-Zip 已安装 (Chocolatey)")
        return True

    print("  [失败] 无法自动安装 7-Zip")
    return False


# ================================================================
# 下载 NASM (从 GitHub 镜像)
# ================================================================
def download_nasm_github():
    print("\n[下载] NASM (GitHub)...")
    nasm_zip = os.path.join(TOOLS_DIR, "nasm.zip")

    # GitHub 上的 NASM Windows 版本
    # 这里用 nalexandru 的预编译版本，或者尝试其他镜像
    urls = [
        # GitHub 镜像
        "https://github.com/Aidaho12/nasm-builder/releases/download/v2.14.02/nasm-2.14.02-x64.zip",
        "https://github.com/Aidaho12/nasm-builder/releases/download/v2.15.05/nasm-2.15.05-x64.zip",
        # 备用
        "https://ci.appveyor.com/api/projects/ovh/asm-code-gen/artifacts/nasm.zip",
    ]
    for url in urls:
        print(f"  尝试: {url}")
        if download_curl(url, nasm_zip, "NASM"):
            if os.path.exists(nasm_zip):
                with open(nasm_zip, "rb") as f:
                    header = f.read(4)
                if header.startswith(b"PK"):
                    return True
                else:
                    print(f"  [失败] 文件类型不对: {header[:4].hex()}")
                    os.remove(nasm_zip)
    return False


# ================================================================
# 主流程
# ================================================================
def main():
    print("=" * 60)
    print("  汇编工具安装脚本 (Windows) - 诊断版")
    print(f"  目录: {TOOLS_DIR}")
    print("=" * 60)

    # 1. 诊断已有文件
    files = diagnose_files()

    # 2. 检查 7-Zip 状态 (按需安装)
    has_7z = any(shutil.which(x) for x in ["7z.exe", "7za.exe", "7z", "7za"])

    # 3. NASM (64-bit 汇编，可选)
    print("\n[可选] 检查 NASM (64-bit)...")
    nasm_ok = verify_tool("NASM", "nasm.exe")
    if not nasm_ok:
        print("  [提示] 未检测到 NASM。如果您只运行 16位 DOS 汇编，此工具不是必选的。")
        # 仅当显式需要或文件已存在时才尝试处理 nasm.zip
        nasm_zip = os.path.join(TOOLS_DIR, "nasm.zip")
        if os.path.exists(nasm_zip):
             print("  发现 nasm.zip，尝试解压...")
             if try_extract_any(nasm_zip):
                 find_and_copy("nasm.exe", ["nasm.exe"])
                 nasm_ok = verify_tool("NASM", "nasm.exe")

    # 4. MinGW (64-bit 链接与调试，可选)
    print("\n[可选] 检查 MinGW/GCC (64-bit)...")
    gcc_ok = verify_tool("GCC", "gcc.exe")
    gdb_ok = verify_tool("GDB", "gdb.exe")
    if not gcc_ok:
        print("  [提示] 未检测到 GCC。此工具仅在 64位模式下需要。")
        mingw_zips = [f for f in os.listdir(TOOLS_DIR) if "mingw" in f.lower() or "gcc" in f.lower()]
        for mz in mingw_zips:
            mz_path = os.path.join(TOOLS_DIR, mz)
            print(f"  发现本地压缩包: {mz}，尝试提取...")
            if try_extract_any(mz_path):
                find_and_copy("gcc.exe", ["gcc.exe"])
                find_and_copy("gdb.exe", ["gdb.exe"])
                gcc_ok = verify_tool("GCC", "gcc.exe")
                gdb_ok = verify_tool("GDB", "gdb.exe")

    # 5. DOS 16-bit 核心工具检查 (关键)
    print("\n[核心] 检查 DOS 16-bit 工具 (JWasm/WLink)...")
    jwasm_ok = os.path.exists(os.path.join(TOOLS_DIR, "JWasm.exe")) or os.path.exists(os.path.join(TOOLS_DIR, "jwasm.exe"))
    wlink_ok = os.path.exists(os.path.join(TOOLS_DIR, "wlink.exe")) or os.path.exists(os.path.join(TOOLS_DIR, "WLink.exe"))
    
    # 5. 总结
    print("\n" + "=" * 40)
    print("  环境就绪情况总结:")
    print(f"  - DOS 16位 (实机运行): {'[OK]' if (jwasm_ok and wlink_ok) else '[缺失]'}")
    print(f"  - MASM 64位 (可选): {'[OK]' if (nasm_ok and gcc_ok) else '[未就绪]'}")
    print("=" * 40)

    if jwasm_ok and wlink_ok:
        print("\n[核心就绪] 您的电脑已具备运行 16位 汇编（实机/Web Run）的全部工具。")
        print("可以直接执行: python api_endpoint.py --host 0.0.0.0 --port 5000")
    else:
        print("\n[警告] 核心 DOS 工具缺失！请确保 JWasm.exe 和 wlink.exe 位于 tools 目录。")


if __name__ == "__main__":
    main()

