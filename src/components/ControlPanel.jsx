import './ControlPanel.css'

function ControlPanel({
  onParse, onRun, onStep, onStepBack, onStepChange, onReset, onTogglePlay, onRunWeb, onShowConsole,
  backendCompileLoading, isStaticSite, isPlaying, canStep, speed, onSpeedChange,
  currentStep, totalSteps, activeTab, onTabChange, demoHighlightStep
}) {
  return (
    <section className="control-panel" aria-label="运行控制">
      <div className="mode-tabs" aria-label="工作区模式">
        <button className="mode-tab" aria-pressed={activeTab === 'simulation'} onClick={() => onTabChange('simulation')}>
          本地模拟
        </button>
        <button className="mode-tab" aria-pressed={activeTab === 'ai'} onClick={() => onTabChange('ai')}>
          AI 分析
        </button>
      </div>
      {activeTab === 'simulation' && (
        <>
          <div className="execution-actions">
            <button className={demoHighlightStep === 0 ? 'demo-highlight-target' : ''} onClick={onParse}>解析</button>
            <button className="action-run" onClick={onRun}>▶ <span>运行</span></button>
            <button className={demoHighlightStep === 1 ? 'demo-highlight-target' : ''} onClick={onStep} disabled={!canStep} title="手动单步">单步</button>
            <button onClick={onStepBack} disabled={currentStep === 0} title="回退一步">后退</button>
            <button onClick={onTogglePlay} disabled={totalSteps < 2} aria-pressed={isPlaying}>{isPlaying ? '暂停' : '自动'}</button>
            <button onClick={onReset} disabled={!totalSteps}>重置</button>
            <button disabled={isStaticSite || backendCompileLoading} onClick={onRunWeb} title={isStaticSite ? '实机编译需要启动后端沙箱' : '通过后端编译并运行'}>
              {backendCompileLoading ? '编译中…' : '实机'}
            </button>
            <button onClick={onShowConsole} title="打开/关闭控制台">控制台</button>
          </div>
          <div className={`execution-progress ${demoHighlightStep === 2 ? 'demo-highlight-target' : ''}`}>
            <label htmlFor="step-slider">执行进度</label>
            <input id="step-slider" className="step-slider" type="range" min="0" max={Math.max(totalSteps - 1, 0)}
              value={currentStep} disabled={totalSteps < 2} onChange={event => onStepChange(Number(event.target.value))} />
            <output className="step-count" htmlFor="step-slider">{totalSteps ? currentStep + 1 : 0} / {totalSteps}</output>
            <label className="speed-control">
              <span>速度</span>
              <select value={speed} onChange={event => onSpeedChange(Number(event.target.value))}>
                <option value={1500}>慢速</option>
                <option value={1000}>中速</option>
                <option value={400}>快速</option>
              </select>
            </label>
          </div>
        </>
      )}
    </section>
  )
}

export default ControlPanel
