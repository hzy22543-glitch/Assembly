"""
Flask API — 汇编沙盒 + 调试器
整合: 编译运行 (assembler_runner) + GDB 调试 (debug_endpoint)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from assembler_runner import AssemblerRunner, check_dependencies
from debug_endpoint import debug_bp
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# 注册调试蓝图
app.register_blueprint(debug_bp)

# 初始化运行器
runner = AssemblerRunner(
    timeout=int(os.environ.get("SANDBOX_TIMEOUT", "5")),
    output_limit=int(os.environ.get("SANDBOX_OUTPUT_LIMIT", str(64 * 1024)))
)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "asm-sandbox",
                    "mode": "direct", "features": ["run", "compile", "debug"]})


@app.route("/api/sandbox/check", methods=["GET"])
def check_deps():
    result = check_dependencies()
    status_code = 200 if result["all_ok"] else 503
    return jsonify(result), status_code



def is_dos_code(code):
    """Simple heuristic to detect 16-bit DOS code."""
    lower = code.lower()
    keywords = [".model small", ".model tiny", ".model medium", ".model large", ".model huge",
                "segment", "assume", "int 21h", "int 10h", "org 100h"]
    return any(k in lower for k in keywords)

@app.route("/api/sandbox/run", methods=["POST"])
def run_code():
    data = request.get_json(silent=True)
    if not data or "code" not in data:
        return jsonify({"stdout": "", "stderr": "缺少 code 字段",
                        "errors": [], "exit_code": -1, "elapsed_ms": 0,
                        "stage": "error"}), 400

    if not data["code"].strip():
        return jsonify({"stdout": "", "stderr": "源代码为空",
                        "errors": [], "exit_code": -1, "elapsed_ms": 0,
                        "stage": "error"}), 400

    code = data["code"]
    syntax = data.get("syntax", "nasm")
    
    # 自动识别 DOS 代码
    if is_dos_code(code):
        result = runner.compile_and_run_dos(code, data.get("input", ""), interactive=data.get("interactive", False))
    else:
        result = runner.compile_and_run(code, data.get("input", ""), syntax)
        
    return jsonify(result)


@app.route("/api/sandbox/compile", methods=["POST"])
def compile_only():
    data = request.get_json(silent=True)
    if not data or "code" not in data:
        return jsonify({"stdout": "", "stderr": "缺少 code 字段",
                        "errors": [], "exit_code": -1, "elapsed_ms": 0,
                        "stage": "error"}), 400

    code = data["code"]
    syntax = data.get("syntax", "nasm")
    
    if is_dos_code(code):
         result = runner.compile_only_dos(code, syntax)
    else:
         result = runner.compile_only(code, syntax)
         
    return jsonify(result)


@app.route("/api/sandbox/executable", methods=["POST"])
def get_executable():
    data = request.get_json(silent=True)
    if not data or "code" not in data:
        return jsonify({"success": False, "stderr": "缺少 code 字段"}), 400

    code = data["code"]
    
    # 仅支持 DOS 代码
    result = runner.compile_dos_executable(code)
    
    if result["success"]:
        import base64
        # Convert bytes to base64 string
        b64_exe = base64.b64encode(result["executable"]).decode("utf-8")
        return jsonify({
            "success": True,
            "executable": b64_exe,
            "errors": []
        })
    else:
        return jsonify(result)


if __name__ == "__main__":
    deps = check_dependencies()
    if deps["all_ok"]:
        print("[OK] All dependencies found")
        for tool, path in deps["installed"].items():
            print(f"   {tool}: {path}")
    else:
        print(f"[WARN] {deps['message']}")

    port = int(os.environ.get("SANDBOX_PORT", "5000"))
    threads = int(os.environ.get("WAITRESS_THREADS", "8"))
    print(f"\n[START] ASM Sandbox API on port {port} ({threads} threads)")
    print("   Features: compile/run + GDB MI debug")

    # Use waitress for production: multi-threaded, production-grade WSGI server
    # Falls back to Flask dev server if waitress unavailable
    try:
        from waitress import serve
        serve(app, host="0.0.0.0", port=port, threads=threads)
    except ImportError:
        print("[FALLBACK] waitress not found, using Flask dev server (single-threaded)")
        app.run(host="0.0.0.0", port=port, debug=False)
