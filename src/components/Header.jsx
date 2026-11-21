import React from 'react'
import './Header.css'

function Header({ isPro, onUpgrade, activeMode = 'student', onModeChange }) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <div className="logo-icon" aria-hidden="true">&gt;_</div>
          <div className="logo-text">
            <h1>汇编程</h1>
            <span className="logo-subtitle">8086 汇编工作台</span>
          </div>
        </div>
        <nav className="nav">
          <button
            type="button"
            className={`nav-link ${activeMode === 'student' ? 'active' : ''}`}
            aria-pressed={activeMode === 'student'}
            onClick={() => onModeChange?.('student')}
          >
            汇编模式
          </button>
          <button
            type="button"
            className={`nav-link ${activeMode === 'teacher' ? 'active' : ''}`}
            aria-pressed={activeMode === 'teacher'}
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
