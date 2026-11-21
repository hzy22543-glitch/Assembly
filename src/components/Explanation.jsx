import React from 'react'
import './Explanation.css'

function Explanation({ explanations, currentLine }) {
  // 按类型分组
  const grouped = explanations.reduce((acc, exp) => {
    if (!acc[exp.type]) acc[exp.type] = []
    acc[exp.type].push(exp)
    return acc
  }, {})

  const getTypeIcon = (type) => {
    switch (type) {
      case 'instruction': return '📘'
      case 'label': return '🏷️'
      case 'comment': return '💬'
      default: return '📝'
    }
  }

  const getTypeTitle = (type) => {
    switch (type) {
      case 'instruction': return '指令解释'
      case 'label': return '标签说明'
      case 'comment': return '注释'
      default: return '其他'
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'instruction': return 'var(--accent-blue)'
      case 'label': return 'var(--accent-purple)'
      case 'comment': return 'var(--text-secondary)'
      default: return 'var(--text-primary)'
    }
  }

  return (
    <div className="explanation card">
      <div className="card-header">
        <span className="card-title">
          <span>🧠</span>
          语义解释
        </span>
      </div>
      <div className="card-body explanation-body">
        {explanations.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🤔</span>
            <p>点击"解析代码"查看详细解释</p>
          </div>
        ) : (
          <div className="explanation-list">
            {explanations.map((exp, idx) => (
              <div
                key={idx}
                className={`explanation-item ${exp.line === currentLine ? 'active' : ''}`}
                style={{ borderLeftColor: getTypeColor(exp.type) }}
              >
                <div className="explanation-header">
                  <span className="explanation-icon">{getTypeIcon(exp.type)}</span>
                  <span className="explanation-type" style={{ color: getTypeColor(exp.type) }}>
                    {getTypeTitle(exp.type)}：
                  </span>
                  <span className="line-number">第 {exp.line} 行</span>
                </div>
                <p className="explanation-text">{exp.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Explanation
