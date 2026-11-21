// 汇编语法高亮 - 保持原始代码格式
const instructions = [
  'MOV', 'PUSH', 'POP', 'XCHG', 'LEA', 'LDS', 'LES',
  'ADD', 'SUB', 'MUL', 'DIV', 'INC', 'DEC', 'NEG', 'CMP',
  'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR', 'SAL', 'SAR', 'ROL', 'ROR',
  'JMP', 'JE', 'JNE', 'JZ', 'JNZ', 'JG', 'JGE', 'JL', 'JLE', 'JA', 'JB',
  'CALL', 'RET', 'INT', 'IRET',
  'LOOP', 'LOOPE', 'LOOPNE',
  'NOP', 'HLT', 'CLC', 'STC', 'CLI', 'STI'
]

const registers = [
  'AX', 'BX', 'CX', 'DX', 'SP', 'BP', 'SI', 'DI',
  'AH', 'AL', 'BH', 'BL', 'CH', 'CL', 'DH', 'DL',
  'EAX', 'EBX', 'ECX', 'EDX', 'ESP', 'EBP', 'ESI', 'EDI',
  'CS', 'DS', 'SS', 'ES', 'FS', 'GS',
  'IP', 'EIP', 'FLAGS', 'EFLAGS'
]

// 转义 HTML 特殊字符
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 高亮汇编代码，保持原始格式（包括缩进和空格）
 * @param {string} code - 原始代码
 * @returns {string} - 高亮后的 HTML
 */
export function highlightAssembly(code) {
  if (!code) return ''

  // 先转义 HTML
  let highlighted = escapeHtml(code)

  // 高亮注释 (分号后面的内容)
  highlighted = highlighted.replace(/(;.*)$/gm, '<span class="comment">$1</span>')

  // 高亮标签 (以冒号结尾的单词，在行首)
  highlighted = highlighted.replace(/^(\s*[A-Za-z_]\w*)(:)/gm, '$1<span class="label">:</span>')
  highlighted = highlighted.replace(/^(\s*)([A-Za-z_]\w*)(:)/gm, '$1<span class="label">$2</span><span class="label">:</span>')

  // 高亮指令 - 匹配行首或空格后的指令
  const instructionRegex = new RegExp(`(^|[\s])(${instructions.join('|')})(?=[\s,]|$)`, 'gi')
  highlighted = highlighted.replace(instructionRegex, '$1<span class="instruction">$2</span>')

  // 高亮寄存器
  const registerRegex = new RegExp(`\\b(${registers.join('|')})\\b`, 'gi')
  highlighted = highlighted.replace(registerRegex, '<span class="register">$1</span>')

  // 高亮数字 (十六进制、二进制、十进制)
  highlighted = highlighted.replace(/\b(0x[0-9A-Fa-f]+|\d+[HhBb]?)\b/g, '<span class="number">$1</span>')

  return highlighted
}

/**
 * 格式化汇编代码，统一缩进
 * @param {string} code - 原始代码
 * @returns {string} - 格式化后的代码
 */
export function formatAssemblyCode(code) {
  if (!code) return ''

  const lines = code.split('\n')
  let formattedLines = []

  for (let line of lines) {
    const trimmed = line.trim()
    
    // 空行保留
    if (!trimmed) {
      formattedLines.push('')
      continue
    }

    // 注释行
    if (trimmed.startsWith(';')) {
      formattedLines.push(trimmed)
      continue
    }

    // 段定义
    if (trimmed.toUpperCase().match(/\.(DATA|CODE|TEXT|BSS|MODEL)/)) {
      formattedLines.push(trimmed)
      continue
    }

    // 标签行
    if (trimmed.match(/^\w+:/)) {
      formattedLines.push(trimmed)
      continue
    }

    // 指令行 - 保持原样
    formattedLines.push(trimmed)
  }

  return formattedLines.join('\n')
}
