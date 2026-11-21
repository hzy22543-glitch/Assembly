// AI 服务层 - 调用 DeepSeek V3 大模型分析代码 (OpenAI SDK 格式)

// ========== 阿里云 DashScope (通义千问) 配置 ==========
// 注意：这些值通过 Vite define 在构建时替换，请确保 .env 文件正确配置
// API Key 可从 https://bailian.console.aliyun.com/ 获取
const API_KEY = import.meta.env.VITE_AI_API_KEY || ''
const MODEL = import.meta.env.VITE_AI_MODEL || 'deepseek-v3.2'  // 默认使用 deepseek-v3.2
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

// 阿里云 DashScope OpenAI 兼容接口（国际版）
const API_URL = import.meta.env.VITE_AI_API_URL || '/dashscope/compatible-mode/v1/chat/completions'

// ========== 混元配置 (已暂停，续费后可取消注释替换回来) ==========
// const API_KEY = import.meta.env.VITE_AI_API_KEY || ''
// const MODEL = import.meta.env.VITE_AI_MODEL || 'hunyuan-turbo-latest'
// const API_URL = '/hunyuan/v1/chat/completions'

// 安全的控制台日志
if (typeof console !== 'undefined') {
  console.log('[AI Service] API地址:', API_URL)
  console.log('[AI Service] 使用模型:', MODEL)
  console.log('[AI Service] 使用模拟数据:', USE_MOCK_DATA)
  console.log('[AI Service] API Key 存在:', !!API_KEY)
}

// 解析汇编代码，提取有效指令
function parseAssemblyLines(code) {
  return code.split('\n').map((line, index) => ({
    lineNum: index + 1,
    content: line,
    trimmed: line.trim()
  })).filter(item => item.trimmed && !item.trimmed.startsWith(';'))
}

// 解析单条指令
function parseInstruction(line) {
  const trimmed = line.trim()
  // 去除注释
  const codePart = trimmed.split(';')[0].trim()
  if (!codePart) return null

  // 检测标签 (以冒号结尾)
  if (codePart.endsWith(':')) {
    return { type: 'label', name: codePart.slice(0, -1) }
  }

  // 分词
  const parts = codePart.split(/[\s,]+/).filter(p => p)
  if (parts.length === 0) return null

  // 常见助记符与伪指令列表
  const knownMnemonics = new Set([
    'MOV', 'ADD', 'SUB', 'INC', 'DEC', 'CMP', 'JMP', 'JE', 'JNE', 'JZ', 'JNZ', 'JG', 'JL',
    'JGE', 'JLE', 'JA', 'JB', 'JAE', 'JBE', 'LOOP', 'PUSH', 'POP', 'CALL', 'RET', 'INT',
    'MUL', 'DIV', 'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR', 'LEA', 'NOP', 'DB', 'DW', 'DD', 'EQU'
  ])

  let mnemonic = parts[0].toUpperCase()
  let operands = parts.slice(1)

  // 处理带有标签的数据定义 (如 ARRAY DW 10)
  if (!knownMnemonics.has(mnemonic) && parts.length > 1) {
    const secondMnemonic = parts[1].toUpperCase()
    if (knownMnemonics.has(secondMnemonic)) {
      mnemonic = secondMnemonic
      operands = parts.slice(2)
    }
  }

  return { type: 'instruction', mnemonic, operands, raw: codePart }
}

// 获取指令解释
function getInstructionExplanation(mnemonic, operands) {
  const explanations = {
    // 数据定义
    'DB': `定义字节(Byte)数据: ${operands.join(', ')}`,
    'DW': `定义字(Word, 16位)数据: ${operands.join(', ')}`,
    'DD': `定义双字(DoubleWord, 32位)数据: ${operands.join(', ')}`,
    'EQU': `定义常量/符号等价: ${operands[0] || ''} 等于 ${operands.slice(1).join(' ') || '表达式'}`,

    // 转送
    'MOV': `将 ${operands[1] || '值'} 传送到 ${operands[0] || '目标'}`,
    'LEA': `将 ${operands[1] || '源'} 的有效地址加载到 ${operands[0] || '目标'}`,
    'PUSH': `将 ${operands[0] || '值'} 压入堆栈`,
    'POP': `从堆栈弹出值到 ${operands[0] || '目标'}`,

    // 算术
    'ADD': `将 ${operands[1] || '值'} 加到 ${operands[0] || '目标'}`,
    'SUB': `从 ${operands[0] || '目标'} 减去 ${operands[1] || '值'}`,
    'INC': `将 ${operands[0] || '操作数'} 自增 1`,
    'DEC': `将 ${operands[0] || '操作数'} 自减 1`,
    'MUL': `乘法运算: AX 乘以 ${operands[0] || '操作数'}`,
    'IMUL': `有符号乘法: AX 乘以 ${operands[0] || '操作数'}`,
    'DIV': `除法运算: 把 DX:AX 除以 ${operands[0] || '操作数'}`,
    'IDIV': `有符号除法: 把 DX:AX 除以 ${operands[0] || '操作数'}`,
    'NEG': `对 ${operands[0] || '操作数'} 取补码(求相反数)`,

    // 比较与跳转
    'CMP': `比较 ${operands[0] || '操作数1'} 和 ${operands[1] || '操作数2'}`,
    'JMP': `无条件跳转到 ${operands[0] || '目标'}`,
    'JE': `若相等(ZF=1)则跳转到 ${operands[0] || '目标'}`,
    'JZ': `若为零(ZF=1)则跳转到 ${operands[0] || '目标'}`,
    'JNE': `若不相等(ZF=0)则跳转到 ${operands[0] || '目标'}`,
    'JNZ': `若不为零(ZF=0)则跳转到 ${operands[0] || '目标'}`,
    'JG': `若大于(有符号)则跳转到 ${operands[0] || '目标'}`,
    'JGE': `若大于等于(有符号)则跳转到 ${operands[0] || '目标'}`,
    'JL': `若小于(有符号)则跳转到 ${operands[0] || '目标'}`,
    'JLE': `若小于等于(有符号)则跳转到 ${operands[0] || '目标'}`,
    'JA': `若高于(无符号)则跳转到 ${operands[0] || '目标'}`,
    'JB': `若低于(无符号)则跳转到 ${operands[0] || '目标'}`,
    'LOOP': `循环: CX减1，若CX不为0则跳转到 ${operands[0] || '目标'}`,

    // 逻辑
    'AND': `对 ${operands[0] || '目标'} 和 ${operands[1] || '源'} 进行“与”逻辑运算`,
    'OR': `对 ${operands[0] || '目标'} 和 ${operands[1] || '源'} 进行“或”逻辑运算`,
    'XOR': `对 ${operands[0] || '目标'} 和 ${operands[1] || '源'} 进行“异或”逻辑运算`,
    'NOT': `对 ${operands[0] || '操作数'} 进行“非”取反运算`,
    'TEST': `对 ${operands[0]} 和 ${operands[1]} 进行“与”运算但不保存结果，仅影响标志位`,

    // 移位
    'SHL': `将 ${operands[0] || '操作数'} 逻辑左移 ${operands[1] || '1'} 位`,
    'SHR': `将 ${operands[0] || '操作数'} 逻辑右移 ${operands[1] || '1'} 位`,
    'SAL': `将 ${operands[0] || '操作数'} 算术左移 ${operands[1] || '1'} 位`,
    'SAR': `将 ${operands[0] || '操作数'} 算术右移 ${operands[1] || '1'} 位`,
    'ROL': `将 ${operands[0] || '操作数'} 循环左移`,
    'ROR': `将 ${operands[0] || '操作数'} 循环右移`,

    // 子程序与中断
    'CALL': `调用子程序 ${operands[0] || '目标'}`,
    'RET': `从子程序返回`,
    'INT': `调用系统中断，编号: ${operands[0] || ''}`,
    'IRET': `从中断程序返回`,

    // 其他
    'CLC': `清进位标志位(CF=0)`,
    'STC': `置进位标志位(CF=1)`,
    'CLD': `清方向标志位(DF=0, 向上处理)`,
    'STD': `置方向标志位(DF=1, 向下处理)`,
    'NOP': '空操作(Wait/No Operation)'
  }

  return explanations[mnemonic] || `执行 ${mnemonic} 操作`
}

