import './Explanation.css'

const labels = {
  instruction: '指令',
  label: '标签',
  comment: '注释',
}

function Explanation({ explanations, currentLine }) {
  const current = explanations.find(item => item.line === currentLine && item.type === 'instruction')
    ?? explanations.find(item => item.line === currentLine)

  return (
    <section className="explanation card">
      <div className="card-header">
        <h2 className="card-title">指令说明</h2>
        {current && <span className="explanation-line">第 {currentLine} 行</span>}
      </div>
      <div className="card-body explanation-body">
        <p className="explanation-current">{current?.text ?? (explanations.length ? '单步执行可查看当前指令。' : '点击「解析」查看指令说明。')}</p>
        {explanations.length > 0 && (
          <details className="explanation-details">
            <summary>查看全部说明</summary>
            <ul className="explanation-list">
              {explanations.map((item, index) => (
                <li className={item.line === currentLine ? 'active' : undefined} key={index}>
                  <span>第 {item.line} 行 · {labels[item.type] ?? '说明'}</span>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}

export default Explanation
