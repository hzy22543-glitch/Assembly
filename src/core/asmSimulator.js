
// 汇编模拟器核心 - 基于DOSBox/MASM架构重新设计
// 支持完整MASM语法：自定义段名、OFFSET、段寄存器、ASSUME、END START等

export const MAX_HISTORY = 20000;
const HALTED_IP = 999999;
const REGISTERS = ['ax', 'bx', 'cx', 'dx', 'sp', 'bp', 'si', 'di', 'cs', 'ds', 'ss', 'es'];

function stripComment(line) {
  return line.replace(/("[^"]*"|'[^']*')|;.*/g, (_, literal) => literal ?? '').trim();
}

// 辅助函数：获取指令解释
function getInstructionExplanation(mnemonic, operands) {
  const explanations = {
    'DB': `定义字节数据: ${operands.join(', ')}`,
    'DW': `定义字(16位)数据: ${operands.join(', ')}`,
    'DD': `定义双字(32位)数据: ${operands.join(', ')}`,
    'EQU': `定义等价符号: ${operands[0] || ''} 等于 ${operands.slice(1).join(' ') || ''}`,
    'MOV': `将 ${operands[1] || '值'} 传送到 ${operands[0] || '目标'}`,
    'LEA': `将 ${operands[1] || '源'} 的有效地址加载到 ${operands[0] || '目标'}`,
    'PUSH': `将 ${operands[0] || '值'} 压入堆栈`,
    'POP': `从堆栈弹出值到 ${operands[0] || '目标'}`,
    'ADD': `将 ${operands[1] || '值'} 加到 ${operands[0] || '目标'}`,
    'SUB': `从 ${operands[0] || '目标'} 减去 ${operands[1] || '值'}`,
    'INC': `将 ${operands[0] || '操作数'} 自增 1`,
    'DEC': `将 ${operands[0] || '操作数'} 自减 1`,
    'MUL': `无符号乘法: AX 乘以 ${operands[0] || '操作数'}`,
    'IMUL': `有符号乘法: AX 乘以 ${operands[0] || '操作数'}`,
    'DIV': `无符号除法: DX:AX 除以 ${operands[0] || '操作数'}`,
    'IDIV': `有符号除法: DX:AX 除以 ${operands[0] || '操作数'}`,
    'CMP': `比较 ${operands[0] || '操作数1'} 和 ${operands[1] || '操作数2'}`,
    'JMP': `无条件跳转到 ${operands[0] || '目标'}`,
    'JE': `若相等则跳转到 ${operands[0]}`,
    'JZ': `若为零则跳转到 ${operands[0]}`,
    'JNE': `若不相等则跳转到 ${operands[0]}`,
    'JNZ': `若不为零则跳转到 ${operands[0]}`,
    'JG': `若大于(有符号)则跳转到 ${operands[0]}`,
    'JGE': `若大于等于(有符号)则跳转到 ${operands[0]}`,
    'JL': `若小于(有符号)则跳转到 ${operands[0]}`,
    'JLE': `若小于等于(有符号)则跳转到 ${operands[0]}`,
    'JA': `若高于(无符号)则跳转到 ${operands[0]}`,
    'JB': `若低于(无符号)则跳转到 ${operands[0]}`,
    'LOOP': `循环: CX减1，若CX不为0则跳转到 ${operands[0]}`,
    'AND': `对 ${operands[0]} 和 ${operands[1]} 进行“与”运算`,
    'OR': `对 ${operands[0]} 和 ${operands[1]} 进行“或”运算`,
    'XOR': `对 ${operands[0]} 和 ${operands[1]} 进行“异或”运算`,
    'NOT': `对 ${operands[0]} 进行“非”运算`,
    'SHL': `将 ${operands[0]} 逻辑左移 ${operands[1] || '1'} 位`,
    'SHR': `将 ${operands[0]} 逻辑右移 ${operands[1] || '1'} 位`,
    'CALL': `调用子程序 ${operands[0]}`,
    'RET': `从子程序返回`,
    'INT': `调用系统中断 ${operands[0]}`,
    'NOP': '空操作'
  }
  return explanations[mnemonic.toUpperCase()] || `执行 ${mnemonic} 指令`;
}


export class AsmSimulator {
  constructor(code) {
    this.originalCode = code;
    this.dataSegment = {};       // { name: { offset, type, values } }
    this.dataSegmentSize = 0;
    this.instructions = [];
    this.labels = {};
    this.equConstants = {};      // 新增：存储 EQU 定义的常量
    this.explanations = [];
    this.stepCount = 0;
    this.entryPoint = 0;         // Entry point from END directive

    // Segment name mapping (for MOV AX, segname)
    this.segmentNames = {};      // { 'data': 0, 'stack': 0, 'codesg': 0 }

    // Track which memory addresses are non-zero (for fast snapshots)
    this._nonZeroAddrs = new Set();

    // Initialize state first
    this.state = this.createInitialState();

    // Parse the code immediately
    this.parseAssembly(code);

    // Set entry point from END directive
    if (this.entryPoint !== undefined && this.entryPoint !== null) {
      this.state.ip = this.entryPoint;
    }

    // Build _nonZeroAddrs from initial data (optimized)
    for (let i = 0; i < this.dataSegmentSize; i++) {
      if (this.state.memory[i] !== 0) this._nonZeroAddrs.add(i);
    }

    // History tracking (uses sparse memory snapshots)
    this.history = [];
    this.recordHistory(); // Record initial state
  }

  createInitialState() {
    return {
      ax: 0, bx: 0, cx: 0, dx: 0,
      sp: 0xFFFE, bp: 0, si: 0, di: 0,
      cs: 0, ds: 0, ss: 0, es: 0,  // Segment registers
      ip: 0,
      flags: { z: false, sf: false, of: false, cf: false },
      memory: new Array(65536).fill(0),
      lineNumber: 0,
      output: [],
      inputQueue: [],
      activeRegisters: [],
      activeMemory: [],
      currentInstruction: null,
      error: null
    };
  }

  setInput(text) {
    const normalized = (text || '').replace(/\r\n/g, '\n');
    this.state.inputQueue = Array.from(normalized).map((ch) => ch.charCodeAt(0));
  }

  _readInputChar() {
    if (!this.state.inputQueue) this.state.inputQueue = [];

    // Skip all CR/LF characters
    while (this.state.inputQueue.length > 0 && (this.state.inputQueue[0] === 13 || this.state.inputQueue[0] === 10)) {
      this.state.inputQueue.shift();
    }

    // Now check if there's a valid character
    if (this.state.inputQueue.length === 0) {
      return null;
    }

    const ch = this.state.inputQueue.shift();
    return ch;
  }

  _peekInputChar() {
    if (!this.state.inputQueue || this.state.inputQueue.length === 0) return null;
    // Peek at the next non-newline character
    for (let i = 0; i < this.state.inputQueue.length; i++) {
      const ch = this.state.inputQueue[i];
      if (ch !== 13 && ch !== 10) {
        return ch;
      }
    }
    return null;
  }

  _readInputLine(maxLen) {
    const chars = [];
    while (this.state.inputQueue.length > 0) {
      const ch = this.state.inputQueue.shift();
      if (ch === 10 || ch === 13) {
        if (ch === 13 && this.state.inputQueue[0] === 10) {
          this.state.inputQueue.shift();
        }
        break;
      }
      if (chars.length < maxLen) chars.push(ch);
    }
    return chars;
  }

  // Record current state to history using SPARSE memory snapshot

  recordHistory() {
    while (this.history.length >= MAX_HISTORY) {
      this.history.shift();
    }

    // Use _nonZeroAddrs for O(used) instead of O(65536) per snapshot
    const sparseMemory = {};
    for (const addr of this._nonZeroAddrs) {
      const val = this.state.memory[addr];
      if (val !== 0) {
        sparseMemory[addr] = val;
      } else {
        this._nonZeroAddrs.delete(addr); // Clean up zeroed addresses
      }
    }
    const output = this.state.output;
    const outputLength = output.length;
    const snapshot = {
      ax: this.state.ax, bx: this.state.bx, cx: this.state.cx, dx: this.state.dx,
      sp: this.state.sp, bp: this.state.bp, si: this.state.si, di: this.state.di,
      cs: this.state.cs, ds: this.state.ds, ss: this.state.ss, es: this.state.es,
      ip: this.state.ip,
      flags: { ...this.state.flags },
      sparseMemory,
      lineNumber: this.state.lineNumber,
      get output() { return output.slice(0, outputLength); },
      activeRegisters: [...this.state.activeRegisters],
      activeMemory: [...this.state.activeMemory],
      currentInstruction: this.state.currentInstruction,
      error: this.state.error
    };
    this.history.push(snapshot);
  }

  // Reconstruct a full state from a sparse snapshot
  getFullState(index) {
    if (index < 0 || index >= this.history.length) return this.createInitialState();
    const snap = this.history[index];
    const memory = new Array(65536).fill(0);
    if (snap.sparseMemory) {
      for (const [addr, val] of Object.entries(snap.sparseMemory)) {
        memory[parseInt(addr)] = val;
      }
    } else if (snap.memory) {
      for (let i = 0; i < snap.memory.length; i++) {
        memory[i] = snap.memory[i];
      }
    }
    return {
      ax: snap.ax, bx: snap.bx, cx: snap.cx, dx: snap.dx,
      sp: snap.sp, bp: snap.bp, si: snap.si, di: snap.di,
      cs: snap.cs || 0, ds: snap.ds || 0, ss: snap.ss || 0, es: snap.es || 0,
      ip: snap.ip,
      flags: { ...snap.flags },
      memory,
      lineNumber: snap.lineNumber,
      output: snap.output || [],
      activeRegisters: snap.activeRegisters || [],
      activeMemory: snap.activeMemory || [],
      currentInstruction: snap.currentInstruction,
      error: snap.error
    };
  }

  // Execute one step
  step() {
    // Check if already terminated
    if (this.state.ip >= this.instructions.length || this.state.ip === HALTED_IP) return false;
    if (this.state.error) return false;

    this.stepCount++;

    const instructionIndex = this.state.ip;
    const inst = this.instructions[instructionIndex];
    if (!inst) return false;

    this.state.activeRegisters = [];
    this.state.activeMemory = [];
    this.state.currentInstruction = inst;
    this.state.lineNumber = inst.lineNumber;

    const previousRegisters = REGISTERS.map(name => this.state[name]);

    try {
      if (this.INSTRUCTIONS[inst.mnemonic]) {
        this.INSTRUCTIONS[inst.mnemonic](this, inst.args);
      } else {
        this.state.ip++;
      }
    } catch (error) {
      console.error('Simulation error:', error);
      this.state.error = error.message;
      this.recordHistory();
      return false;
    }

    if (!Number.isInteger(this.state.ip) || this.state.ip < 0) {
      this.state.error = `执行错误: IP 变为无效值 (可能跳转到未定义的标签)`;
      this.state.ip = HALTED_IP;
    }

    this.state.activeRegisters = REGISTERS.filter((name, index) => this.state[name] !== previousRegisters[index]);
    const halted = this.state.ip === HALTED_IP;
    if (halted) this.state.ip = this.state.error ? instructionIndex : instructionIndex + 1;
    this.recordHistory();
    if (halted) this.state.ip = HALTED_IP;
    return !halted && this.state.ip < this.instructions.length;
  }

  // Run multiple steps
  run(steps = 10000) {
    for (let i = 0; i < steps; i++) {
      if (!this.step()) return false;
    }
    return true;
  }

  // Check if operand is a register
  isRegister(op) {
    if (!op) return false;
    const r = op.toLowerCase().trim();
    return ['ax', 'bx', 'cx', 'dx', 'sp', 'bp', 'si', 'di',
      'al', 'ah', 'bl', 'bh', 'cl', 'ch', 'dl', 'dh',
      'cs', 'ds', 'ss', 'es'].includes(r);
  }

  getValue(operand) {
    if (!operand) return 0;
    operand = operand.trim();

    // Strip size prefix for getValue (keep original for context)
    const cleanOp = operand.replace(/^(byte|word|dword)\s+ptr\s+/i, '').trim();

    // OFFSET directive: return the address of a variable
    if (cleanOp.toUpperCase().startsWith('OFFSET ')) {
      const varName = cleanOp.substring(7).trim().toLowerCase();
      if (this.dataSegment[varName] !== undefined) {
        return this.dataSegment[varName].offset;
      }
      return 0;
    }

    // Immediate values
    if (/^0x[0-9A-Fa-f]+$/i.test(cleanOp)) return parseInt(cleanOp, 16) & 0xFFFF;
    if (/^-?\d+$/.test(cleanOp)) return parseInt(cleanOp, 10) & 0xFFFF;
    if (/^[0-9][0-9A-Fa-f]*H$/i.test(cleanOp)) return parseInt(cleanOp.slice(0, -1), 16) & 0xFFFF;

    // Character literal
    if (cleanOp.startsWith("'") && cleanOp.endsWith("'") && cleanOp.length >= 3) {
      return cleanOp.charCodeAt(1);
    }

    // Registers (16-bit)
    const reg = cleanOp.toLowerCase();
    if (['ax', 'bx', 'cx', 'dx', 'sp', 'bp', 'si', 'di'].includes(reg)) return this.state[reg] || 0;
    // Segment registers
    if (['cs', 'ds', 'ss', 'es'].includes(reg)) return this.state[reg] || 0;
    // 8-bit registers
    if (reg === 'al') return this.state.ax & 0xFF;
    if (reg === 'ah') return (this.state.ax >> 8) & 0xFF;
    if (reg === 'bl') return this.state.bx & 0xFF;
    if (reg === 'bh') return (this.state.bx >> 8) & 0xFF;
    if (reg === 'cl') return this.state.cx & 0xFF;
    if (reg === 'ch') return (this.state.cx >> 8) & 0xFF;
    if (reg === 'dl') return this.state.dx & 0xFF;
    if (reg === 'dh') return (this.state.dx >> 8) & 0xFF;

    // Segment name as immediate value (e.g., MOV AX, data / MOV AX, stack)
    if (this.segmentNames[cleanOp.toLowerCase()] !== undefined) {
      return this.segmentNames[cleanOp.toLowerCase()];
    }

    // EQU constant (e.g., LEN in MOV CX, LEN)
    const lowerOp = cleanOp.toLowerCase();
    if (this.equConstants[lowerOp] !== undefined) {
      return this.equConstants[lowerOp];
    }

    // $ symbol: current position in data segment (returns dataSegmentSize)
    if (lowerOp === '$') {
      return this.dataSegmentSize;
    }

    // Memory access - try to resolve effective address
    const address = this.getEffectiveAddress(cleanOp);
    if (address !== null) {
      // Determine if word or byte access
      const isWordAccess = this._isWordAccess(operand, cleanOp);
      if (isWordAccess) {
        const low = this.state.memory[address] || 0;
        const high = this.state.memory[(address + 1) & 0xFFFF] || 0;
        return (high << 8) | low;
      }
      return this.state.memory[address] || 0;
    }

    return 0;
  }

  // Helper: determine if an access should be word-sized
  _isWordAccess(rawOperand, cleanOp) {
    if (/byte\s+ptr/i.test(rawOperand)) return false;
    if (/word\s+ptr/i.test(rawOperand)) return true;
    // If it's a known data variable, use its type
    const varMatch = cleanOp.match(/^(\w+)/i);
    if (varMatch) {
      const varName = varMatch[1].toLowerCase();
      if (this.dataSegment[varName]) {
        return this.dataSegment[varName].type === 'dw' || this.dataSegment[varName].type === 'dd';
      }
    }
    // Default to word for register-indirect
    return true;
  }

  getEffectiveAddress(operand) {
    if (!operand) return null;
    operand = operand.trim();

    // Strip size prefix
    operand = operand.replace(/^(byte|word|dword)\s+ptr\s+/i, '').trim();

    // Strip segment override prefix (e.g., ds:, cs:, es:, ss:)
    operand = operand.replace(/^(cs|ds|es|ss)\s*:\s*/i, '').trim();

    // Pattern 1: [reg] or [reg+disp] or [reg+reg] or [reg+reg+disp]
    let memMatch = operand.match(/^\[\s*(.+?)\s*\]$/);
    if (memMatch) {
      return this._resolveAddressExpr(memMatch[1]);
    }

    // Pattern 2: var[reg] or var[reg+disp] (MASM style, e.g., str[bx])
    memMatch = operand.match(/^(\w+)\s*\[\s*(.+?)\s*\]$/);
    if (memMatch) {
      const varName = memMatch[1].toLowerCase();
      const innerExpr = memMatch[2];
      let baseAddr = 0;
      if (this.dataSegment[varName] !== undefined) {
        baseAddr = this.dataSegment[varName].offset;
      }
      const innerAddr = this._resolveAddressExpr(innerExpr);
      if (innerAddr !== null) {
        return (baseAddr + innerAddr) & 0xFFFF;
      }
      return baseAddr;
    }

    // Pattern 3: Direct variable name (e.g., result, count)
    const lowerOp = operand.toLowerCase();
    if (this.dataSegment[lowerOp] !== undefined) {
      return this.dataSegment[lowerOp].offset;
    }

    return null;
  }

  // Resolve an address expression inside brackets
  _resolveAddressExpr(expr) {
    if (!expr) return null;
    expr = expr.trim();

    // Strip segment override inside expression  e.g. str+bx -> resolve
    expr = expr.replace(/^(cs|ds|es|ss)\s*:\s*/i, '').trim();

    let total = 0;
    // Split by + and - while keeping the sign
    const parts = expr.split(/\s*([+-])\s*/);
    let sign = 1;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;
      if (part === '+') { sign = 1; continue; }
      if (part === '-') { sign = -1; continue; }

      // Check if it's a register
      const lowerPart = part.toLowerCase();
      if (['ax', 'bx', 'cx', 'dx', 'sp', 'bp', 'si', 'di'].includes(lowerPart)) {
        total += sign * (this.state[lowerPart] || 0);
      }
      // Check if it's a hex number
      else if (/^[0-9][0-9A-Fa-f]*H$/i.test(part)) {
        total += sign * parseInt(part.slice(0, -1), 16);
      }
      else if (/^0x[0-9A-Fa-f]+$/i.test(part)) {
        total += sign * parseInt(part, 16);
      }
      // Check if it's a decimal number
      else if (/^\d+$/.test(part)) {
        total += sign * parseInt(part, 10);
      }
      // Check if it's a variable name
      else if (this.dataSegment[lowerPart] !== undefined) {
        total += sign * this.dataSegment[lowerPart].offset;
      }

      sign = 1; // Reset sign after each operand
    }

    return total & 0xFFFF;
  }

  setValue(operand, value) {
    if (!operand) return;
    const rawOperand = operand;
    operand = operand.replace(/^(byte|word|dword)\s+ptr\s+/i, '').trim().toLowerCase();
    value = value & 0xFFFF;

    // 16-bit registers
    if (['ax', 'bx', 'cx', 'dx', 'sp', 'bp', 'si', 'di'].includes(operand)) {
      this.state[operand] = value;
      return;
    }
    // Segment registers
    if (['cs', 'ds', 'ss', 'es'].includes(operand)) {
      this.state[operand] = value;
      return;
    }
    // 8-bit registers
    if (operand === 'al') { this.state.ax = (this.state.ax & 0xFF00) | (value & 0xFF); return; }
    if (operand === 'ah') { this.state.ax = (this.state.ax & 0x00FF) | ((value & 0xFF) << 8); return; }
    if (operand === 'bl') { this.state.bx = (this.state.bx & 0xFF00) | (value & 0xFF); return; }
    if (operand === 'bh') { this.state.bx = (this.state.bx & 0x00FF) | ((value & 0xFF) << 8); return; }
    if (operand === 'cl') { this.state.cx = (this.state.cx & 0xFF00) | (value & 0xFF); return; }
    if (operand === 'ch') { this.state.cx = (this.state.cx & 0x00FF) | ((value & 0xFF) << 8); return; }
    if (operand === 'dl') { this.state.dx = (this.state.dx & 0xFF00) | (value & 0xFF); return; }
    if (operand === 'dh') { this.state.dx = (this.state.dx & 0x00FF) | ((value & 0xFF) << 8); return; }

    // Memory write
    let address = this.getEffectiveAddress(operand);

    // Fallback: try original case
    if (address === null) {
      address = this.getEffectiveAddress(rawOperand);
    }

    if (address !== null) {
      const isByte = /byte\s+ptr/i.test(rawOperand);
      const isWord = /word\s+ptr/i.test(rawOperand) ||
        (this.dataSegment[operand] && (this.dataSegment[operand].type === 'dw' || this.dataSegment[operand].type === 'dd'));

      this.writeByte(address, value);
      if (!isByte && (isWord || (value > 255 && this._isWordAccess(rawOperand, operand)))) {
        this.writeByte(address + 1, value >> 8);
      }
    }
  }

  writeByte(address, value) {
    const offset = address & 0xFFFF;
    this.state.memory[offset] = value & 0xFF;
    this._nonZeroAddrs.add(offset);
    this.state.activeMemory.push(offset);
  }

  updateFlags(val1, val2, result, operation, operand, preserveCarry = false) {
    const cleanOperand = operand.trim().toLowerCase();
    const isByte = /^[abcd][lh]$/.test(cleanOperand) || !this._isWordAccess(cleanOperand, cleanOperand);
    const mask = isByte ? 0xFF : 0xFFFF;
    const sign = isByte ? 0x80 : 0x8000;
    const value = result & mask;
    const flags = this.state.flags;
    flags.z = value === 0;
    flags.sf = (value & sign) !== 0;
    if (operation === 'add') {
      if (!preserveCarry) flags.cf = ((val1 & mask) + (val2 & mask)) > mask;
      flags.of = ((val1 ^ value) & (val2 ^ value) & sign) !== 0;
    } else if (operation === 'sub') {
      if (!preserveCarry) flags.cf = (val1 & mask) < (val2 & mask);
      flags.of = ((val1 ^ val2) & (val1 ^ value) & sign) !== 0;
    } else {
      flags.cf = false;
      flags.of = false;
    }
  }

  // Safe jump: check if label exists, otherwise error
  _safeJump(label) {
    if (this.labels[label] !== undefined) {
      return this.labels[label];
    }
    // Try case-insensitive lookup
    const lowerLabel = label.toLowerCase();
    for (const [key, val] of Object.entries(this.labels)) {
      if (key.toLowerCase() === lowerLabel) return val;
    }
    this.state.error = `跳转到未定义的标签: ${label}`;
    return HALTED_IP;
  }

  // --- Instructions Definition (DOSBox-style dispatch table) ---
  INSTRUCTIONS = {
    MOV: (sim, args) => {
      const val = sim.getValue(args[1]);
      sim.setValue(args[0], val);
      sim.state.ip++;
    },
    PUSH: (sim, args) => {
      const val = sim.getValue(args[0]);
      sim.state.sp = (sim.state.sp - 2) & 0xFFFF;
      sim.state.memory[sim.state.sp] = val & 0xFF;
      sim.state.memory[(sim.state.sp + 1) & 0xFFFF] = (val >> 8) & 0xFF;
      sim._nonZeroAddrs.add(sim.state.sp);
      sim._nonZeroAddrs.add((sim.state.sp + 1) & 0xFFFF);
      sim.state.activeMemory.push(sim.state.sp, (sim.state.sp + 1) & 0xFFFF);
      sim.state.ip++;
    },
    POP: (sim, args) => {
      const low = sim.state.memory[sim.state.sp] || 0;
      const high = sim.state.memory[(sim.state.sp + 1) & 0xFFFF] || 0;
      const val = (high << 8) | low;
      sim.state.sp = (sim.state.sp + 2) & 0xFFFF;
      sim.setValue(args[0], val);
      sim.state.ip++;
    },
    LEA: (sim, args) => {
      const address = sim.getEffectiveAddress(args[1]);
      if (address !== null) {
        sim.setValue(args[0], address);
      }
      sim.state.ip++;
    },
    ADD: (sim, args) => {
      const val1 = sim.getValue(args[0]);
      const val2 = sim.getValue(args[1]);
      const result = (val1 + val2) & 0xFFFF;
      sim.setValue(args[0], result);
      sim.updateFlags(val1, val2, result, 'add', args[0]);
      sim.state.ip++;
    },
    SUB: (sim, args) => {
      const val1 = sim.getValue(args[0]);
      const val2 = sim.getValue(args[1]);
      const result = (val1 - val2) & 0xFFFF;
      sim.setValue(args[0], result);
      sim.updateFlags(val1, val2, result, 'sub', args[0]);
      sim.state.ip++;
    },
    INC: (sim, args) => {
      const val = sim.getValue(args[0]);
      const result = (val + 1) & 0xFFFF;
      sim.setValue(args[0], result);
      sim.updateFlags(val, 1, result, 'add', args[0], true);
      sim.state.ip++;
    },
    DEC: (sim, args) => {
      const val = sim.getValue(args[0]);
      const result = (val - 1) & 0xFFFF;
      sim.setValue(args[0], result);
      sim.updateFlags(val, 1, result, 'sub', args[0], true);
      sim.state.ip++;
    },
    MUL: (sim, args) => {
      const val = sim.getValue(args[0]);
      const result = (sim.state.ax & 0xFFFF) * (val & 0xFFFF);
      sim.state.ax = result & 0xFFFF;
      sim.state.dx = (result >> 16) & 0xFFFF;
      const overflow = sim.state.dx !== 0;
      sim.state.flags.cf = overflow;
      sim.state.flags.of = overflow;
      sim.state.ip++;
    },
    IMUL: (sim, args) => {
      // Signed multiply
      let val = sim.getValue(args[0]);
      let ax = sim.state.ax;
      // Sign extend to 32-bit
      if (val & 0x8000) val = val | 0xFFFF0000;
      if (ax & 0x8000) ax = ax | 0xFFFF0000;
      const result = ax * val;
      sim.state.ax = result & 0xFFFF;
      sim.state.dx = (result >> 16) & 0xFFFF;
      sim.state.ip++;
    },
    DIV: (sim, args) => {
      const op = args[0].toLowerCase().trim();
      const is8Bit = ['al', 'ah', 'bl', 'bh', 'cl', 'ch', 'dl', 'dh'].includes(op) || /byte\s+ptr/i.test(args[0]);
      const val = sim.getValue(args[0]);
      if (val === 0) throw new Error('Divide by zero');

      if (is8Bit) {
        const dividend = sim.state.ax & 0xFFFF;
        const quotient = Math.floor(dividend / (val & 0xFF)) & 0xFF;
        const remainder = (dividend % (val & 0xFF)) & 0xFF;
        sim.state.ax = (remainder << 8) | quotient; // AH = remainder, AL = quotient
      } else {
        const dividend = ((sim.state.dx & 0xFFFF) << 16) | (sim.state.ax & 0xFFFF);
        sim.state.ax = Math.floor(dividend / (val & 0xFFFF)) & 0xFFFF;
        sim.state.dx = (dividend % (val & 0xFFFF)) & 0xFFFF;
      }
      sim.state.ip++;
    },
    IDIV: (sim, args) => {
      const op = args[0].toLowerCase().trim();
      const is8Bit = ['al', 'ah', 'bl', 'bh', 'cl', 'ch', 'dl', 'dh'].includes(op) || /byte\s+ptr/i.test(args[0]);
      let val = sim.getValue(args[0]);
      if (val === 0) throw new Error('Divide by zero');

      if (is8Bit) {
        if (val & 0x80) val = val - 0x100;
        let dividend = sim.state.ax & 0xFFFF;
        if (dividend & 0x8000) dividend = dividend - 0x10000;

        const quotient = Math.trunc(dividend / val);
        const remainder = dividend % val;
        sim.state.ax = ((remainder & 0xFF) << 8) | (quotient & 0xFF);
      } else {
        if (val & 0x8000) val = val - 0x10000;
        let dividend = ((sim.state.dx & 0xFFFF) << 16) | (sim.state.ax & 0xFFFF);
        if (dividend & 0x80000000) dividend = dividend - 0x100000000;

        const quotient = Math.trunc(dividend / val);
        const remainder = dividend % val;
        sim.state.ax = quotient & 0xFFFF;
        sim.state.dx = remainder & 0xFFFF;
      }
      sim.state.ip++;
    },
    AND: (sim, args) => {
      const val1 = sim.getValue(args[0]);
      const val2 = sim.getValue(args[1]);
      const result = val1 & val2;
      sim.setValue(args[0], result);
      sim.updateFlags(val1, val2, result, 'logic', args[0]);
      sim.state.ip++;
    },
    OR: (sim, args) => {
      const val1 = sim.getValue(args[0]);
      const val2 = sim.getValue(args[1]);
      const result = val1 | val2;
      sim.setValue(args[0], result);
      sim.updateFlags(val1, val2, result, 'logic', args[0]);
      sim.state.ip++;
    },
    XOR: (sim, args) => {
      const val1 = sim.getValue(args[0]);
      const val2 = sim.getValue(args[1]);
      const result = val1 ^ val2;
      sim.setValue(args[0], result);
      sim.updateFlags(val1, val2, result, 'logic', args[0]);
      sim.state.ip++;
    },
    NOT: (sim, args) => {
      const val = sim.getValue(args[0]);
      const result = (~val) & 0xFFFF;
      sim.setValue(args[0], result);
      sim.state.ip++;
    },
    TEST: (sim, args) => {
      // AND but only sets flags, doesn't store result
      const val1 = sim.getValue(args[0]);
      const val2 = sim.getValue(args[1]);
      const result = val1 & val2;
      sim.updateFlags(val1, val2, result, 'logic', args[0]);
      sim.state.ip++;
    },
    CMP: (sim, args) => {
      const val1 = sim.getValue(args[0]);
      const val2 = sim.getValue(args[1]);
      const result = (val1 - val2) & 0xFFFF;
      sim.updateFlags(val1, val2, result, 'sub', args[0]);
      sim.state.ip++;
    },
    NEG: (sim, args) => {
      const val = sim.getValue(args[0]);
      const result = ((~val + 1) & 0xFFFF);
      sim.setValue(args[0], result);
      sim.updateFlags(0, val, result, 'sub', args[0]);
      sim.state.ip++;
    },
    NOP: (sim) => { sim.state.ip++; },

    // Shift/Rotate
    SHL: (sim, args) => {
      const val = sim.getValue(args[0]);
      const count = args[1] ? sim.getValue(args[1]) : 1;
      const result = (val << count) & 0xFFFF;
      sim.setValue(args[0], result);
      sim.state.flags.cf = ((val >> (16 - count)) & 1) === 1;
      sim.state.flags.z = result === 0;
      sim.state.flags.sf = (result & 0x8000) !== 0;
      sim.state.ip++;
    },
    SHR: (sim, args) => {
      const val = sim.getValue(args[0]);
      const count = args[1] ? sim.getValue(args[1]) : 1;
      const result = (val >>> count) & 0xFFFF;
      sim.setValue(args[0], result);
      sim.state.flags.cf = ((val >> (count - 1)) & 1) === 1;
      sim.state.flags.z = result === 0;
      sim.state.flags.sf = (result & 0x8000) !== 0;
      sim.state.ip++;
    },
    SAL: (sim, args) => { sim.INSTRUCTIONS.SHL(sim, args); },
    SAR: (sim, args) => {
      const val = sim.getValue(args[0]);
      const signedVal = (val & 0x8000) ? (val | 0xFFFF0000) : val;
      const count = args[1] ? sim.getValue(args[1]) : 1;
      const result = (signedVal >> count) & 0xFFFF;
      sim.setValue(args[0], result);
      sim.state.flags.z = result === 0;
      sim.state.flags.sf = (result & 0x8000) !== 0;
      sim.state.ip++;
    },
    ROL: (sim, args) => {
      const val = sim.getValue(args[0]);
      const count = (args[1] ? sim.getValue(args[1]) : 1) % 16;
      const result = ((val << count) | (val >>> (16 - count))) & 0xFFFF;
      sim.setValue(args[0], result);
      sim.state.flags.cf = (result & 1) !== 0;
      sim.state.ip++;
    },
    ROR: (sim, args) => {
      const val = sim.getValue(args[0]);
      const count = (args[1] ? sim.getValue(args[1]) : 1) % 16;
      const result = ((val >>> count) | (val << (16 - count))) & 0xFFFF;
      sim.setValue(args[0], result);
      sim.state.flags.cf = (result & 0x8000) !== 0;
      sim.state.ip++;
    },
    XCHG: (sim, args) => {
      const val1 = sim.getValue(args[0]);
      const val2 = sim.getValue(args[1]);
      sim.setValue(args[0], val2);
      sim.setValue(args[1], val1);
      sim.state.ip++;
    },

    // Flag manipulation
    CLC: (sim) => { sim.state.flags.cf = false; sim.state.ip++; },
    STC: (sim) => { sim.state.flags.cf = true; sim.state.ip++; },
    CMC: (sim) => { sim.state.flags.cf = !sim.state.flags.cf; sim.state.ip++; },
    CLD: (sim) => { sim.state.ip++; }, // Direction flag (simplified)
    STD: (sim) => { sim.state.ip++; },

    // Sign extension
    CBW: (sim) => {
      // Extend AL sign to AH
      if (sim.state.ax & 0x80) {
        sim.state.ax = sim.state.ax | 0xFF00;
      } else {
        sim.state.ax = sim.state.ax & 0x00FF;
      }
      sim.state.ip++;
    },
    CWD: (sim) => {
      // Extend AX sign to DX
      if (sim.state.ax & 0x8000) {
        sim.state.dx = 0xFFFF;
      } else {
        sim.state.dx = 0;
      }
      sim.state.ip++;
    },

    // Jumps (all with safe label lookup)
    JMP: (sim, args) => { sim.state.ip = sim._safeJump(args[0]); },
    JE: (sim, args) => { sim.state.ip = sim.state.flags.z ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JZ: (sim, args) => { sim.state.ip = sim.state.flags.z ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JNE: (sim, args) => { sim.state.ip = !sim.state.flags.z ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JNZ: (sim, args) => { sim.state.ip = !sim.state.flags.z ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JG: (sim, args) => { sim.state.ip = (!sim.state.flags.z && sim.state.flags.sf === sim.state.flags.of) ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JGE: (sim, args) => { sim.state.ip = (sim.state.flags.sf === sim.state.flags.of) ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JL: (sim, args) => { sim.state.ip = (sim.state.flags.sf !== sim.state.flags.of) ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JLE: (sim, args) => { sim.state.ip = (sim.state.flags.z || sim.state.flags.sf !== sim.state.flags.of) ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JA: (sim, args) => { sim.state.ip = (!sim.state.flags.cf && !sim.state.flags.z) ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JAE: (sim, args) => { sim.state.ip = !sim.state.flags.cf ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JB: (sim, args) => { sim.state.ip = sim.state.flags.cf ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JBE: (sim, args) => { sim.state.ip = (sim.state.flags.cf || sim.state.flags.z) ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JC: (sim, args) => { sim.state.ip = sim.state.flags.cf ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JNC: (sim, args) => { sim.state.ip = !sim.state.flags.cf ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JS: (sim, args) => { sim.state.ip = sim.state.flags.sf ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JNS: (sim, args) => { sim.state.ip = !sim.state.flags.sf ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JO: (sim, args) => { sim.state.ip = sim.state.flags.of ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    JNO: (sim, args) => { sim.state.ip = !sim.state.flags.of ? sim._safeJump(args[0]) : sim.state.ip + 1; },
    LOOP: (sim, args) => {
      sim.state.cx = (sim.state.cx - 1) & 0xFFFF;
      if (sim.state.cx !== 0) sim.state.ip = sim._safeJump(args[0]);
      else sim.state.ip++;
    },
    LOOPE: (sim, args) => {
      sim.state.cx = (sim.state.cx - 1) & 0xFFFF;
      if (sim.state.cx !== 0 && sim.state.flags.z) sim.state.ip = sim._safeJump(args[0]);
      else sim.state.ip++;
    },
    LOOPNE: (sim, args) => {
      sim.state.cx = (sim.state.cx - 1) & 0xFFFF;
      if (sim.state.cx !== 0 && !sim.state.flags.z) sim.state.ip = sim._safeJump(args[0]);
      else sim.state.ip++;
    },
    CALL: (sim, args) => {
      sim.state.sp = (sim.state.sp - 2) & 0xFFFF;
      const retAddr = sim.state.ip + 1;
      sim.state.memory[sim.state.sp] = retAddr & 0xFF;
      sim.state.memory[(sim.state.sp + 1) & 0xFFFF] = (retAddr >> 8) & 0xFF;
      sim._nonZeroAddrs.add(sim.state.sp);
      sim._nonZeroAddrs.add((sim.state.sp + 1) & 0xFFFF);
      sim.state.activeMemory.push(sim.state.sp, (sim.state.sp + 1) & 0xFFFF);
      sim.state.ip = sim._safeJump(args[0]);
    },
    RET: (sim) => {
      const low = sim.state.memory[sim.state.sp] || 0;
      const high = sim.state.memory[(sim.state.sp + 1) & 0xFFFF] || 0;
      sim.state.sp = (sim.state.sp + 2) & 0xFFFF;
      sim.state.ip = (high << 8) | low;
    },

    // Interrupts
    INT: (sim, args) => {
      const intNum = sim.getValue(args[0]);
      if (intNum === 0x21) {
        const ah = (sim.state.ax >> 8) & 0xFF;
        if (ah === 0x4C) {
          sim.state.ip = HALTED_IP;
          return;
        }
        if (ah === 0x09) {
          const dx = sim.state.dx;
          let output = '';
          let addr = dx;
          let maxChars = 0;
          while (maxChars < 1000) {
            const charCode = sim.state.memory[addr];
            if (charCode === 36 || charCode === 0) break; // '$' or null
            output += String.fromCharCode(charCode);
            addr = (addr + 1) & 0xFFFF;
            maxChars++;
          }
          sim.state.output.push(output);
          sim.state.ax = (sim.state.ax & 0xFF00) | 0x24; // DOS 2.1+ sets AL to '$' (0x24)
        }
        if (ah === 0x02) {
          const dl = sim.state.dx & 0xFF;
          sim.state.output.push(String.fromCharCode(dl));
          sim.state.ax = (sim.state.ax & 0xFF00) | dl; // DOS sets AL to the character output
        }
        if (ah === 0x01) {
          const ch = sim._readInputChar();
          if (ch === null || ch === undefined) {
            sim.state.error = '运行需要输入，但输入已耗尽';
            sim.state.ip = HALTED_IP;
            return;
          }
          sim.state.ax = (sim.state.ax & 0xFF00) | (ch & 0xFF);
        }
        if (ah === 0x07) {
          // INT 21h AH=07: 无回显字符输入（不等待回车）
          const ch = sim._readInputChar();
          if (ch === null) {
            sim.state.error = '运行需要输入，但输入已耗尽';
            sim.state.ip = HALTED_IP;
            return;
          }
          sim.state.ax = (sim.state.ax & 0xFF00) | (ch & 0xFF);
        }
        if (ah === 0x08) {
          // INT 21h AH=08: 无回显字符输入（等待回车），与 AH=01 行为相同
          const ch = sim._readInputChar();
          if (ch === null) {
            sim.state.error = '运行需要输入，但输入已耗尽';
            sim.state.ip = HALTED_IP;
            return;
          }
          sim.state.ax = (sim.state.ax & 0xFF00) | (ch & 0xFF);
        }
        if (ah === 0x0A) {
          const dx = sim.state.dx & 0xFFFF;
          const maxLen = sim.state.memory[dx] || 0;
          if (maxLen > 0 && sim.state.inputQueue.length === 0) {
            sim.state.error = '运行需要输入，但输入已耗尽';
            sim.state.ip = HALTED_IP;
            return;
          }
          if (maxLen > 0) {
            const chars = sim._readInputLine(maxLen - 1);
            sim.writeByte(dx + 1, chars.length);
            for (let i = 0; i < chars.length; i++) {
              sim.writeByte(dx + 2 + i, chars[i]);
            }
            sim.writeByte(dx + 2 + chars.length, 13);
          }
        }
        if (ah === 0x0B) {
          // INT 21h AH=0B: 检查标准输入状态
          // AL=FFh 有字符可用，AL=00h 无字符
          if (sim.state.inputQueue && sim.state.inputQueue.length > 0) {
            sim.state.ax = (sim.state.ax & 0xFF00) | 0xFF;
          } else {
            sim.state.ax = (sim.state.ax & 0xFF00) | 0x00;
          }
        }
      }
      sim.state.ip++;
    },
    HLT: (sim) => {
      sim.state.ip = HALTED_IP;
    }
  };

  // --- Parser (MASM-compatible) ---
  parseAssembly(code) {
    // 强制防呆：剔除全部意外混入的 Markdown 代码块残余标签
    const cleanCode = code.replace(/```[a-zA-Z]*\r?\n?/g, '').replace(/```\r?\n?/g, '');
    const lines = cleanCode.split('\n');
    let lineIndex = 0;

    // Track segments
    const segments = {};        // { name: { type: 'data'|'code'|'stack', lines: [] } }
    let currentSegment = null;
    let dataSegmentNames = [];
    let codeSegmentNames = [];
    let stackSegmentNames = [];

    // Pass 0: Identify all segments and their types
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) return;

      // Handle inline comments
      const codePart = stripComment(trimmed);
      if (!codePart) return;

      // Check for ASSUME directive to identify segment types
      const assumeMatch = codePart.match(/^assume\s+(.+)$/i);
      if (assumeMatch) {
        const parts = assumeMatch[1].split(',').map(p => p.trim());
        parts.forEach(part => {
          const m = part.match(/^(cs|ds|ss|es)\s*:\s*(\w+)$/i);
          if (m) {
            const segReg = m[1].toLowerCase();
            const segName = m[2].toLowerCase();
            if (segReg === 'cs') codeSegmentNames.push(segName);
            if (segReg === 'ds') dataSegmentNames.push(segName);
            if (segReg === 'ss') stackSegmentNames.push(segName);
          }
        });
        return;
      }

      // Check for segment definition
      const segMatch = codePart.match(/^(\w+)\s+segment\s*$/i);
      if (segMatch) {
        const name = segMatch[1].toLowerCase();
        // Determine segment type from name or ASSUME
        let type = 'code'; // default
        if (name === 'data' || name.includes('data') || dataSegmentNames.includes(name)) type = 'data';
        else if (name === 'stack' || name.includes('stack') || stackSegmentNames.includes(name)) type = 'stack';
        else if (codeSegmentNames.includes(name)) type = 'code';

        segments[name] = { type, startLine: idx };
        this.segmentNames[name] = 0; // Pseudo-value for MOV AX, segname
        return;
      }
    });

    // If no segments identified via ASSUME, try to detect by name
    if (dataSegmentNames.length === 0) {
      for (const [name, seg] of Object.entries(segments)) {
        if (name === 'data' || name.includes('data')) {
          dataSegmentNames.push(name);
          seg.type = 'data';
        }
      }
    }
    if (stackSegmentNames.length === 0) {
      for (const [name, seg] of Object.entries(segments)) {
        if (name === 'stack' || name.includes('stack')) {
          stackSegmentNames.push(name);
          seg.type = 'stack';
        }
      }
    }

    // Pass 1: Parse data segments
    let inDataSegment = false;
    let inStackSegment = false;

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) return;
      const codePart = stripComment(trimmed);
      if (!codePart) return;
      const lower = codePart.toLowerCase();

      // Handle .DATA directive (MASM style)
      if (lower === '.data' || lower === 'data') {
        inDataSegment = true;
        inStackSegment = false;
        return;
      }
      // Handle .CODE directive
      if (lower === '.code' || lower === 'code') {
        inDataSegment = false;
        inStackSegment = false;
        return;
      }
      // Handle .STACK directive
      if (lower.startsWith('.stack') || lower === 'stack') {
        inStackSegment = true;
        inDataSegment = false;
        return;
      }

      // Segment start/end detection
      const segStartMatch = codePart.match(/^(\w+)\s+segment\s*$/i);
      if (segStartMatch) {
        const name = segStartMatch[1].toLowerCase();
        if (segments[name]?.type === 'data' || name === 'data' || name.includes('data') || dataSegmentNames.includes(name)) {
          inDataSegment = true;
          inStackSegment = false;
        } else if (segments[name]?.type === 'stack' || name === 'stack' || name.includes('stack') || stackSegmentNames.includes(name)) {
          inStackSegment = true;
          inDataSegment = false;
        } else {
          inDataSegment = false;
          inStackSegment = false;
        }
        return;
      }

      const segEndMatch = codePart.match(/^(\w+)\s+ends\s*$/i);
      if (segEndMatch) {
        inDataSegment = false;
        inStackSegment = false;
        return;
      }

      if (inDataSegment || inStackSegment) {
        this._currentParsingLine = idx + 1;
        this._parseDataLine(codePart);
      }
    });

    // Evaluate all EQU expressions after data segment parsing is complete
    if (this._equExpressions) {
      for (const equ of this._equExpressions) {
        const value = this._evaluateEquExpressionWithPosition(equ.expr, equ.dollarPosition);
        this.equConstants[equ.name] = value;
        // Update explanation
        const expIdx = this.explanations.findIndex(
          e => e.text.includes(`EQU 常量: ${equ.name}`)
        );
        if (expIdx >= 0) {
          this.explanations[expIdx].text = `EQU 常量: ${equ.name} = ${value}`;
        }
      }
    }

    // Pass 2: Parse code segments - labels and instructions
    let inCodeSegment = false;
    let hasAnySegment = Object.keys(segments).length > 0;
    if (!hasAnySegment) inCodeSegment = true; // No segments = treat everything as code

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) return;

      // Strip inline comment
      const codePart = stripComment(trimmed);
      if (!codePart) return;

      const lower = codePart.toLowerCase();

      // Skip directives
      if (lower.match(/^assume\s/i)) return;
      if (lower.match(/^end\s+(\w+)\s*$/i)) {
        // END directive - set entry point
        const entryMatch = lower.match(/^end\s+(\w+)\s*$/i);
        if (entryMatch) {
          this._pendingEntryLabel = entryMatch[1];
        }
        return;
      }
      if (lower === 'end') return;

      // Segment start/end
      const segStartMatch = codePart.match(/^(\w+)\s+segment\s*$/i);
      if (segStartMatch) {
        const name = segStartMatch[1].toLowerCase();
        const seg = segments[name];
        if (seg && (seg.type === 'code' || (!dataSegmentNames.includes(name) && !stackSegmentNames.includes(name) && name !== 'data' && !name.includes('data') && name !== 'stack' && !name.includes('stack')))) {
          inCodeSegment = true;
        } else {
          inCodeSegment = false;
        }
        return;
      }

      const segEndMatch = codePart.match(/^(\w+)\s+ends\s*$/i);
      if (segEndMatch) {
        inCodeSegment = false;
        return;
      }

      // Skip non-code segment lines
      if (!inCodeSegment) return;

      // Skip remaining directives
      if (lower.match(/^\w+\s+segment/i)) return;
      if (lower.match(/^\w+\s+ends/i)) return;
      if (lower.match(/^(model|\.model|\.data|\.code|\.stack)/i)) return;
      // Skip EQU constants in code segment (already parsed in data segment)
      if (lower.match(/^\w+\s+equ\s+/i)) return;
      // Skip data definitions in code segment (shouldn't happen, but safety check)
      if (lower.match(/^\w+\s+(dw|db|dd)\s+/i)) return;
      // Skip PROC/ENDP directives
      if (lower.match(/^\w+\s+proc\s*(near|far)?$/i)) {
        // Extract procedure name as a label
        const procMatch = codePart.match(/^(\w+)\s+proc/i);
        if (procMatch) {
          this.labels[procMatch[1]] = lineIndex;
          this.explanations.push({
            line: idx + 1,
            text: `过程开始: ${procMatch[1]}`,
            type: 'label'
          });
        }
        return;
      }
      if (lower === 'endp') return;

      // Labels
      const labelMatch = codePart.match(/^(\w+)\s*:/);
      let instructionText = codePart;
      if (labelMatch) {
        this.labels[labelMatch[1]] = lineIndex;
        instructionText = codePart.substring(labelMatch[0].length).trim();
        this.explanations.push({
          line: idx + 1,
          text: `标签: ${labelMatch[1]}`,
          type: 'label'
        });
        if (!instructionText) return;
      }

      if (!instructionText || instructionText.trim() === '') return;

      // Parse instruction - smart split handling commas inside brackets
      const mnemonic = instructionText.split(/[\s,]+/)[0].toUpperCase();

      // Skip data definitions in code segment
      if (['DB', 'DW', 'DD', 'DQ', 'DT'].includes(mnemonic)) return;

      // Get the rest as args, split by comma but respect brackets
      const argsText = instructionText.substring(mnemonic.length).trim();
      const args = this._splitArgs(argsText);

      this.instructions.push({
        mnemonic,
        args,
        lineNumber: idx + 1,
        originalLine: line
      });

      const explanation = getInstructionExplanation(mnemonic, args);
      this.explanations.push({
        line: idx + 1,
        text: `${explanation} ( ${mnemonic} ${args.join(', ')} )`,
        type: 'instruction'
      });

      lineIndex++;
    });

    // Resolve entry point
    if (this._pendingEntryLabel) {
      const entryLabel = this._pendingEntryLabel;
      if (this.labels[entryLabel] !== undefined) {
        this.entryPoint = this.labels[entryLabel];
      } else {
        // Case-insensitive search
        for (const [key, val] of Object.entries(this.labels)) {
          if (key.toLowerCase() === entryLabel.toLowerCase()) {
            this.entryPoint = val;
            break;
          }
        }
      }
      delete this._pendingEntryLabel;
    }
  }

  // Split args respecting brackets, e.g. "BYTE PTR [SI], '-'" → ["BYTE PTR [SI]", "'-'"]
  _splitArgs(text) {
    if (!text || !text.trim()) return [];
    const args = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '[') depth++;
      if (ch === ']') depth--;
      if (ch === ',' && depth === 0) {
        if (current.trim()) args.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) args.push(current.trim());
    return args;
  }

  // Parse a single data definition line
  _parseDataLine(codePart) {
    // Check for EQU constant first (e.g., "LEN EQU 11" or "LEN EQU ($-ARRAY)/2")
    const equMatch = codePart.match(/^(\w+)\s+EQU\s+(.+)$/i);
    if (equMatch) {
      const name = equMatch[1].toLowerCase();
      const expr = equMatch[2].trim();
      // Store EQU expression with current dataSegmentSize (position of $)
      this._equExpressions = this._equExpressions || [];
      this._equExpressions.push({
        name,
        expr,
        dollarPosition: this.dataSegmentSize  // $ evaluates to this position
      });
      this.explanations.push({
        line: this._currentParsingLine || 0,
        text: `EQU 常量: ${name} = (待计算)`,
        type: 'instruction'
      });
      return;
    }

    const match = codePart.match(/^(\w+)\s+(dw|db|dd)\s+(.+?)$/i);
    if (!match) {
      // Check if this line contains DB/DW/DD as part of it
      if (/^\w+\s+(dw|db|dd)\s+/i.test(codePart)) {
        // This is still a data line, try to parse it differently
        const simpleMatch = codePart.match(/^(\w+)\s+(dw|db|dd)\s+(.+)$/i);
        if (simpleMatch) {
          this._parseDataLineSimple(simpleMatch[1], simpleMatch[2], simpleMatch[3]);
        }
      }
      return;
    }

    this._parseDataLineSimple(match[1], match[2], match[3]);
  }

  // Parse a single data definition with type
  _parseDataLineSimple(name, type, valuePart) {
    const lowerType = type.toLowerCase();
    const lowerName = name.toLowerCase();

    // Don't re-parse if this name is a segment directive keyword
    if (['segment', 'ends', 'assume', 'end'].includes(lowerName)) return;

    const operands = valuePart.split(/[\s,]+/).filter(p => p);

    // 记录数据定义的解析
    const explanation = getInstructionExplanation(type, operands);
    this.explanations.push({
      line: this._currentParsingLine || 0,
      text: `${explanation} ( ${name} ${type.toUpperCase()} ${valuePart} )`,
      type: 'instruction'
    });

    let values = [];
    const parts = this._splitDataValues(valuePart);

    parts.forEach(part => {
      part = part.trim();
      if (!part) return;

      // Handle DUP (e.g., 8 DUP(0), 64 DUP(0))
      if (part.toUpperCase().includes('DUP')) {
        const dupMatch = part.match(/(\d+)\s+dup\s*\(\s*([^)]*)\s*\)/i);
        if (dupMatch) {
          const count = parseInt(dupMatch[1]);
          const dupVal = dupMatch[2].trim();
          if (dupVal.startsWith("'") && dupVal.endsWith("'")) {
            for (let k = 0; k < count; k++) {
              for (let c = 1; c < dupVal.length - 1; c++) {
                values.push(dupVal.charCodeAt(c));
              }
            }
          } else {
            let val = this._parseImmediate(dupVal);
            for (let k = 0; k < count; k++) values.push(val);
          }
        }
      }
      // Handle string
      else if (part.startsWith("'") && part.endsWith("'")) {
        for (let i = 1; i < part.length - 1; i++) values.push(part.charCodeAt(i));
      }
      // Handle number
      else {
        const val = this._parseImmediate(part);
        values.push(val);
      }
    });

    // Store and write to memory
    const offset = this.dataSegmentSize;
    const bytesPerEntry = lowerType === 'dw' ? 2 : lowerType === 'dd' ? 4 : 1;

    this.dataSegment[lowerName] = { offset, type: lowerType, values, bytesPerEntry };

    if (lowerType === 'db') {
      values.forEach((v, i) => {
        this.state.memory[offset + i] = v & 0xFF;
      });
      this.dataSegmentSize += values.length;
    } else if (lowerType === 'dw') {
      values.forEach((v, i) => {
        const addr = offset + i * 2;
        this.state.memory[addr] = v & 0xFF;
        this.state.memory[addr + 1] = (v >> 8) & 0xFF;
      });
      this.dataSegmentSize += values.length * 2;
    } else if (lowerType === 'dd') {
      values.forEach((v, i) => {
        const addr = offset + i * 4;
        this.state.memory[addr] = v & 0xFF;
        this.state.memory[addr + 1] = (v >> 8) & 0xFF;
        this.state.memory[addr + 2] = (v >> 16) & 0xFF;
        this.state.memory[addr + 3] = (v >> 24) & 0xFF;
      });
      this.dataSegmentSize += values.length * 4;
    }
  }

  // Split data values by comma, respecting strings and DUP()
  _splitDataValues(text) {
    const parts = [];
    let current = '';
    let inString = false;
    let depth = 0;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "'" && !inString) { inString = true; current += ch; continue; }
      if (ch === "'" && inString) { inString = false; current += ch; continue; }
      if (ch === '(' && !inString) depth++;
      if (ch === ')' && !inString) depth--;
      if (ch === ',' && !inString && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  // Parse an immediate value (decimal, hex, negative)
  _parseImmediate(str) {
    if (!str) return 0;
    str = str.trim();
    // Hex with H suffix
    if (/^[0-9][0-9A-Fa-f]*H$/i.test(str)) return parseInt(str.slice(0, -1), 16) & 0xFFFF;
    // Hex with 0x prefix
    if (/^0x[0-9A-Fa-f]+$/i.test(str)) return parseInt(str, 16) & 0xFFFF;
    // Negative number
    if (/^-\d+$/.test(str)) return parseInt(str, 10) & 0xFFFF;
    // Decimal
    if (/^\d+$/.test(str)) return parseInt(str, 10) & 0xFFFF;
    // Character
    if (str.startsWith("'") && str.endsWith("'")) return str.charCodeAt(1);
    // EQU constant reference
    const lower = str.toLowerCase();
    if (this.equConstants[lower] !== undefined) {
      return this.equConstants[lower];
    }
    return 0;
  }

  // Evaluate EQU expression (supports arithmetic with $ symbol and EQU constants)
  _evaluateEquExpression(expr) {
    if (!expr) return 0;
    expr = expr.trim();

    // Replace $-ARRAY patterns with the difference (dataSegmentSize - ARRAY.offset)
    // This handles expressions like: ($-ARRAY) / 2
    // $ represents the current end of data segment (dataSegmentSize)
    // ARRAY is a variable with an offset
    expr = expr.replace(/\$-(\w+)/gi, (_, varName) => {
      const lower = varName.toLowerCase();
      if (this.dataSegment[lower]) {
        return String(this.dataSegmentSize - this.dataSegment[lower].offset);
      }
      return String(this.dataSegmentSize); // Fallback: just $ value
    });

    // Replace remaining $ symbols with dataSegmentSize
    expr = expr.replace(/\$/g, String(this.dataSegmentSize));

    // Resolve EQU constant references
    let changed = true;
    let iterations = 0;
    const maxIterations = 10;
    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;
      for (const [name, value] of Object.entries(this.equConstants)) {
        const regex = new RegExp(`\\b${name}\\b`, 'gi');
        if (regex.test(expr)) {
          expr = expr.replace(regex, String(value));
          changed = true;
        }
      }
    }

    // Handle data segment variable references (only use offset values)
    for (const [name, info] of Object.entries(this.dataSegment)) {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      if (regex.test(expr)) {
        expr = expr.replace(regex, String(info.offset));
      }
    }

    // Handle parentheses and arithmetic
    try {
      // Replace hexadecimal values (e.g., 0FCH -> 252, or 0FCH as part of ARRAY)
      expr = expr.replace(/([0-9][0-9A-Fa-f]*)H/gi, (_, hex) => parseInt(hex, 16).toString());

      // Replace 0x hex
      expr = expr.replace(/0x([0-9A-Fa-f]+)/gi, (_, hex) => parseInt(hex, 16).toString());

      // Clean the expression: only allow digits, operators, parentheses, and spaces
      const cleanExpr = expr.replace(/\s+/g, ''); // Remove all spaces first
      const safeExpr = cleanExpr.replace(/[^0-9+\-*/()]/g, '');

      if (safeExpr !== cleanExpr) {
        console.warn('EQU expression has potentially unsafe characters:', cleanExpr);
        return 0;
      }

      if (!safeExpr) {
        return 0;
      }

      // Evaluate
      const result = new Function(`return (${safeExpr})`)();
      return Math.floor(result) & 0xFFFF;
    } catch (e) {
      console.warn('EQU expression evaluation failed:', expr, e);
      return 0;
    }
  }

  // Evaluate EQU expression with specific $ position
  _evaluateEquExpressionWithPosition(expr, dollarPosition) {
    if (!expr) return 0;
    expr = expr.trim();

    // Replace $-ARRAY patterns with the difference (dollarPosition - ARRAY.offset)
    expr = expr.replace(/\$-(\w+)/gi, (_, varName) => {
      const lower = varName.toLowerCase();
      if (this.dataSegment[lower]) {
        return String(dollarPosition - this.dataSegment[lower].offset);
      }
      return String(dollarPosition); // Fallback
    });

    // Replace remaining $ symbols with dollarPosition
    expr = expr.replace(/\$/g, String(dollarPosition));

    // Resolve EQU constant references
    let changed = true;
    let iterations = 0;
    const maxIterations = 10;
    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;
      for (const [name, value] of Object.entries(this.equConstants)) {
        const regex = new RegExp(`\\b${name}\\b`, 'gi');
        if (regex.test(expr)) {
          expr = expr.replace(regex, String(value));
          changed = true;
        }
      }
    }

    // Handle data segment variable references (only use offset values)
    for (const [name, info] of Object.entries(this.dataSegment)) {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      if (regex.test(expr)) {
        expr = expr.replace(regex, String(info.offset));
      }
    }

    // Handle parentheses and arithmetic
    try {
      // Replace hexadecimal values (e.g., 0FCH -> 252)
      expr = expr.replace(/([0-9][0-9A-Fa-f]*)H/gi, (_, hex) => parseInt(hex, 16).toString());
      // Replace 0x hex
      expr = expr.replace(/0x([0-9A-Fa-f]+)/gi, (_, hex) => parseInt(hex, 16).toString());

      // Clean the expression
      const cleanExpr = expr.replace(/\s+/g, '');
      const safeExpr = cleanExpr.replace(/[^0-9+\-*/()]/g, '');

      if (safeExpr !== cleanExpr) {
        console.warn('EQU expression has potentially unsafe characters:', cleanExpr);
        return 0;
      }

      if (!safeExpr) {
        return 0;
      }

      // Evaluate
      const result = new Function(`return (${safeExpr})`)();
      return Math.floor(result) & 0xFFFF;
    } catch (e) {
      console.warn('EQU expression evaluation failed:', expr, e);
      return 0;
    }
  }
}

// Wrapper for backward compatibility
export function parseAssembly(code) {
  const sim = new AsmSimulator(code);
  return {
    instructions: sim.instructions,
    labels: sim.labels,
    steps: sim.history,
    explanations: sim.explanations,
    dataSegment: sim.dataSegment
  };
}

export function runProgram(code, maxSteps = 10000) {
  const sim = new AsmSimulator(code);
  sim.run(maxSteps);
  return {
    steps: sim.history,
    output: sim.state.output,
    explanations: sim.explanations
  };
}

export function createInitialState() {
  return new AsmSimulator('').state;
}
