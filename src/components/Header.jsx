import React from 'react'
import './Header.css'

function Header({ isPro, onUpgrade, activeMode = 'student', onModeChange }) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <div className="logo-icon">⚡</div>
          <div className="logo-text">
            <h1>硬核代码助教 <small style={{ fontSize: '10px', opacity: 0.5, marginLeft: '5px' }}>v1.0.5</small></h1>
            <span className="logo-subtitle">Assembly Visualizer</span>
          </div>
        </div>
        <nav className="nav">
          <button
            type="button"
            className={`nav-link ${activeMode === 'student' ? 'active' : ''}`}
            onClick={() => onModeChange?.('student')}
          >
            汇编模式
          </button>
          <button
            type="button"
            className={`nav-link ${activeMode === 'teacher' ? 'active' : ''}`}
            onClick={() => onModeChange?.('teacher')}
          >
            教师端
          </button>
          
          {isPro ? (
            <div className="pro-status-badge">
              <span className="pro-icon">👑</span> Pro会员
            </div>
          ) : (
            <button className="btn-upgrade" onClick={onUpgrade}>
              升级 Pro
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

export default Header
