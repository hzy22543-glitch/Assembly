"""
GDB Machine Interface (MI) Output Parser
Parses GDB MI structured output into Python dicts/lists.

GDB MI 输出格式:
  ^done,register-values=[{number="0",value="0x5"},{number="1",value="0xa"}]
  *stopped,reason="breakpoint-hit",frame={addr="0x401000",func="_start",line="10"}
  ~"GNU gdb (Ubuntu 12.1-0ubuntu1~22.04) 12.1\n"

MI Record Types:
  ^ = result record
  * = async exec record (stopped, running)
  + = async status record
  = = async notify record
  ~ = console stream (GDB's normal output, quoted C string)
  @ = target stream (target's output)
  & = log stream (GDB internal log)
"""

import re


def parse_mi_output(raw: str) -> list:
    """
    Parse multiple lines of GDB MI output.
    Returns a list of parsed records.
    """
    records = []
    for line in raw.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        record = parse_mi_line(line)
        if record:
            records.append(record)
    return records


def parse_mi_line(line: str) -> dict:
    """
    Parse a single line of GDB MI output into a dict.

    Examples:
        ^done,value="123"
        → {"record_type": "result", "class": "done", "value": "123"}

        *stopped,reason="breakpoint-hit",frame={addr="0x401000"}
        → {"record_type": "exec", "class": "stopped", "reason": "breakpoint-hit",
           "frame": {"addr": "0x401000"}}

        ~"Hello world\\n"
        → {"record_type": "console", "text": "Hello world\n"}
    """
    if not line:
        return None

    # Handle (gdb) prompt
    if line == '(gdb)' or line.startswith('(gdb)'):
        return {"record_type": "prompt"}

    # Stream records: ~ @ &
    if line[0] in '~@&':
        record_type = {
            '~': 'console',
            '@': 'target',
            '&': 'log'
        }[line[0]]
        text = _parse_c_string(line[1:])
        return {"record_type": record_type, "text": text}

    # Token prefix (optional number before ^, *, +, =)
    token = None
    idx = 0
    while idx < len(line) and line[idx].isdigit():
        idx += 1

    if idx > 0:
        token = line[:idx]
        line = line[idx:]

    if not line:
        return None

    # Result and async records
    type_char = line[0]
    record_types = {
        '^': 'result',
        '*': 'exec',
        '+': 'status',
        '=': 'notify'
    }

    if type_char not in record_types:
        # Unknown line format, return as raw
        return {"record_type": "unknown", "raw": line}

    record_type = record_types[type_char]
    rest = line[1:]

    # Parse: class,key=val,key=val,...
    # First extract the class (e.g., "done", "stopped", "running")
    comma_idx = rest.find(',')
    if comma_idx == -1:
        result_class = rest
        payload_str = ""
    else:
        result_class = rest[:comma_idx]
        payload_str = rest[comma_idx + 1:]

    result = {
        "record_type": record_type,
        "class": result_class,
    }

    if token:
        result["token"] = token

    # Parse the key=value pairs
    if payload_str:
        parsed = _parse_mi_tuple_string(payload_str)
        result.update(parsed)

    return result


def _parse_c_string(s: str) -> str:
    """Parse a C-style quoted string: "Hello\\nWorld" → Hello\nWorld"""
    s = s.strip()
    if s.startswith('"') and s.endswith('"'):
        s = s[1:-1]

    # Unescape C escapes
    s = s.replace('\\n', '\n')
    s = s.replace('\\t', '\t')
    s = s.replace('\\\\', '\\')
    s = s.replace('\\"', '"')
    return s


def _parse_mi_tuple_string(s: str) -> dict:
    """
    Parse comma-separated key=value pairs from MI output.
    Values can be strings, tuples {}, or lists [].
    
    Example: 'name="eax",value="0x5",frame={addr="0x401000",func="_start"}'
    """
    result = {}
    pos = 0
    length = len(s)

    while pos < length:
        # Skip whitespace and commas
        while pos < length and s[pos] in ' ,':
            pos += 1

        if pos >= length:
            break

        # Extract key
        key_start = pos
        while pos < length and s[pos] not in '=':
            pos += 1

        if pos >= length:
            break

        key = s[key_start:pos].strip()
        pos += 1  # skip '='

        if pos >= length:
            break

        # Parse value
        value, pos = _parse_mi_value(s, pos)
        if key:
            result[key] = value

    return result