// 获取大白话解释
function getHumanReadableExplanation(mnemonic, operands) {
  const humanReadable = {
    'DB': `在这里定义了一串字节数据：${operands.join(', ')}`,
    'DW': `在这里定义了一串16位的字数据：${operands.join(', ')}`,
    'DD': `在这里定义了一串32位的双字数据：${operands.join(', ')}`,
    'EQU': `给个代号叫 ${operands[0] || ''}，它的值定死为后面那一串`,
    'MOV': `把 ${operands[1] || '值'} 挪到 ${operands[0] || '位置'}`,
    'LEA': `把 ${operands[1] || '变量'} 所在的内存地址取出来，存到 ${operands[0]} 里`,
    'ADD': `把 ${operands[1] || '这个数'} 加到 ${operands[0] || '目标'} 上`,
    'SUB': `从 ${operands[0] || '目标'} 减去 ${operands[1] || '这个数'}`,
    'INC': `让 ${operands[0] || '它'} 加上 1`,
    'DEC': `让 ${operands[0] || '它'} 减去 1`,
    'CMP': `比比看 ${operands[0] || '这两个数'} 是大是小，还是相等`,
    'CMP AX, 0': '检查 AX 寄存器里的数字是不是零',
    'JMP': `直接跳到 ${operands[0] || '这里'} 继续执行`,
    'JE': `如果刚才比的结果是相等，就跳到 ${operands[0] || '这里'}`,
    'JZ': `如果是零，就跳到 ${operands[0] || '这里'}`,
    'JNE': `如果不相等，就跳到 ${operands[0] || '这里'}`,
    'JNZ': `如果不是零，就跳到 ${operands[0] || '这里'}`,
    'JG': `如果比完是大，就跳到 ${operands[0] || '这里'}`,
    'JL': `如果比完是小，就跳到 ${operands[0] || '这里'}`,
    'LOOP': `循环执行，每转一圈 CX 减 1，减到底(为0)就结束`,
    'PUSH': `把 ${operands[0] || '数据'} 暂时存到“小仓库”(堆栈)的顶部`,
    'POP': `从“小仓库”(堆栈)顶部把刚才存的东西拿出来，放回 ${operands[0]}`,
    'CALL': `去跑一下 ${operands[0] || '这个子程序'}，跑完还得回来`,
    'RET': `子程序跑完了，返回刚才跳出的地方`,
    'INT': `叫一下操作系统的师傅，功能号大概在 AH 里`,
    'MUL': `做个乘法`,
    'DIV': `做个除法`,
    'NOT': `把 0 变成 1，1 变成 0`,
    'SHL': `就像把数字在格子里整体往左挪，右边补零`,
    'SHR': `就像把数字在格子里整体往右挪，左边补零`,
    'NOP': '在这儿发会儿呆，什么都不做'
  }

  // 尝试匹配完整指令字符串 (如 CMP AX, 0)
  const fullText = operands.length > 0 ? `${mnemonic} ${operands.join(', ')}`.toUpperCase() : mnemonic
  if (humanReadable[fullText]) return humanReadable[fullText]

  return humanReadable[mnemonic] || `执行 ${mnemonic} 操作`
}

// 检测代码特征
function analyzeCodeFeatures(parsedLines) {
  const features = {
    hasLoop: false,
    hasJump: false,
    hasCondition: false,
    hasStack: false,
    hasArithmetic: false,
    hasMemory: false,
    registers: new Set()
  }

  parsedLines.forEach(({ trimmed }) => {
    const upper = trimmed.toUpperCase()
    const parsed = parseInstruction(trimmed)

    if (!parsed || parsed.type === 'label') return

    const { mnemonic, operands } = parsed

    // 检测循环
    if (['LOOP', 'JMP', 'JE', 'JNE', 'JZ', 'JNZ', 'JG', 'JL'].includes(mnemonic)) {
      features.hasJump = true
      if (mnemonic === 'LOOP') features.hasLoop = true
      else if (['JE', 'JNE', 'JZ', 'JNZ', 'JG', 'JL'].includes(mnemonic)) features.hasCondition = true
    }

    // 检测栈操作
    if (['PUSH', 'POP', 'CALL', 'RET'].includes(mnemonic)) {
      features.hasStack = true
    }

    // 检测算术运算
    if (['ADD', 'SUB', 'INC', 'DEC', 'MUL', 'DIV', 'AND', 'OR', 'XOR'].includes(mnemonic)) {
      features.hasArithmetic = true
    }

    // 检测内存操作
    if (operands && operands.some(op => op.includes('['))) {
      features.hasMemory = true
    }

    // 收集寄存器
    operands && operands.forEach(op => {
      const regMatch = op.match(/\b(AX|BX|CX|DX|SI|DI|BP|SP|AL|BL|CL|DL|AH|BH|CH|DH)\b/i)
      if (regMatch) features.registers.add(regMatch[0].toUpperCase())
    })
  })

  return features
}

// 分析代码功能类型
function analyzeCodePurpose(code, parsedLines, features) {
  const codeUpper = code.toUpperCase()

  // 检测各种功能模式
  if (codeUpper.includes('INT 21H') || codeUpper.includes('INT 21h')) {
    if (codeUpper.includes('AH, 09H') || codeUpper.includes('AH,09H') || codeUpper.includes('9')) {
      return { type: 'string_output', name: '字符串输出程序', desc: '使用DOS中断21h的功能9号显示字符串' }
    }
    if (codeUpper.includes('AH, 01H') || codeUpper.includes('AH,1') || codeUpper.includes('4CH')) {
      return { type: 'io_program', name: '输入输出程序', desc: '使用DOS中断进行键盘输入和屏幕输出' }
    }
    if (codeUpper.includes('AH, 4CH') || codeUpper.includes('AH,4CH')) {
      return { type: 'program_exit', name: '程序退出处理', desc: '使用DOS中断21h的功能4Ch正常退出程序' }
    }
    return { type: 'dos_interrupt', name: 'DOS中断调用程序', desc: '使用DOS中断21h进行系统调用' }
  }

  if (codeUpper.includes('LOOP') || (features.hasLoop && codeUpper.includes('CX'))) {
    if (codeUpper.includes('ADD') && codeUpper.includes('INC')) {
      return { type: 'accumulation', name: '循环累加程序', desc: '使用LOOP指令实现累加求和功能' }
    }
    if (codeUpper.includes('MUL') || codeUpper.includes('DIV')) {
      return { type: 'calculation', name: '循环计算程序', desc: '使用循环结构实现乘除运算' }
    }
    return { type: 'loop_structure', name: '循环结构程序', desc: '使用LOOP指令实现循环控制' }
  }

  if (features.hasCondition && (codeUpper.includes('JE') || codeUpper.includes('JNE') || codeUpper.includes('CMP'))) {
    return { type: 'conditional', name: '条件分支程序', desc: '使用CMP和条件跳转实现分支逻辑' }
  }

  if (codeUpper.includes('PUSH') && codeUpper.includes('POP')) {
    return { type: 'stack_operation', name: '栈操作程序', desc: '使用PUSH/POP进行栈操作，可能涉及子程序调用' }
  }

  if (codeUpper.includes('CALL') || codeUpper.includes('RET')) {
    return { type: 'subroutine', name: '子程序调用', desc: '使用CALL和RET实现子程序调用与返回' }
  }

  if (codeUpper.includes('MOV') && features.registers.size > 3) {
    return { type: 'data_transfer', name: '数据传送程序', desc: '进行寄存器之间的数据传送和初始化' }
  }

  if (codeUpper.includes('LEA')) {
    return { type: 'addressing', name: '地址加载程序', desc: '使用LEA指令进行有效地址计算' }
  }

  return { type: 'general', name: '通用汇编程序', desc: '执行基本的汇编指令序列' }
}

