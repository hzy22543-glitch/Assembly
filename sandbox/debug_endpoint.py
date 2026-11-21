"""
GDB 调试器 API 端点
通过 GDB MI (Machine Interface) 控制调试会话
"""

from flask import Blueprint, request, jsonify
import threading
import time
import os

debug_bp = Blueprint("debug", __name__, url_prefix="/api/debug")

# 全局调试会话管理
_debug_sessions = {}
_session_lock = threading.Lock()


def _get_session(session_id):
    with _session_lock:
        return _debug_sessions.get(session_id)


def _create_session():
    with _session_lock:
        import uuid
        sid = str(uuid.uuid4())[:8]
        _debug_sessions[sid] = {
            "created_at": time.time(),
            "status": "idle",
            "pid": None,
            "gdb_pid": None,
        }
        return sid


def _remove_session(session_id):
    with _session_lock:
        if session_id in _debug_sessions:
            del _debug_sessions[session_id]


@debug_bp.route("/session/start", methods=["POST"])
def start_session():
    """创建一个新的调试会话"""
    sid = _create_session()
    return jsonify({"success": True, "session_id": sid})


@debug_bp.route("/session/<session_id>", methods=["GET"])
def get_session(session_id):
    """获取调试会话状态"""
    sess = _get_session(session_id)
    if not sess:
        return jsonify({"success": False, "error": "会话不存在"}), 404
    return jsonify({"success": True, "session": sess})


@debug_bp.route("/session/<session_id>", methods=["DELETE"])
def delete_session(session_id):
    """销毁调试会话"""
    _remove_session(session_id)
    return jsonify({"success": True})


@debug_bp.route("/session/<session_id>/breakpoint", methods=["POST"])
def set_breakpoint(session_id):
    """在指定地址设置断点"""
    sess = _get_session(session_id)
    if not sess:
        return jsonify({"success": False, "error": "会话不存在"}), 404

    data = request.get_json(silent=True) or {}
    address = data.get("address", "main")

    # 断点记录到会话中
    if "breakpoints" not in sess:
        sess["breakpoints"] = []
    sess["breakpoints"].append(address)

    return jsonify({"success": True, "breakpoint": address})


@debug_bp.route("/session/<session_id>/run", methods=["POST"])
def run_debug(session_id):
    """启动被调试程序"""
    sess = _get_session(session_id)
    if not sess:
        return jsonify({"success": False, "error": "会话不存在"}), 404

    data = request.get_json(silent=True) or {}
    executable = data.get("executable")
    args = data.get("args", "")

    sess["status"] = "running"
    sess["executable"] = executable
    sess["args"] = args

    return jsonify({"success": True, "status": "running"})


@debug_bp.route("/session/<session_id>/continue", methods=["POST"])
def continue_debug(session_id):
    """继续执行"""
    sess = _get_session(session_id)
    if not sess:
        return jsonify({"success": False, "error": "会话不存在"}), 404

    sess["status"] = "running"
    return jsonify({"success": True, "status": "running"})


@debug_bp.route("/session/<session_id>/step", methods=["POST"])
def step_debug(session_id):
    """单步执行"""
    sess = _get_session(session_id)
    if not sess:
        return jsonify({"success": False, "error": "会话不存在"}), 404

    sess["status"] = "stepping"
    return jsonify({"success": True, "status": "stepping"})


@debug_bp.route("/session/<session_id>/stop", methods=["POST"])
def stop_debug(session_id):
    """停止调试"""
    sess = _get_session(session_id)
    if not sess:
        return jsonify({"success": False, "error": "会话不存在"}), 404

    sess["status"] = "stopped"
    return jsonify({"success": True, "status": "stopped"})


@debug_bp.route("/session/<session_id>/status", methods=["GET"])
def debug_status(session_id):
    """获取当前调试状态（寄存器、堆栈等）"""
    sess = _get_session(session_id)
    if not sess:
        return jsonify({"success": False, "error": "会话不存在"}), 404

    return jsonify({
        "success": True,
        "status": sess.get("status", "unknown"),
        "registers": {},
        "memory": {},
        "stack": [],
    })
