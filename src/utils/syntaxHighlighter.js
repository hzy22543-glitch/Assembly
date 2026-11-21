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
const tokenPattern = /(?<comment>;[^\r\n]*)|(?<string>"[^"\r\n]*"|'[^'\r\n]*')|(?<label>^[ \t]*[A-Za-z_]\w*:)|\b(?<number>0x[\da-f]+|\d[\da-f]*h|[01]+b|\d+)\b|\b(?<word>[a-z_]\w*)\b/gim
const directives = ['DB', 'DW', 'DD', 'SEGMENT', 'ENDS', 'ASSUME', 'END', 'OFFSET', 'PTR', 'EQU']
const keywordKinds = new Map([
  ...instructions.map(word => [word, 'instruction']),
  ...registers.map(word => [word, 'register']),
  ...directives.map(word => [word, 'directive']),
])

export function highlightAssembly(code) {
  if (!code) return ''
  let markup = ''
  let offset = 0
  for (const token of code.matchAll(tokenPattern)) {
    const value = token[0]
    let kind = Object.keys(token.groups).find(key => token.groups[key] !== undefined)
    if (kind === 'word') kind = keywordKinds.get(value.toUpperCase())
    markup += escapeHtml(code.slice(offset, token.index))
    markup += kind ? `<span class="${kind}">${escapeHtml(value)}</span>` : escapeHtml(value)
    offset = token.index + value.length
  }
  return markup + escapeHtml(code.slice(offset))
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