// 模拟数据生成函数 - 基于实际代码（增强版）
function generateMockAnalysis(code) {
  const parsedLines = parseAssemblyLines(code)
  const features = analyzeCodeFeatures(parsedLines)
  const registerList = Array.from(features.registers)
  const purpose = analyzeCodePurpose(code, parsedLines, features)

  // 生成智能概述
  let summary = ''

  // 根据代码功能生成更具体的概述
  switch (purpose.type) {
    case 'string_output':
      summary = `这是一个DOS字符串输出程序，使用INT 21h的09h功能显示以'$'结尾的字符串。共${parsedLines.length}行有效指令，包含数据段定义和代码段执行。`
      break
    case 'accumulation':
      const loopCount = code.match(/MOV\s+CX[\s,]+(\d+)/i)?.[1] || '指定'
      summary = `这是一个${purpose.name}，使用LOOP指令实现1到${loopCount}的累加求和。通过CX寄存器控制循环次数，AX寄存器存储累加结果。`
      break
    case 'conditional':
      summary = `这是一个${purpose.name}，使用CMP指令比较数值，配合条件跳转指令（JE/JNE等）实现分支逻辑。根据比较结果选择不同的执行路径。`
      break
    case 'stack_operation':
      summary = `这是一个${purpose.name}，利用栈的先进后出特性保存和恢复寄存器值。适用于子程序调用时保护现场。`
      break
    case 'subroutine':
      summary = `这是一个${purpose.name}，通过CALL指令跳转到子程序执行，使用RET指令返回主程序。实现代码模块化。`
      break
    case 'dos_interrupt':
      summary = `这是一个${purpose.name}，通过设置AH寄存器选择不同功能号，调用DOS提供的服务（如输入输出、文件操作等）。`
      break
    default:
      summary = `这是一个${purpose.name}，${purpose.desc}。共${parsedLines.length}行有效指令`
      if (registerList.length > 0) {
        summary += `，主要使用${registerList.slice(0, 4).join('、')}等寄存器`
      }
      summary += '。'
  }

  // 添加功能特点描述
  const characteristics = []
  if (features.hasLoop) characteristics.push('循环控制')
  if (features.hasCondition) characteristics.push('条件判断')
  if (features.hasArithmetic) characteristics.push('算术运算')
  if (features.hasStack) characteristics.push('栈操作')
  if (features.hasMemory) characteristics.push('内存访问')

  if (characteristics.length > 0) {
    summary += `程序特点：${characteristics.join('、')}。`
  }

  // 生成逐行分析
  const lineAnalysis = parsedLines.map(({ lineNum, trimmed }) => {
    const parsed = parseInstruction(trimmed)

    if (!parsed) {
      return { line: lineNum, code: trimmed, explanation: '空行或注释', humanReadable: '无操作' }
    }

    if (parsed.type === 'label') {
      return {
        line: lineNum,
        code: trimmed,
        explanation: `定义程序标签 ${parsed.name}，作为跳转目标点`,
        humanReadable: `在这里做个标记叫"${parsed.name}"，方便跳转到这里`
      }
    }

    const { mnemonic, operands } = parsed
    let explanation = getInstructionExplanation(mnemonic, operands)
    let humanReadable = getHumanReadableExplanation(mnemonic, operands)

    // 针对特定指令添加更详细的解释
    if (mnemonic === 'INT' && operands[0] === '21H') {
      explanation = '调用DOS中断服务，根据AH寄存器的值执行不同功能'
      humanReadable = '调用操作系统的服务（如显示字符、读取键盘等）'
    }

    return {
      line: lineNum,
      code: trimmed,
      explanation,
      humanReadable
    }
  })

  // 生成寄存器流向分析
  const registerFlow = []
  if (registerList.includes('AX')) registerFlow.push('AX：累加器，用于算术运算')
  if (registerList.includes('CX')) registerFlow.push('CX：计数器，用于循环控制')
  if (registerList.includes('DX')) registerFlow.push('DX：数据寄存器，配合AX使用')
  if (registerList.includes('BX')) registerFlow.push('BX：基址寄存器，用于地址计算')
  if (registerList.includes('SP')) registerFlow.push('SP：栈指针，指向栈顶')
  if (registerList.length > registerFlow.length) {
    registerFlow.push(`其他寄存器（${registerList.slice(registerFlow.length).join('、')}）：辅助数据存储`)
  }

  // 生成优化建议
  let optimization = ''
  if (purpose.type === 'accumulation' && !code.toUpperCase().includes('LOOP')) {
    optimization = '可以使用LOOP指令简化循环结构，减少跳转指令的使用。'
  } else if (registerList.length > 6) {
    optimization = '寄存器使用较多，建议合理规划寄存器分配，避免不必要的数据移动。'
  } else if (features.hasLoop && features.hasCondition) {
    optimization = '循环内有条件判断，确保循环退出条件正确设置，避免死循环。'
  } else {
    optimization = '代码结构清晰，可考虑添加注释说明各段功能，提高可读性。'
  }

  return {
    summary,
    lineAnalysis,
    registerFlow,
    optimization
  }
}

// 模拟流程图生成 - 基于实际代码
function generateMockFlowchart(code) {
  const parsedLines = parseAssemblyLines(code)
  const features = analyzeCodeFeatures(parsedLines)

  let warning = null
  if (parsedLines.length > 50) {
    warning = '代码较复杂，流程图已简化'
  }

  // 收集标签
  const labels = parsedLines
    .map(({ trimmed }) => parseInstruction(trimmed))
    .filter(p => p && p.type === 'label')
    .map(p => p.name)

  // 检测是否有条件跳转
  const hasConditionalJump = parsedLines.some(({ trimmed }) => {
    const upper = trimmed.toUpperCase()
    return ['JE', 'JNE', 'JZ', 'JNZ', 'JG', 'JL', 'JGE', 'JLE'].some(j => upper.includes(j))
  })

  // 构建流程图
  let mermaidCode = 'graph TD\n'
  mermaidCode += '    START([开始]) --> INIT[初始化阶段]\n'

  if (features.hasLoop || labels.length > 0) {
    mermaidCode += '    INIT --> PROCESS[执行处理]\n'

    if (hasConditionalJump) {
      mermaidCode += '    PROCESS --> DECISION{条件判断}\n'
      mermaidCode += '    DECISION -->|满足条件| TRUE_BRANCH[执行分支A]\n'
      mermaidCode += '    DECISION -->|不满足| FALSE_BRANCH[执行分支B]\n'
      mermaidCode += '    TRUE_BRANCH --> MERGE[合并点]\n'
      mermaidCode += '    FALSE_BRANCH --> MERGE\n'
      mermaidCode += '    MERGE --> END([结束])\n'
    } else {
      mermaidCode += '    PROCESS --> LOOP{循环判断}\n'
      mermaidCode += '    LOOP -->|继续循环| LOOP_BODY[循环体]\n'
      mermaidCode += '    LOOP -->|退出循环| END([结束])\n'
      mermaidCode += '    LOOP_BODY --> LOOP\n'
    }
  } else {
    mermaidCode += '    INIT --> PROCESS[顺序执行]\n'
    mermaidCode += '    PROCESS --> END([结束])\n'
  }

  return {
    mermaidCode,
    warning,
    complexity: parsedLines.length
  }
}