def _parse_mi_value(s: str, pos: int):
    """
    Parse a single MI value starting at pos.
    Returns (value, new_pos).
    """
    if pos >= len(s):
        return "", pos

    ch = s[pos]

    # String value: "..."
    if ch == '"':
        return _parse_mi_string(s, pos)

    # Tuple value: {...}
    if ch == '{':
        return _parse_mi_tuple(s, pos)

    # List value: [...]
    if ch == '[':
        return _parse_mi_list(s, pos)

    # Bare value (shouldn't happen in strict MI, but handle gracefully)
    end = pos
    while end < len(s) and s[end] not in ',}]':
        end += 1
    return s[pos:end].strip(), end


def _parse_mi_string(s: str, pos: int):
    """Parse a quoted string starting at pos. Returns (str, new_pos)."""
    assert s[pos] == '"'
    pos += 1
    result = []
    while pos < len(s):
        ch = s[pos]
        if ch == '\\' and pos + 1 < len(s):
            next_ch = s[pos + 1]
            if next_ch == 'n':
                result.append('\n')
            elif next_ch == 't':
                result.append('\t')
            elif next_ch == '"':
                result.append('"')
            elif next_ch == '\\':
                result.append('\\')
            else:
                result.append(next_ch)
            pos += 2
        elif ch == '"':
            pos += 1
            break
        else:
            result.append(ch)
            pos += 1

    return ''.join(result), pos


def _parse_mi_tuple(s: str, pos: int):
    """Parse a tuple {...} starting at pos. Returns (dict, new_pos)."""
    assert s[pos] == '{'
    pos += 1
    result = {}

    while pos < len(s):
        # Skip whitespace/commas
        while pos < len(s) and s[pos] in ' ,':
            pos += 1

        if pos >= len(s) or s[pos] == '}':
            pos += 1
            break

        # Extract key
        key_start = pos
        while pos < len(s) and s[pos] != '=':
            pos += 1

        key = s[key_start:pos].strip()
        pos += 1  # skip '='

        # Parse value
        value, pos = _parse_mi_value(s, pos)
        if key:
            result[key] = value

    return result, pos


def _parse_mi_list(s: str, pos: int):
    """Parse a list [...] starting at pos. Returns (list, new_pos)."""
    assert s[pos] == '['
    pos += 1
    result = []

    while pos < len(s):
        # Skip whitespace/commas
        while pos < len(s) and s[pos] in ' ,':
            pos += 1

        if pos >= len(s) or s[pos] == ']':
            pos += 1
            break

        # Parse value
        value, pos = _parse_mi_value(s, pos)
        result.append(value)

    return result, pos


# ---- Convenience extractors ----

def extract_register_values(mi_result: dict) -> dict:
    """
    Extract register values from a -data-list-register-values response.
    
    Input: {"record_type": "result", "class": "done",
            "register-values": [{"number": "0", "value": "0x5"}, ...]}
    
    Output: {"rax": "0x5", "rbx": "0xa", ...}
    """
    # x86-64 register number -> name mapping (GDB order)
    REG_NAMES_64 = {
        "0": "rax", "1": "rbx", "2": "rcx", "3": "rdx",
        "4": "rsi", "5": "rdi", "6": "rbp", "7": "rsp",
        "8": "r8",  "9": "r9",  "10": "r10", "11": "r11",
        "12": "r12", "13": "r13", "14": "r14", "15": "r15",
        "16": "rip", "17": "eflags",
    }

    reg_values = mi_result.get("register-values", [])
    if not isinstance(reg_values, list):
        return {}

    result = {}
    for entry in reg_values:
        if isinstance(entry, dict):
            num = entry.get("number", "")
            val = entry.get("value", "0x0")
            name = REG_NAMES_64.get(num, f"reg{num}")
            result[name] = val

    return result


