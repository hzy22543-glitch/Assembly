import React from 'react'
import './Visualizer.css'

function Visualizer({ state, demoHighlightRegisters = false }) {
  if (!state) return null

  const registers16 = [
    { name: 'AX', value: state.ax, desc: '累加器' },
    { name: 'BX', value: state.bx, desc: '基址寄存器' },
    { name: 'CX', value: state.cx, desc: '计数寄存器' },
    { name: 'DX', value: state.dx, desc: '数据寄存器' },
    { name: 'SP', value: state.sp, desc: '栈指针' },
    { name: 'BP', value: state.bp, desc: '基址指针' },
    { name: 'SI', value: state.si, desc: '源变址' },
    { name: 'DI', value: state.di, desc: '目的变址' },
  ]

  const segmentRegisters = [
    { name: 'CS', value: state.cs, desc: '代码段' },
    { name: 'DS', value: state.ds, desc: '数据段' },
    { name: 'SS', value: state.ss, desc: '栈段' },
    { name: 'ES', value: state.es, desc: '附加段' },
  ]

  const ipRegister = [
    { name: 'IP', value: state.ip, desc: '指令指针' },
  ]

  const flags = [
    { name: 'ZF', value: state.flags?.z, desc: '零标志' },
    { name: 'SF', value: state.flags?.sf, desc: '符号标志' },
    { name: 'OF', value: state.flags?.of, desc: '溢出标志' },
    { name: 'CF', value: state.flags?.cf, desc: '进位标志' },
  ]

  // 显示内存的一部分（栈附近），按 word 粒度显示
  const displayMemory = () => {
    const start = Math.max(0, state.sp - 16)
    const end = Math.min(65534, start + 32)
    const cells = []

    for (let i = start; i < end; i += 2) {
      const isStack = i >= state.sp && i < state.sp + 16
      const isActive = state.activeMemory?.includes(i) || state.activeMemory?.includes(i + 1)

      // 合并相邻两个字节为 word（小端序：低字节在低地址，高字节在高地址）
      const low = Number(state.memory[i]) || 0
      const high = Number(state.memory[i + 1]) || 0
      const wordValue = (high << 8) | low

      cells.push(
        <div
          key={i}
          className={`memory-cell ${isStack ? 'stack' : ''} ${isActive ? 'active' : ''}`}
        >
          <div className="memory-address">0x{i.toString(16).toUpperCase().padStart(4, '0')}</div>
          <div className="memory-value">
            {wordValue.toString(16).toUpperCase().padStart(4, '0')}
          </div>
          {i === state.sp && <div className="stack-marker">← SP</div>}
        </div>
      )
    }

    return cells
  }

  return (
    <div className="visualizer">
      {/* 当前指令 */}
      {state.currentInstruction && (
        <div className="current-instruction card">
          <div className="card-header">
            <span className="card-title">
              <span>▶️</span>
              当前执行
            </span>
            <span className="line-badge">第 {state.lineNumber} 行</span>
          </div>
          <div className="card-body">
            <code className="instruction-code">
              {state.currentInstruction.mnemonic} {state.currentInstruction.args.join(', ')}
            </code>
          </div>
        </div>
      )}

      {/* 寄存器状态 */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <span>🔧</span>
            CPU 寄存器
          </span>
        </div>
        <div className="card-body">
          {/* 通用寄存器 */}
          <div className="registers-section">
            <h4>通用寄存器</h4>
            <div className="registers-grid">
              {registers16.map(reg => (
                <div
                  key={reg.name}
                  className={`register-box ${state.activeRegisters?.includes(reg.name.toLowerCase()) ? 'active' : ''} ${demoHighlightRegisters && ['AX', 'BX', 'CX'].includes(reg.name) ? 'demo-highlight-target' : ''}`}
                >
                  <div className="register-name">{reg.name}</div>
                  <div className="register-value">
                    0x{(Number(reg.value) || 0).toString(16).toUpperCase().padStart(4, '0')}
                  </div>
                  <div className="register-desc">{reg.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 段寄存器 */}
          <div className="registers-section">
            <h4>段寄存器</h4>
            <div className="registers-grid registers-grid-small">
              {segmentRegisters.map(reg => (
                <div
                  key={reg.name}
                  className={`register-box register-box-small ${state.activeRegisters?.includes(reg.name.toLowerCase()) ? 'active' : ''}`}
                >
                  <div className="register-name">{reg.name}</div>
                  <div className="register-value">
                    0x{(Number(reg.value) || 0).toString(16).toUpperCase().padStart(4, '0')}
                  </div>
                  <div className="register-desc">{reg.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* IP 寄存器 与 标志位 (Flattened for exact height alignment) */}
          <div className="registers-section ip-flags-container">
            <h4>指令指针与标志位 (IP & FLAGS)</h4>
            <div className="ip-flags-row">
              {/* IP Register Box */}
              {ipRegister.map(reg => (
                <div
                  key={reg.name}
                  className={`register-box register-box-small ${state.activeRegisters?.includes(reg.name.toLowerCase()) ? 'active' : ''}`}
                >
                  <div className="register-name">{reg.name}</div>
                  <div className="register-value">
                    0x{(Number(reg.value) || 0).toString(16).toUpperCase().padStart(4, '0')}
                  </div>
                  <div className="register-desc">{reg.desc}</div>
                </div>
              ))}

              {/* Flag Boxes */}
              {flags.map(flag => (
                <div
                  key={flag.name}
                  className={`flag-box ${flag.value ? 'set' : ''} ${demoHighlightRegisters && flag.name === 'ZF' ? 'demo-highlight-target' : ''}`}
                  title={flag.desc}
                >
                  <span className="flag-name">{flag.name}</span>
                  <span className="flag-value">{flag.value ? '1' : '0'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 内存视图 */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <span>💾</span>
            内存映射 (MEMORY MAP)
          </span>
        </div>
        <div className="card-body">
          <div className="memory-grid">
            {displayMemory()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Visualizer