// 模拟数据流生成 - 基于实际代码
function generateMockDataFlow(code) {
  const parsedLines = parseAssemblyLines(code)
  const features = analyzeCodeFeatures(parsedLines)
  const registerList = Array.from(features.registers)

  // 跟踪寄存器的值变化
  const registerValues = {}
  registerList.forEach(reg => {
    registerValues[reg] = 0 // 初始化为0
  })

  // 生成数据节点 - 使用实际跟踪的值
  const nodes = registerList.map((reg) => ({
    id: reg,
    type: 'register',
    value: registerValues[reg].toString(),
    originalValue: registerValues[reg].toString(),
    changed: false // 初始状态为未改变
  }))

  console.log('初始节点状态:', nodes)

  if (nodes.length === 0) {
    nodes.push({ id: 'AX', type: 'register', value: '0', originalValue: '0' })
    registerValues['AX'] = 0
  }

  // 生成边（数据流）
  const edges = []
  let step = 1

  // 收集内存地址
  const memoryAddresses = new Set()

  parsedLines.forEach(({ trimmed }) => {
    const parsed = parseInstruction(trimmed)
    if (!parsed || parsed.type === 'label') return

    const { mnemonic, operands } = parsed
    const upperMnemonic = mnemonic.toUpperCase()

    if (operands && operands.length >= 1) {
      const destOperand = operands[0].trim()
      const srcOperand = operands[1] ? operands[1].trim() : null

      // 判断操作数类型
      const isRegister = (op) => {
        if (!op) return false
        const upperOp = op.toUpperCase()
        return ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH'].includes(upperOp)
      }

      const isImmediate = (op) => {
        if (!op) return false
        // 检查是否是立即数（数字或十六进制）
        return /^-?\d+$/.test(op) ||
          /^0[xX][0-9A-Fa-f]+$/.test(op) ||
          /^[0-9A-Fa-f]+[Hh]$/.test(op)
      }

      const isMemory = (op) => {
        if (!op) return false
        return op.includes('[') && op.includes(']')
      }

      const destReg = isRegister(destOperand) ? destOperand.toUpperCase() : null
      const srcReg = isRegister(srcOperand) ? srcOperand.toUpperCase() : null
      const srcImmediate = isImmediate(srcOperand) ? srcOperand : null
      const isSrcMemory = isMemory(srcOperand)

      // 创建边
      let fromNode = null
      let toNode = null
      let operation = upperMnemonic
      let description = getInstructionExplanation(mnemonic, operands)

      // 根据指令类型构建数据流
      if (upperMnemonic === 'MOV') {
        if (destReg) {
          if (srcImmediate) {
            // MOV AX, 5 - 从立即数到寄存器
            fromNode = `立即数 ${srcImmediate}`
            toNode = destReg
            description = `将立即数 ${srcImmediate} 加载到 ${destReg}`
            // 更新寄存器值（稍后统一更新nodes）
            registerValues[destReg] = parseInt(srcImmediate)
          } else if (srcReg) {
            // MOV AX, BX - 从寄存器到寄存器
            fromNode = srcReg
            toNode = destReg
            description = `复制 ${srcReg} 的值到 ${destReg}`
            // 更新寄存器值（稍后统一更新nodes）
            registerValues[destReg] = registerValues[srcReg]
          } else if (isSrcMemory) {
            // MOV AX, [BX] - 从内存到寄存器
            fromNode = `内存 ${srcOperand}`
            toNode = destReg
            description = `从内存位置 ${srcOperand} 加载数据到 ${destReg}`
            memoryAddresses.add(srcOperand)
            // 内存加载不更新registerValues，保持默认值
          }
        }
      } else if (['ADD', 'SUB', 'MUL', 'DIV', 'AND', 'OR', 'XOR'].includes(upperMnemonic)) {
        if (destReg && (srcReg || srcImmediate)) {
          fromNode = srcReg || `立即数 ${srcImmediate}`
          toNode = destReg
          description = `${destReg} ${operation} ${fromNode}`
          // 更新寄存器值
          const val1 = srcReg ? registerValues[srcReg] : parseInt(srcImmediate)
          let result = registerValues[destReg]

          if (upperMnemonic === 'ADD') {
            result += val1
          } else if (upperMnemonic === 'SUB') {
            result -= val1
          } else if (upperMnemonic === 'MUL') {
            result *= val1
          } else if (upperMnemonic === 'DIV') {
            result = Math.floor(result / val1)
          } else if (upperMnemonic === 'AND') {
            result &= val1
          } else if (upperMnemonic === 'OR') {
            result |= val1
          } else if (upperMnemonic === 'XOR') {
            result ^= val1
          }

          registerValues[destReg] = result
          // 节点稍后统一更新
        }
      } else if (['INC', 'DEC'].includes(upperMnemonic)) {
        if (destReg) {
          fromNode = destReg // 自增自减，从自己到自己的变体
          toNode = destReg
          description = `${operation} ${destReg}`
          // 更新寄存器值（稍后统一更新nodes）
          if (upperMnemonic === 'INC') {
            registerValues[destReg]++
          } else {
            registerValues[destReg]--
          }
        }
      } else if (['PUSH', 'POP'].includes(upperMnemonic)) {
        if (destReg) {
          if (upperMnemonic === 'PUSH') {
            fromNode = destReg
            toNode = '栈顶'
            description = `将 ${destReg} 压入栈`
          } else {
            fromNode = '栈顶'
            toNode = destReg
            description = `从栈顶弹出值到 ${destReg}`
            // POP不更新registerValues，保持默认值
          }
        }
      } else if (upperMnemonic === 'LEA' && destReg && srcOperand) {
        fromNode = `地址 ${srcOperand}`
        toNode = destReg
        description = `加载有效地址 ${srcOperand} 到 ${destReg}`
        // LEA加载地址，不更新registerValues数值
      }

      // 只有当有有效的数据流时才添加边
      if (fromNode && toNode && fromNode !== toNode) {
        edges.push({
          from: fromNode,
          to: toNode,
          operation: operation,
          description: description,
          step: step++
        })
      }
    }
  })

  // 更新节点值以反映最终状态，并正确标记哪些被修改
  nodes.forEach(node => {
    if (registerValues[node.id] !== undefined) {
      const initialValue = parseInt(node.originalValue) || 0
      const finalValue = registerValues[node.id]

      node.value = finalValue.toString()
      // 只有当值真正改变时才标记为 changed
      node.changed = (finalValue !== initialValue)

      if (node.changed) {
        console.log(`${node.id} 值改变: ${initialValue} -> ${finalValue}`)
      }
    }
  })

  // 添加内存节点
  memoryAddresses.forEach(addr => {
    nodes.push({
      id: `内存 ${addr}`,
      type: 'memory',
      value: '?',
      changed: true  // 内存访问总是标记为变化
    })
  })

  // 生成步骤
  const steps = []
  if (features.hasLoop) {
    steps.push({
      step: 1,
      description: '初始化寄存器',
      nodes: registerList.slice(0, 3).concat(['立即数']),
      action: 'INIT'
    })
    steps.push({
      step: 2,
      description: '循环数据处理',
      nodes: registerList,
      action: 'PROCESS'
    })
    if (memoryAddresses.size > 0) {
      steps.push({
        step: 3,
        description: '内存读写操作',
        nodes: Array.from(memoryAddresses).map(addr => `内存 ${addr}`),
        action: 'MEMORY'
      })
    }
  } else {
    const involvedNodes = [...registerList]
    if (memoryAddresses.size > 0) {
      involvedNodes.push(...Array.from(memoryAddresses).map(addr => `内存 ${addr}`))
    }
    if (edges.some(e => e.from.includes('立即数'))) {
      involvedNodes.push('立即数')
    }
    steps.push({
      step: 1,
      description: '数据传送和处理',
      nodes: involvedNodes.slice(0, 8),
      action: 'EXEC'
    })
  }

  return {
    nodes,
    edges: edges.slice(0, 15), // 增加边数限制
    steps,
    warning: parsedLines.length > 40 ? '代码较复杂，显示主要数据流' : null
  }

  // 调试：打印最终节点状态
  console.log('最终节点状态:', nodes)
  nodes.forEach((node, idx) => {
    console.log(`节点 ${idx}: id=${node.id}, type=${node.type}, value=${node.value}, changed=${node.changed}`)
  })
}

// 模拟完整语义分析生成 - 基于实际代码
function generateMockFullAnalysis(code) {
  const parsedLines = parseAssemblyLines(code)
  const features = analyzeCodeFeatures(parsedLines)
  const registerList = Array.from(features.registers)

  // 构建寄存器使用说明
  const registerUsage = {}
  registerList.forEach((reg, idx) => {
    const descriptions = [
      `通用寄存器，用于数据存储和运算`,
      `参与算术逻辑运算`,
      `存储中间结果`,
      `数据处理和传递`
    ]
    registerUsage[reg] = descriptions[idx % descriptions.length]
  })

  // 构建整体功能描述
  let overallFunction = `这是一段汇编代码，共${parsedLines.length}行有效指令。`
  if (features.hasLoop) {
    overallFunction += '代码实现了循环结构，用于重复执行某些操作。'
  } else if (features.hasCondition) {
    overallFunction += '代码包含条件判断，可以根据不同条件执行不同分支。'
  } else if (features.hasArithmetic) {
    overallFunction += '代码执行算术或逻辑运算。'
  } else {
    overallFunction += '代码执行基本的寄存器操作。'
  }

  // 构建算法描述
  let algorithm = ''
  if (features.hasLoop && features.hasArithmetic) {
    algorithm = '使用循环迭代算法：初始化相关寄存器，进入循环体执行运算，更新计数器和操作数，根据条件判断是否继续循环。'
  } else if (features.hasCondition) {
    algorithm = '使用条件分支算法：执行操作，进行比较判断，根据结果选择不同的执行路径。'
  } else if (features.hasArithmetic) {
    algorithm = '使用顺序运算算法：按顺序执行算术或逻辑运算，将结果存储到目标位置。'
  } else {
    algorithm = '使用顺序执行算法：按顺序执行指令，完成数据传输和处理。'
  }

  // 构建数据流描述
  let controlFlow = '程序'
  if (features.hasLoop) {
    controlFlow += '首先执行初始化指令，然后进入循环结构。'
  } else if (features.hasCondition) {
    controlFlow += '首先执行准备指令，然后进行条件判断。'
  } else {
    controlFlow += '按顺序执行各条指令。'
  }

  // 构建详细解释
  let detailedExplanation = '代码逐行解释：\n'
  parsedLines.forEach(({ lineNum, trimmed }) => {
    const parsed = parseInstruction(trimmed)
    if (!parsed) return

    if (parsed.type === 'label') {
      detailedExplanation += `${lineNum}. 定义标签 ${parsed.name}，作为跳转目标\n`
    } else {
      const { mnemonic, operands } = parsed
      detailedExplanation += `${lineNum}. ${getInstructionExplanation(mnemonic, operands)}\n`
    }
  })

  return {
    overallFunction,
    algorithm,
    dataStructures: registerList.length > 0 ? [`寄存器 (${registerList.join(', ')})`] : ['基本寄存器操作'],
    registerUsage,
    memoryOperations: features.hasMemory ? '代码包含内存访问操作，使用间接寻址方式。' : '代码主要使用寄存器操作，没有显式的内存访问。',
    controlFlow,
    inputOutput: {
      input: '通过寄存器初始值或内存加载获取输入数据',
      output: '结果存储在寄存器或内存中'
    },
    keyPoints: [
      features.hasLoop ? '循环结构的正确使用和退出条件' : '指令的正确执行顺序',
      features.hasCondition ? '条件判断的标志位设置和检查' : '寄存器的数据流管理',
      '寄存器的初始化和更新时机'
    ],
    commonMistakes: [
      '忘记初始化寄存器导致未定义行为',
      features.hasLoop ? '循环条件设置错误导致无限循环或提前退出' : '指令顺序错误导致逻辑错误',
      features.hasCondition ? '条件跳转的判断条件理解错误' : '寄存器数据依赖关系处理不当'
    ],
    learningTips: [
      '使用单步调试观察寄存器状态变化',
      '画出数据流图理解信息传递',
      '尝试修改初始值观察不同结果'
    ],
    detailedExplanation
  }
}

