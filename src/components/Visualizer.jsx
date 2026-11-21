import { useState } from 'react'
import './Visualizer.css'

const GENERAL = [
  ['AX', '累加器'], ['BX', '基址寄存器'], ['CX', '计数寄存器'], ['DX', '数据寄存器'],
  ['SP', '栈指针'], ['BP', '基址指针'], ['SI', '源变址'], ['DI', '目的变址'],
]
const SEGMENTS = [['CS', '代码段'], ['DS', '数据段'], ['SS', '栈段'], ['ES', '附加段']]
const FLAGS = [['ZF', 'z', '零标志'], ['SF', 'sf', '符号标志'], ['OF', 'of', '溢出标志'], ['CF', 'cf', '进位标志']]
const BYTE_COLUMNS = [0, 1, 2, 3, 4, 5, 6, 7]
const MEMORY_ROWS = [0, 8, 16, 24]
const HEX_ADDRESS = /^(?:0x)?[0-9a-f]{1,4}h?$/i

function hex(value, digits = 4) {
  return (value ?? 0).toString(16).toUpperCase().padStart(digits, '0')
}

function Register({ name, description, state, highlighted = false }) {
  const key = name.toLowerCase()
  return (
    <div
      className={`register-box ${state.activeRegisters?.includes(key) ? 'active' : ''} ${highlighted ? 'demo-highlight-target' : ''}`}
      title={description}
    >
      <span className="register-name">{name}</span>
      <span className="register-value">{hex(state[key])}h</span>
    </div>
  )
}

function MemoryView({ state }) {
  const [address, setAddress] = useState('')
  const [selectedAddress, setSelectedAddress] = useState(null)
  const invalidAddress = address !== '' && !HEX_ADDRESS.test(address.trim())
  const windowAddress = selectedAddress ?? state.sp
  const start = Math.min(0xFFE0, windowAddress - (windowAddress % 8))
  const activeBytes = new Set(state.activeMemory)

  const locateAddress = (event) => {
    event.preventDefault()
    if (invalidAddress) return
    setSelectedAddress(address.trim() ? Number.parseInt(address.trim(), 16) : null)
  }

  return (
    <section className="card memory-view">
      <div className="card-header">
        <h2 className="card-title">内存映射</h2>
        <button
          type="button"
          className="memory-stack-button"
          aria-pressed={selectedAddress === null}
          onClick={() => { setAddress(''); setSelectedAddress(null) }}
        >跟随 SP</button>
      </div>
      <form className="memory-lookup" onSubmit={locateAddress}>
        <input
          aria-label="十六进制内存地址"
          aria-invalid={invalidAddress}
          value={address}
          onChange={event => setAddress(event.target.value)}
          placeholder="十六进制地址"
          maxLength={7}
          spellCheck="false"
          autoComplete="off"
        />
        <button type="submit" disabled={invalidAddress || !address.trim()}>查看</button>
      </form>
      {invalidAddress && <p className="memory-error">请输入 0000 至 FFFF 的十六进制地址。</p>}
      <table className="memory-table" aria-label="内存字节">
        <thead>
          <tr><th scope="col">地址</th>{BYTE_COLUMNS.map(offset => <th scope="col" key={offset}>{hex(offset, 2)}</th>)}</tr>
        </thead>
        <tbody>
          {MEMORY_ROWS.map(row => (
            <tr key={row}>
              <th scope="row">{hex(start + row)}h</th>
              {BYTE_COLUMNS.map(offset => {
                const location = start + row + offset
                return (
                  <td
                    key={location}
                    className={location === windowAddress || activeBytes.has(location) ? 'memory-active' : undefined}
                    title={`${hex(location)}h${location === state.sp ? ' · SP' : ''}`}
                  >{hex(state.memory[location], 2)}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default function Visualizer({ state, demoHighlightRegisters, children }) {
  const instruction = state.currentInstruction
  return (
    <div className="visualizer">
      <section className="card registers-panel">
        <div className="card-header">
          <h2 className="card-title">CPU 寄存器</h2>
          {instruction && <code className="instruction-code" title={`第 ${state.lineNumber} 行`}>
            {instruction.mnemonic} {instruction.args.join(', ')}
          </code>}
        </div>
        <div className="registers-body">
          <div className="registers-grid" aria-label="通用寄存器">
            {GENERAL.map(([name, description]) => <Register key={name} name={name} description={description}
              state={state} highlighted={demoHighlightRegisters && ['AX', 'BX', 'CX'].includes(name)} />)}
          </div>
          <div className="registers-grid segment-grid" aria-label="段寄存器">
            {SEGMENTS.map(([name, description]) => <Register key={name} name={name} description={description} state={state} />)}
          </div>
          <div className="flags-row">
            <Register name="IP" description="指令指针" state={state} />
            <div className="flag-grid" aria-label="标志位">
              {FLAGS.map(([flag, key, description]) => (
                <span key={flag} title={description}
                  className={`flag-box ${state.flags?.[key] ? 'set' : ''} ${demoHighlightRegisters && flag === 'ZF' ? 'demo-highlight-target' : ''}`}>
                  {flag} <strong>{state.flags?.[key] ? 1 : 0}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
      <div className="inspection-grid">
        <MemoryView state={state} />
        {children}
      </div>
    </div>
  )
}
