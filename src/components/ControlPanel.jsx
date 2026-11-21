import React from 'react'
import './ControlPanel.css'

function ControlPanel({
  onParse,
  onAIAnalysis,
  onGenerateFlowchart,
  onStep,
  onStepBack,
  onStepChange,
  onReset,
  onTogglePlay,
  onRun,

  onRunBackend, // Keeping prop for now to avoid break, but will remove from UI
  onRunWeb,
  backendCompileLoading = false,
  onShowConsole,
  isPlaying,
  canStep,
  speed,
  onSpeedChange,
  currentStep,
  totalSteps,
  aiLoading,
  activeTab,
  onTabChange,
  demoHighlightStep = null
}) {
  return (
    <div className="control-panel card">
      <div className="control-left">
        {/* 模式切换标签 */}
        <div className="mode-tabs">
          <button
            className={`mode-tab ${activeTab === 'simulation' ? 'active' : ''}`}
            onClick={() => onTabChange('simulation')}
          >
            🔧 本地模拟
          </button>
          <button
            className={`mode-tab ${activeTab === 'ai' ? 'active' : ''} ${demoHighlightStep === 3 ? 'demo-highlight-target' : ''}`}
            onClick={() => onTabChange('ai')}
          >
            🤖 AI分析
          </button>
        </div>

        <div className="divider"></div>

        {activeTab === 'simulation' && (
          <>
            <button className={`btn btn-primary ${demoHighlightStep === 0 ? 'demo-highlight-target' : ''}`} onClick={onParse}>
              <span>🔍</span>
              解析
            </button>

            <div className="divider"></div>

            <button className="btn btn-success" onClick={onRun} title="使用 JS 模拟器直接运行到结束">
              <span>🚀</span>
              运行
            </button>

            <button
              className="btn btn-primary"
              onClick={onRunWeb}
              disabled={backendCompileLoading}
              title="使用后端真实环境编译并在网页运行 (WASM)"
            >
              <span>{backendCompileLoading ? '⏳' : '⚙️'}</span>
              {backendCompileLoading ? '编译中…' : '实机'}
            </button>

            <button className="btn btn-secondary" onClick={onShowConsole} title="打开/关闭控制台">
              <span>🖥️</span>
            </button>

            <button
              className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
              onClick={onTogglePlay}
              disabled={totalSteps === 0}
              title="自动单步步进"
            >
              <span>{isPlaying ? '⏸️' : '▶️'}</span>
              {isPlaying ? '暂停' : '自动'}
            </button>

            <button
              className="btn btn-primary"
              onClick={onStepBack}
              disabled={currentStep === 0 || totalSteps === 0}
              title="回退一步"
            >
              <span>⏮️</span>
              后退
            </button>

            <button
              className={`btn btn-primary ${demoHighlightStep === 1 ? 'demo-highlight-target' : ''}`}
              onClick={onStep}
              disabled={!canStep}
              title="手动单步"
            >
              <span>⏭️</span>
              单步
            </button>

            <button className="btn btn-secondary" onClick={onReset}>
              <span>🔄</span>
              重置
            </button>
          </>
        )}

        <div className="divider"></div>
      </div>

      <div className="control-right">
        {activeTab === 'simulation' && totalSteps > 0 && (
          <div className={`step-info ${demoHighlightStep === 2 ? 'demo-highlight-target demo-highlight-box' : ''}`}>
            <span className="step-label">执行进度</span>
            <div className="step-progress">
              <input
                type="range"
                className="step-slider"
                min="0"
                max={totalSteps > 0 ? totalSteps - 1 : 0}
                value={currentStep}
                onChange={(e) => onStepChange && onStepChange(Number(e.target.value))}
              />
            </div>
            <span className="step-count">{currentStep + 1} / {totalSteps}</span>
          </div>
        )}

        {activeTab === 'simulation' && (
          <div className="speed-control">
            <span>⚡</span>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={speed}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
            />
            <span>{speed}ms</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default ControlPanel