// 通用的 API 调用函数（带超时和重试）
async function callOpenAI(messages, temperature = 0.7, max_tokens = 4000, retryCount = 0) {
  // 检查API Key
  if (!API_KEY || API_KEY === '') {
    console.warn('[AI Service] API Key 为空，将使用模拟数据')
    throw new Error('API_KEY_EMPTY')
  }

  const maxRetries = 2
  const timeout = 180000 // 3分钟超时（混元API响应非常慢）
  const retryDelay = 3000 // 3秒重试延迟

  try {
    // 内部 AbortController 仅用于 timeout（3分钟）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
        temperature: temperature,
        max_tokens: max_tokens,
        stream: false
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      // 尝试解析错误信息
      let errorData = {}
      let errorText = ''
      try {
        errorText = await response.text()
        errorData = JSON.parse(errorText)
      } catch (e) {
        let snippet = errorText ? errorText.slice(0, 100).replace(/\n/g, ' ') : '空响应'
        errorData = { error: { message: `代理服务器返回了无效数据 (状态码 ${response.status}): ${snippet}...` } }
      }

      console.error('[AI Service] API 错误:', errorData)

      // 如果是504网关超时或429 Too Many Requests且未超过最大重试次数，则重试
      if ((response.status === 504 || response.status === 429) && retryCount < maxRetries) {
        console.log(`[AI Service] 状态码 ${response.status}，第${retryCount + 1}次重试...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        return callOpenAI(messages, temperature, max_tokens, retryCount + 1)
      }

      // 如果是429 Too Many Requests，等待更长时间
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After')) || 60
        console.log(`[AI Service] 429 Too Many Requests，等待${retryAfter}秒后重试`)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
        return callOpenAI(messages, temperature, max_tokens, retryCount + 1)
      }

      throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`)
    }

    const data = await response.json()
    console.log('[AI Service] API 调用成功')
    return data
  } catch (error) {
    // 处理超时错误
    if (error.name === 'AbortError') {
      console.error('[AI Service] 请求超时')

      // 超时也尝试重试
      if (retryCount < maxRetries) {
        console.log(`[AI Service] 请求超时，第${retryCount + 1}次重试...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        return callOpenAI(messages, temperature, max_tokens, retryCount + 1)
      }

      throw new Error('REQUEST_TIMEOUT')
    }

    // 特殊处理CORS错误
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      console.error('[AI Service] 可能是CORS或网络问题:', error)
      throw new Error('CORS_OR_NETWORK_ERROR')
    }

    // 处理JSON解析错误
    if (error instanceof SyntaxError) {
      console.error('[AI Service] JSON解析失败:', error)
      throw new Error('JSON_PARSE_ERROR')
    }

    // 处理其他错误
    console.error('[AI Service] 未知错误:', error)
    throw error
  }
}

// Helper to extract JSON from text
// Helper to extract JSON from text
function extractJsonFromText(text) {
  if (!text) return null;

  // Repair JSON string: fix literal newlines inside string values, etc.
  function repairJson(str) {
    // Step 1: Replace Chinese quotes
    str = str.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");

    // Step 2: Fix literal newlines inside JSON strings
    let result = '';
    let inString = false;
    let escape = false;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];

      if (escape) {
        result += ch;
        escape = false;
        continue;
      }

      if (ch === '\\') {
        result += ch;
        escape = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        result += ch;
        continue;
      }

      if (inString) {
        // Replace literal newlines/tabs inside strings with escaped versions
        if (ch === '\n') { result += '\\n'; continue; }
        if (ch === '\r') { continue; } // skip CR
        if (ch === '\t') { result += '\\t'; continue; }
        // Remove other control characters inside strings
        if (ch.charCodeAt(0) < 32) { continue; }
      }

      result += ch;
    }

    // Step 3: Remove trailing commas before } or ]
    result = result.replace(/,\s*([\]}])/g, '$1');

    return result;
  }

  function tryParse(str) {
    // Attempt 1: direct parse
    try {
      return JSON.parse(str);
    } catch (e) {
      // Attempt 2: repair then parse
      try {
        const repaired = repairJson(str);
        return JSON.parse(repaired);
      } catch (e2) {
        console.warn('[extractJsonFromText] Parse failed after repair:', e2.message);
        return null;
      }
    }
  }

  // Strategy: Manual extraction (Fallback if full parse fails)
  function manualExtract(txt) {
    console.log('[extractJsonFromText] Attempting manual regex extraction...');
    const result = { summary: '', lineAnalysis: [] };

    // Extract summary
    const summaryMatch = txt.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (summaryMatch) {
      result.summary = summaryMatch[1];
    } else {
      // Try to match summary without quotes if it's messy
      const simpleSummary = txt.match(/"summary"\s*:\s*"(.*?)"/s);
      if (simpleSummary) result.summary = simpleSummary[1];
    }

    // Extract lineAnalysis array roughly
    const lineAnalysisMatch = txt.match(/"lineAnalysis"\s*:\s*\[([\s\S]*?)\]/);
    if (lineAnalysisMatch) {
      const arrayContent = lineAnalysisMatch[1];
      // Regex to match objects { ... }
      // This is a simple approximation
      const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
      const objects = arrayContent.match(objectRegex) || [];

      result.lineAnalysis = objects.map(objStr => {
        try {
          // Try to parse individual object, repair if needed
          const repaired = repairJson(objStr);
          return JSON.parse(repaired);
        } catch (e) {
          // If strict parse fails, try regex extraction for fields
          const line = objStr.match(/"line"\s*:\s*(\d+)/)?.[1];
          const code = objStr.match(/"code"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
          const explanation = objStr.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];

          if (line && code) {
            return {
              line: parseInt(line),
              code: code,
              explanation: explanation || '解析失败'
            };
          }
          return null;
        }
      }).filter(item => item !== null);
    }

    if (result.summary || result.lineAnalysis.length > 0) {
      console.log('[extractJsonFromText] Manual extraction success:', result);
      return result;
    }
    return null;
  }

  // 1. Try standard markdown json block
  let match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (match) {
    const result = tryParse(match[1]);
    if (result) return result;
    // Fallback
    const manual = manualExtract(match[1]);
    if (manual) return manual;
  }

  // 2. Try generic code block
  match = text.match(/```\s*(\{[\s\S]*\})\s*```/);
  if (match) {
    const result = tryParse(match[1]);
    if (result) return result;
    const manual = manualExtract(match[1]);
    if (manual) return manual;
  }

  // 3. Extract from first '{' to last '}'
  const firstOpen = text.indexOf('{');
  const lastClose = text.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    const potentialJson = text.substring(firstOpen, lastClose + 1);
    const result = tryParse(potentialJson);
    if (result) return result;
    // Fallback
    const manual = manualExtract(potentialJson);
    if (manual) return manual;
  }

  return null;
}

/**
 * 调用混元大模型分析汇编代码
 * @param {string} code - 汇编代码
 * @returns {Promise<Object>} - 分析结果
 */
export async function analyzeAssemblyCode(code) {
  // 如果启用模拟数据，返回模拟分析结果
  if (USE_MOCK_DATA) {
    console.log('[AI Service] 使用模拟数据进行 AI 分析')
    return generateMockAnalysis(code)
  }

  // 解析代码获取有效行
  const codeLines = code.split('\n').map((l, i) => ({ num: i + 1, content: l.trim() })).filter(l => l.content && !l.content.startsWith(';'))

  const prompt = `请分析以下汇编代码，提供：
1. 代码的整体功能说明
2. 每一行指令的详细解释（用通俗易懂的语言）
3. 寄存器状态变化分析
4. 数据流动路径
5. 可能的优化建议

汇编代码：
\`\`\`assembly
${code}
\`\`\`

请以JSON格式返回，结构如下：
{
  "summary": "整体功能说明（简洁准确）",
  "lineAnalysis": [
    {"line": 1, "code": "MOV CX, 5", "explanation": "设置循环计数器", "humanReadable": "把5放进CX寄存器"}
  ],
  "registerFlow": ["AX -> BX", "内存 -> AX"],
  "optimization": "优化建议"
}

重要提示：
- line字段必须是数字行号（从1开始）
- code字段必须是对应行的源代码内容（如"MOV CX, 5"）
- explanation是技术解释
- humanReadable是大白话解释`

  try {
    console.log('[AI Service] 调用 API:', API_URL)
    console.log('[AI Service] 使用模型:', MODEL)

    const data = await callOpenAI([
      {
        role: 'system',
        content: '你是一位专业的汇编语言教学助手，擅长将复杂的汇编代码转化为通俗易懂的语言。'
      },
      {
        role: 'user',
        content: prompt
      }
    ], 0.7, 4000, 0)

    console.log('[AI Service] API 响应成功')

    // 解析返回的内容
    const content = data.choices?.[0]?.message?.content || ''

    // 尝试解析 JSON (Robustly)
    try {
      const result = extractJsonFromText(content);

      if (result) {
        // 规范化 lineAnalysis 数据
        if (result.lineAnalysis && Array.isArray(result.lineAnalysis)) {
          const originalLines = code.split('\n')

          result.lineAnalysis = result.lineAnalysis.map((item, idx) => {
            const lineValue = item.line
            const isCodeContent = typeof lineValue === 'string' &&
              /\b(MOV|ADD|SUB|INC|DEC|CMP|JMP|JE|JNE|PUSH|POP|CALL|RET|INT|LOOP|XOR|AND|OR|ASSUME|SEGMENT|ENDS|END|DB|DW|DD)\b/i.test(lineValue)

            if (isCodeContent) {
              return {
                line: idx + 1,
                code: lineValue.trim(),
                explanation: item.explanation || '',
                humanReadable: item.humanReadable || item.explanation || ''
              }
            } else {
              const lineNum = typeof lineValue === 'number' ? lineValue : idx + 1
              let codeContent = item.code
              if (!codeContent && lineNum > 0 && lineNum <= originalLines.length) {
                codeContent = originalLines[lineNum - 1].trim()
              }
              if (!codeContent && typeof lineValue === 'string') {
                codeContent = lineValue.trim()
              }

              return {
                line: lineNum,
                code: codeContent || '',
                explanation: item.explanation || '',
                humanReadable: item.humanReadable || item.explanation || ''
              }
            }
          })
        }
        return result
      }

      // 如果无法解析JSON，返回原始内容
      return {
        summary: '分析完成',
        rawContent: content,
        lineAnalysis: [],
        registerFlow: [],
        optimization: ''
      }
    } catch (parseError) {
      console.warn('[AI Service] JSON解析失败，返回原始内容:', parseError)
      return {
        summary: '分析完成（非结构化）',
        rawContent: content,
        lineAnalysis: [],
        registerFlow: [],
        optimization: ''
      }
    }
  } catch (error) {
    console.error('[AI Service] AI 分析失败:', error.message)
    console.warn('[AI Service] API调用失败，自动回退到模拟数据')
    return { ...generateMockAnalysis(code), _isMockData: true }
  }
}

/**
 * 生成 Mermaid 流程图数据（优化版，支持复杂代码）
 * @param {string} code - 汇编代码
 * @returns {Promise<Object>} - 流程图数据和警告信息
 */
export async function generateFlowchart(code) {
  // 如果启用模拟数据，返回模拟流程图
  if (USE_MOCK_DATA) {
    console.log('使用模拟数据生成流程图')
    return generateMockFlowchart(code)
  }

  // 计算代码复杂度
  const lines = code.split('\n').filter(line => line.trim() && !line.startsWith(';')).length
  const complexity = lines

  // 根据代码复杂度调整策略
  let mermaidCode = ''
  let warning = null

  if (complexity > 100) {
    warning = '代码较复杂，流程图将显示关键步骤而非每条指令'
  } else if (complexity > 50) {
    warning = '代码中等复杂，流程图将简化细节'
  }

  const prompt = `
# Role
你是一个资深的计算机科学教育专家和 Mermaid 流程图设计大师。

# Task
请阅读我提供的代码，并为其生成逻辑清晰、结构严谨的 Mermaid 流程图。图表的设计必须便于初学者理解算法的宏观控制流。

# Abstraction Rules (抽象规则)
绝对不要为每一行基础代码（如变量赋值、简单的算术运算）单独生成节点！请将代码划分为逻辑块。
重点展示以下 5 项：
1. 程序入口与出口
2. 主要功能模块（将连续的、同属一个逻辑步骤的基础操作合并为一个节点，描述以动词开头）
3. 条件分支和跳转逻辑
4. 循环结构（必须清晰标明循环的起点、终点和回退路径，回退路径使用虚线 -.-> 表示）
5. 关键的数据状态改变或 I/O 操作

# Strict Syntax Formatting (严格语法规范)
1. 图表方向：必须使用 graph TD（从上到下）。
2. 节点 ID：绝对不能包含空格或特殊字符！必须使用纯英文、数字及下划线组合。
3. 节点文本：节点上的描述文字必须用英文双引号 "" 严格包裹！
4. 括号配对（极其重要）：
   - 菱形节点使用大括号 { }，例如：DEC{"条件成立?"}
   - 胶囊/体育场节点使用括号嵌套 ([ ])，例如：START(["开始程序"])
   - 矩形节点使用中括号 [ ]，例如：OP["执行加法"]
5. 文本长度：节点描述文字必须简洁明了，中文不超过 15 个字。
6. 模块化：${complexity > 50 ? '如果代码超过 50 行，必须使用 subgraph 将不同的功能模块或子程序分组。' : '根据逻辑自然分组。'}

汇编代码（共 ${lines} 行有效指令）：
\`\`\`assembly
${code}
\`\`\`

请只返回完整的 Mermaid 代码块（以 \`\`\`mermaid 开头），不要包含任何解释性的文字：
\`\`\`mermaid
graph TD
    START(["开始"]) --> I1["初始化数据"]
    I1 --> DEC{"条件判断"}
    DEC -->|"真"| LOOP_BODY["执行循环体"]
    DEC -->|"假"| END_NODE(["结束"])
    LOOP_BODY -.-> DEC
\`\`\``

  try {
    const maxTokens = complexity > 100 ? 8000 : complexity > 50 ? 6000 : 4000
    const data = await callOpenAI([
      {
        role: 'system',
        content: '你是一位专业的流程图生成助手，擅长将代码转换为清晰、简洁的 Mermaid 流程图。对于复杂代码，会生成简化但准确的高层流程图。'
      },
      {
        role: 'user',
        content: prompt
      }
    ], 0.3, maxTokens, 0)

    const content = data.choices?.[0]?.message?.content || ''

    // 提取 Mermaid 代码
    let mermaidCode = ''
    const mermaidMatch = content.match(/```(?:mermaid)?\s*([\s\S]*?)\s*```/i)

    if (mermaidMatch) {
      mermaidCode = mermaidMatch[1].trim()
    } else {
      // 尝试直接查找 graph TD/LR 开头
      const graphStart = content.search(/graph\s+(TD|LR|TB|BT|RL)/i)
      if (graphStart !== -1) {
        mermaidCode = content.substring(graphStart).trim()
      } else {
        mermaidCode = content.trim()
      }
    }

    // 清理可能的 markdown 标记
    mermaidCode = mermaidCode.replace(/^```\w*\s*/, '').replace(/\s*```$/, '')

    // 验证 Mermaid 代码是否有效
    if (!mermaidCode || mermaidCode.length < 10 || !/graph\s+[A-Z]+/i.test(mermaidCode)) {
      throw new Error('生成的流程图代码无效')
    }

    console.log('[AI Service] 流程图生成成功')
    return {
      mermaidCode,
      warning,
      complexity
    }
  } catch (error) {
    console.error('[AI Service] 流程图生成失败:', error.message)
    console.warn('[AI Service] API调用失败，自动回退到模拟流程图数据')

    return { ...generateMockFlowchart(code), _isMockData: true }
  }
}

/**
 * 生成数据流可视化数据（优化版，支持复杂代码）
 * @param {string} code - 汇编代码
 * @returns {Promise<Object>} - 可视化数据和警告信息
 */
export async function generateDataFlow(code) {
  // 如果启用模拟数据，返回模拟数据流
  if (USE_MOCK_DATA) {
    console.log('使用模拟数据生成数据流')
    return generateMockDataFlow(code)
  }

  // 计算代码复杂度
  const lines = code.split('\n').filter(line => line.trim() && !line.startsWith(';')).length
  const complexity = lines

  let warning = null
  if (complexity > 80) {
    warning = '代码较复杂，数据流将显示主要数据变化'
  }

  const prompt = `请分析以下汇编代码的数据流动，返回结构化的 JSON 数据。

汇编代码（共 ${lines} 行有效指令）：
\`\`\`assembly
${code}
\`\`\`

${complexity > 80 ? '重要：代码较复杂，请追踪主要数据流动：\n1. 重点追踪关键寄存器（AX, BX, CX, DX 等）\n2. 显示关键内存位置的访问\n3. 只记录重要的数据转换操作（初始化、计算、条件判断等）\n4. 将连续的相同类型操作合并\n5. 最多返回 30 个关键步骤\n' : '请详细追踪所有数据流动。'}

请返回以下格式的 JSON：
{
  "nodes": [
    {"id": "AX", "type": "register", "value": "0"},
    {"id": "MEM_0x1000", "type": "memory", "address": "0x1000", "value": "42"}
  ],
  "edges": [
    {"from": "AX", "to": "BX", "operation": "MOV", "description": "复制数据", "step": 1},
    {"from": "MEM_0x1000", "to": "AX", "operation": "MOV", "description": "加载数据", "step": 2}
  ],
  "steps": [
    {
      "step": 1,
      "description": "初始化 AX 为 0",
      "nodes": ["AX"],
      "action": "SET"
    }
  ]
}

要求：
1. nodes：包含所有涉及的数据存储位置（寄存器和内存）
2. edges：数据流动的方向和操作
3. steps：按执行顺序列出的关键数据操作步骤
4. type 可以是 "register" 或 "memory"
5. description 要用通俗易懂的中文说明`

  try {
    const maxTokens = complexity > 80 ? 8000 : 6000
    const data = await callOpenAI([
      {
        role: 'system',
        content: '你是一位专业的数据流分析助手，擅长追踪代码中的数据流动。对于复杂代码，会提取关键数据变化，避免过于冗长。'
      },
      {
        role: 'user',
        content: prompt
      }
    ], 0.3, maxTokens)

    const content = data.choices?.[0]?.message?.content || ''

    // 提取 JSON
    const parsed = extractJsonFromText(content);

    if (parsed) {
      // 验证返回的数据结构
      if (!parsed.nodes || !Array.isArray(parsed.nodes) || !parsed.edges || !Array.isArray(parsed.edges)) {
        console.warn('返回的数据缺少 nodes 或 edges 数组:', parsed)
        throw new Error('返回的数据结构不完整')
      }

      console.log('[AI Service] 数据流分析成功')
      return {
        ...parsed,
        warning
      }
    }

    throw new Error('无法解析返回的数据')
  } catch (error) {
    console.error('[AI Service] 数据流分析失败:', error.message)
    console.warn('[AI Service] API调用失败，自动回退到模拟数据流')

    return { ...generateMockDataFlow(code), _isMockData: true }
  }
}

/**
 * 将机器指令翻译为人类可读的语言
 * @param {string} instruction - 汇编指令
 * @returns {Promise<string>} - 人类可读的解释
 */
export async function translateInstruction(instruction) {
  const prompt = `请将以下汇编指令翻译成通俗易懂的大白话，让完全不懂汇编的人也能理解：

指令：${instruction}

请用一句话解释，就像解释"把苹果从篮子A放到篮子B"这样简单。`

  try {
    const data = await callOpenAI([
      {
        role: 'system',
        content: '你是一位耐心的老师，擅长用生活中的例子解释复杂的计算机概念。'
      },
      {
        role: 'user',
        content: prompt
      }
    ], 0.8, 200)

    return data.choices?.[0]?.message?.content?.trim() || '无法翻译'
  } catch (error) {
    console.error('翻译失败:', error)
    return '翻译服务暂时不可用'
  }
}

/**
 * 完整语义分析 - 对整个代码进行深度分析
 * @param {string} code - 汇编代码
 * @returns {Promise<Object>} - 完整分析结果
 */
export async function fullSemanticAnalysis(code) {
  // 如果启用模拟数据，返回模拟完整分析
  if (USE_MOCK_DATA) {
    console.log('使用模拟数据生成完整语义分析')
    return generateMockFullAnalysis(code)
  }

  const prompt = `请对以下汇编代码进行完整的语义分析，提供详细的教学级解释。

汇编代码：
\`\`\`assembly
${code}
\`\`\`

请提供以下方面的分析（以JSON格式返回）：

1. **整体功能**：这段代码是做什么的？
2. **算法思路**：使用了什么算法或逻辑？
3. **数据结构**：使用了哪些数据结构？
4. **寄存器使用**：每个寄存器的作用是什么？
5. **内存操作**：如何读写内存？
6. **控制流程**：程序的执行顺序和分支逻辑
7. **输入输出**：如果有的话，输入是什么，输出是什么？
8. **关键点**：代码中最重要/最难理解的部分
9. **常见错误**：学习这段代码时容易犯的错误
10. **学习建议**：如何更好地理解这段代码

JSON格式：
{
  "overallFunction": "整体功能描述",
  "algorithm": "算法思路",
  "dataStructures": ["使用的数据结构"],
  "registerUsage": {
    "AX": "AX寄存器的作用",
    "BX": "BX寄存器的作用"
  },
  "memoryOperations": "内存操作说明",
  "controlFlow": "控制流程描述",
  "inputOutput": {
    "input": "输入说明",
    "output": "输出说明"
  },
  "keyPoints": ["关键点1", "关键点2"],
  "commonMistakes": ["常见错误1", "常见错误2"],
  "learningTips": ["学习建议1", "学习建议2"],
  "detailedExplanation": "逐行详细解释（用大白话）"
}`

  try {
    const data = await callOpenAI([
      {
        role: 'system',
        content: '你是一位资深的汇编语言教授，擅长将复杂的汇编代码转化为通俗易懂的教学内容。你的解释应该详细、准确，适合初学者理解。'
      },
      {
        role: 'user',
        content: prompt
      }
    ], 0.6, 5000, 0)

    const content = data.choices?.[0]?.message?.content || ''

    // 尝试解析 JSON
    try {
      const result = extractJsonFromText(content);

      if (result) {
        console.log('[AI Service] 完整语义分析成功')
        return result
      }

      return {
        overallFunction: '分析完成',
        rawContent: content,
        algorithm: '',
        dataStructures: [],
        registerUsage: {},
        memoryOperations: '',
        controlFlow: '',
        inputOutput: { input: '', output: '' },
        keyPoints: [],
        commonMistakes: [],
        learningTips: [],
        detailedExplanation: content
      }
    } catch (parseError) {
      console.warn('[AI Service] JSON解析失败:', parseError)
      return {
        overallFunction: '分析完成（非结构化）',
        rawContent: content,
        detailedExplanation: content
      }
    }
  } catch (error) {
    console.error('[AI Service] 完整语义分析失败:', error.message)
    console.warn('[AI Service] API调用失败，自动回退到模拟完整语义分析数据')
    return { ...generateMockFullAnalysis(code), _isMockData: true }
  }
}

/**
 * 获取光标位置的内联补全建议
 * @param {string} code - 当前代码
 * @param {number} cursorIndex - 光标在代码中的索引
 * @returns {Promise<string>} - 补全文本（可为空）
 */
export async function getInlineSuggestion(code, cursorIndex = 0, signal = null) {
  if (USE_MOCK_DATA || !API_KEY) return ''
  if (!code || typeof code !== 'string') return ''

  const safeIndex = Math.max(0, Math.min(cursorIndex, code.length))
  const contextBefore = code.slice(Math.max(0, safeIndex - 400), safeIndex)
  const contextAfter = code.slice(safeIndex, Math.min(code.length, safeIndex + 100))

  const prompt = `你是高级代码补全引擎。当前正在编辑16位汇编代码，<CURSOR>是光标位置。
请预测并输出**应该直接插入到光标处的后续代码片段**。

核心纪律：
1. **绝对禁止**使用 Markdown 代码块（如 \`\`\`assembly）！直接输出纯文本代码。
2. **绝对禁止**重复上下文中已经存在的代码。只输出<CURSOR>处即将新增的全新代码。
3. 必须保持正确的汇编语言缩进（空格）。
4. 只能预测接下来1~2行代码，不要长篇大论。
5. 不要输出任何解释语句。

下为代码上下文：
${contextBefore}<CURSOR>${contextAfter}`

  try {
    const data = await callOpenAI([
      {
        role: 'system',
        content: '你是一个严格遵守纪律的内联代码补全机器人，只吐出紧接光标后的纯汇编文本，无视所有Markdown格式要求。'
      },
      {
        role: 'user',
        content: prompt
      }
    ], 0.1, 40, 0, signal)

    let content = data.choices?.[0]?.message?.content || ''

    // 严厉的清道夫过滤：即便AI仍旧吐出Markdown，也将其剔除
    // 把 ````assembly\n` 甚至是由于 token 被截断导致仅仅只有 `assembly\n` 都会清理掉
    content = content.replace(/^```(?:assembly|asm)?\s*\n?/i, '')
    // 如果模型只是吐出了 assembly 单词然后换行
    if (content.toLowerCase().startsWith('assembly\n')) {
      content = content.substring(9).trimStart()
    }
    content = content.replace(/`/g, '') // 剥离任何反引号
    content = content.replace(/\r/g, '')

    // 方案4：结构化输出与后处理（自动缩进对齐增强版）
    // 如果光标在行的开头（即前面没有非空字符），AI返回的代码应该按照上一行的缩进进行对齐
    const lastNewlineIdx = contextBefore.lastIndexOf('\n')
    const currentLinePrefix = lastNewlineIdx === -1 ? contextBefore : contextBefore.slice(lastNewlineIdx + 1)

    // 如果当前行目前全是空白字符（意味着我们在行首或行中但没有代码）
    if (/^\s*$/.test(currentLinePrefix)) {
      const lines = contextBefore.split('\n')
      let lastIndent = ''

      // 往回找最近一个有内容的行，提取它的缩进空格
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim()) {
          const match = lines[i].match(/^\s*/)
          if (match) lastIndent = match[0]
          break
        }
      }

      // 无论内容是多行还是单行，统一应用缩进
      const aiLines = content.split('\n')
      content = aiLines.map((l, index) => {
        // 第一行如果用户已经有缩进前缀了，我们要看是否需要补足剩余缩进？
        // 其实只需要判断 AI 本身有没有缩进，如果没有，加上 lastIndent。
        // 但我们要减去 currentLinePrefix 已经含有的长度，避免叠加。
        // 为简单起见：如果 AI 原本这行没有足够的缩进，重置它的缩进为上一行级别
        const isAiLineEmpty = !l.trim()
        if (isAiLineEmpty) return l

        const aiMatch = l.match(/^\s*/)
        const aiIndent = aiMatch ? aiMatch[0] : ''

        if (index === 0) {
          // 第一行：因为 textarea 会直接把 content 拼在光标后，如果我们的光标前面已经有 currentLinePrefix
          // 我们补齐需要的差值即可。如果当前打好的空格不够 lastIndent，我们补齐。
          if (currentLinePrefix.length < lastIndent.length && aiIndent.length === 0) {
            return lastIndent.slice(currentLinePrefix.length) + l.trimStart()
          }
          if (aiIndent.length === 0) return l // 已经够了不需要加
          return l
        } else {
          // 其它行：如果是全新的行，且AI没有加缩进，我们给它加上全局的缩进
          if (aiIndent.length === 0) {
            return lastIndent + l
          }
        }
        return l
      }).join('\n')
    }

    if (content.length > 300) {
      content = content.slice(0, 300)
    }

    return content
  } catch (error) {
    if (error?.message === 'API_KEY_EMPTY') {
      return ''
    }
    console.warn('[AI Service] 内联补全失败:', error)
    return ''
  }
}

/**
 * 自动为代码添加注释
 * @param {string} code - 原始汇编代码
 * @returns {Promise<string>} - 添加注释后的代码
 */
export async function addCommentsToCode(code) {
  if (USE_MOCK_DATA || !API_KEY) {
    console.log('[AI Service] 使用模拟数据生成代码注释');
    // 简单的模拟注释生成逻辑（按行追加示例注释）
    return code.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) return line;
      if (trimmed.includes('MOV ')) return line.padEnd(30, ' ') + '; [AI模拟] 数据传送指令';
      if (trimmed.includes('ADD ')) return line.padEnd(30, ' ') + '; [AI模拟] 执行加法运算';
      if (trimmed.includes('SUB ')) return line.padEnd(30, ' ') + '; [AI模拟] 执行减法运算';
      if (trimmed.includes('INT ')) return line.padEnd(30, ' ') + '; [AI模拟] 触发系统中断调用';
      if (trimmed.includes('LOOP')) return line.padEnd(30, ' ') + '; [AI模拟] 循环控制指令';
      return line.padEnd(30, ' ') + '; [AI模拟] 常规汇编指令';
    }).join('\n');
  }

  const prompt = `请为以下汇编代码添加详细的中文注释。要求：

1. 在代码开头添加整体功能说明
2. 为每一行或每一组相关指令添加注释
3. 注释要通俗易懂，使用大白话
4. 保持原有代码格式不变，只在行尾或行首添加注释
5. 对于关键步骤，详细说明数据变化

原始代码：
\`\`\`assembly
${code}
\`\`\`

请返回添加注释后的完整代码，保持原有缩进和格式。`

  try {
    const data = await callOpenAI([
      {
        role: 'system',
        content: '你是一位专业的汇编语言助教，擅长为代码添加清晰、易懂的中文注释。你的注释应该帮助初学者理解代码的每个步骤。'
      },
      {
        role: 'user',
        content: prompt
      }
    ], 0.5, 4000)

    const content = data.choices?.[0]?.message?.content || ''

    // 提取代码块
    const codeMatch = content.match(/```assembly\n([\s\S]*?)\n```/) ||
      content.match(/```\n([\s\S]*?)\n```/)

    if (codeMatch) {
      return codeMatch[1].trim()
    }

    // 如果没有代码块标记，返回整个内容
    return content.trim()
  } catch (error) {
    console.error('添加注释失败:', error)
    throw error
  }
}

