import React from 'react'
import './DemoGuide.css'

function DemoGuide({
  programs,
  activeProgramKey,
  currentStep,
  isOpen,
  shouldHighlightChoice = false,
  onSelectProgram,
  onNext,
  onPrev,
  onClose
}) {
  const steps = [
    '第一步：点击解析，系统会预计算执行路径。',
    '第二步：点击单步执行，观察 AX、BX、CX、ZF 的变化。',
    '第三步：点击时间轴，回到任意历史步骤。',
    '第四步：点击 AI 分析，生成逐行注释和流程图。',
    '第五步：点击底部的 AI 对话按钮，打开 AI 对话框进行提问学习。'
  ]

  return (
    <section className="demo-guide">
      <div className="demo-guide-header">
        <div>
          <span className="demo-guide-kicker">Demo 流程</span>
          <h2>选择一个示例程序</h2>
        </div>
        {activeProgramKey && (
          <span className="demo-guide-active">
            当前：{programs.find(program => program.key === activeProgramKey)?.label}
          </span>
        )}
      </div>

      <div className="demo-program-list">
        {programs.map(program => (
          <button
            key={program.key}
            type="button"
            className={`demo-program-btn ${program.key === activeProgramKey ? 'active' : ''} ${shouldHighlightChoice ? 'demo-highlight-target' : ''}`}
            onClick={() => onSelectProgram(program.key)}
          >
            {program.label}
          </button>
        ))}
      </div>

      {isOpen && (
        <div className="demo-tip" role="status" aria-live="polite">
          {!activeProgramKey && (
            <p className="demo-start-tip">
              先点击上方任意示例程序，系统会自动载入代码并展开完整演示流程。
            </p>
          )}

          <div className="demo-tip-main">
            <span className="demo-tip-step">{currentStep + 1} / {steps.length}</span>
            <p>{steps[currentStep]}</p>
          </div>

          <ol className="demo-step-list">
            {steps.map((step, index) => (
              <li key={step} className={index === currentStep ? 'active' : index < currentStep ? 'done' : ''}>
                <span>{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>

          <div className="demo-tip-actions">
            <button type="button" onClick={onPrev} disabled={currentStep === 0}>
              上一步
            </button>
            <button type="button" onClick={onNext} disabled={currentStep === steps.length - 1}>
              下一步
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              关闭引导
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default DemoGuide