def extract_memory_values(mi_result: dict) -> list:
    """
    Extract memory values from a -data-read-memory-bytes response.

    Input: {"class": "done", "memory": [{"begin": "0x601000",
             "offset": "0x0", "end": "0x601010", "contents": "48656c6c6f"}]}

    Output: [{"address": "0x601000", "bytes": [0x48, 0x65, 0x6c, ...]}]
    """
    memory = mi_result.get("memory", [])
    if not isinstance(memory, list):
        return []

    result = []
    for block in memory:
        if isinstance(block, dict):
            addr = block.get("begin", block.get("addr", "0x0"))
            contents = block.get("contents", "")
            # Convert hex string to byte list
            byte_list = []
            for i in range(0, len(contents), 2):
                try:
                    byte_list.append(int(contents[i:i+2], 16))
                except ValueError:
                    byte_list.append(0)
            result.append({
                "address": addr,
                "bytes": byte_list,
            })

    return result


def extract_frame_info(mi_result: dict) -> dict:
    """
    Extract current frame info from a *stopped record.

    Output: {"addr": "0x401000", "func": "_start", "line": "10",
             "file": "main.asm", "reason": "end-stepping-range"}
    """
    frame = mi_result.get("frame", {})
    if isinstance(frame, dict):
        return {
            "addr": frame.get("addr", ""),
            "func": frame.get("func", ""),
            "line": frame.get("line", ""),
            "file": frame.get("file", frame.get("fullname", "")),
            "reason": mi_result.get("reason", ""),
        }
    return {"reason": mi_result.get("reason", "")}


# ============================================================
# 自测
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("  GDB MI Parser — Self Test")
    print("=" * 60)

    # Test 1: result record
    t1 = parse_mi_line('^done,value="123"')
    assert t1["class"] == "done"
    assert t1["value"] == "123"
    print("  Test 1 (result record):     PASS ✅")

    # Test 2: register values
    t2 = parse_mi_line(
        '^done,register-values=[{number="0",value="0x5"},'
        '{number="1",value="0xa"},{number="16",value="0x401000"}]'
    )
    regs = extract_register_values(t2)
    assert regs["rax"] == "0x5"
    assert regs["rbx"] == "0xa"
    assert regs["rip"] == "0x401000"
    print("  Test 2 (register values):   PASS ✅")

    # Test 3: stopped event with frame
    t3 = parse_mi_line(
        '*stopped,reason="end-stepping-range",'
        'frame={addr="0x401005",func="_start",'
        'args=[],file="main.asm",fullname="/tmp/main.asm",line="5"}'
    )
    frame = extract_frame_info(t3)
    assert frame["addr"] == "0x401005"
    assert frame["func"] == "_start"
    assert frame["line"] == "5"
    assert frame["reason"] == "end-stepping-range"
    print("  Test 3 (stopped frame):     PASS ✅")

    # Test 4: memory read
    t4 = parse_mi_line(
        '^done,memory=[{begin="0x601000",offset="0x00000000",'
        'end="0x601005",contents="48656c6c6f"}]'
    )
    mem = extract_memory_values(t4)
    assert mem[0]["address"] == "0x601000"
    assert mem[0]["bytes"] == [0x48, 0x65, 0x6c, 0x6c, 0x6f]  # "Hello"
    print("  Test 4 (memory read):       PASS ✅")

    # Test 5: console stream
    t5 = parse_mi_line('~"GNU gdb 12.1\\n"')
    assert t5["record_type"] == "console"
    assert "GNU gdb" in t5["text"]
    print("  Test 5 (console stream):    PASS ✅")

    # Test 6: multiline output
    multi = """^done,register-values=[{number="0",value="0x1"}]
*stopped,reason="breakpoint-hit",frame={addr="0x401000",func="_start"}
~"Breakpoint 1 at 0x401000\\n"
(gdb)"""
    records = parse_mi_output(multi)
    assert len(records) == 4
    assert records[0]["class"] == "done"
    assert records[1]["class"] == "stopped"
    assert records[2]["record_type"] == "console"
    assert records[3]["record_type"] == "prompt"
    print("  Test 6 (multiline parse):   PASS ✅")

    # Test 7: token prefix
    t7 = parse_mi_line('42^done,value="hello"')
    assert t7["token"] == "42"
    assert t7["value"] == "hello"
    print("  Test 7 (token prefix):      PASS ✅")

    print("\n  ALL TESTS: PASS ✅")
    print("=" * 60)