/**
 * AI 对话接口 - 扮演汇编代码助手角色
 * @param {string} userMessage - 用户消息
 * @param {Array} conversationHistory - 对话历史
 * @param {string} currentCode - 当前代码（可选）
 * @returns {Promise<string>} - AI 回复
 */
export async function chatWithAI(userMessage, conversationHistory = [], currentCode = '', signal = null) {
  // 构建系统提示词
  const systemPrompt = `你是一位资深的汇编语言教学助手，名为"CoreLogic AI"。你的职责是：

1. **代码分析**：能够分析用户提供的汇编代码，解释其功能、算法逻辑、数据流动等
2. **指令解释**：详细解释各类汇编指令的功能、用法和注意事项
3. **概念讲解**：用通俗易懂的语言讲解汇编语言的概念（寄存器、内存、栈等）
4. **问题解答**：耐心回答用户关于汇编语言的任何问题
5. **教学指导**：提供学习建议、代码优化建议、常见错误提示

**回复风格**：
- 友好、耐心、专业
- 使用简洁明了的中文
- 如果用户要求你“写一段程序”、“修复bug”或“修改代码”，你必须将完整的最终代码包裹在\`\`\`action\`\`\`代码块中，这样前端才能识别并提供一键应用功能。例如：
\`\`\`action
CODE SEGMENT
    MOV AX, 0
CODE ENDS
\`\`\`
- 避免过于技术化的术语，必要时用生活类比
- 如果用户问的是代码相关的问题，结合当前代码进行解答

**当前代码上下文**：
${currentCode ? `\`\`\`assembly\n${currentCode}\n\`\`\`\n` : '（当前没有代码）'}

**注意事项**：
- 如果用户问的问题与当前代码相关，请引用代码中的具体内容
- 如果用户询问代码功能，先概述整体功能，再逐段或逐行解释
- 如果你要给出可以直接运行/替换的最终代码，务必使用 \`\`\`action\`\`\` 包裹它，而不是 \`\`\`assembly\`\`\`。`

  // 构建消息历史
  const messages = [
    {
      role: 'system',
      content: systemPrompt
    }
  ]

  // 添加历史对话（限制最近10条以避免token超限）
  const recentHistory = conversationHistory.slice(-10)
  messages.push(...recentHistory)

  // 添加当前用户消息
  messages.push({
    role: 'user',
    content: userMessage
  })

  try {
    const data = await callOpenAI(messages, 0.7, 2000, 0, signal)
    return data.choices?.[0]?.message?.content || '抱歉，我暂时无法回答这个问题。'
  } catch (error) {
    console.error('AI对话失败:', error)
    throw error
  }
}

export default {
  analyzeAssemblyCode,
  generateFlowchart,
  generateDataFlow,
  translateInstruction,
  fullSemanticAnalysis,
  getInlineSuggestion,
  addCommentsToCode,
  chatWithAI
}
