import React, { useEffect, useRef, useState } from 'react'
import './AIAnalysis.css'
import mermaid from 'mermaid'

// 错误边界组件
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('AIAnalysis 错误边界捕获错误:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="ai-analysis card">
          <div className="card-body error-state">
            <span className="error-icon">💥</span>
            <h3>渲染错误</h3>
            <p>AI 分析组件出现严重错误</p>
            <details>
              <summary>错误详情</summary>
              <pre>{this.state.error?.message || '未知错误'}</pre>
            </details>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// 详细解释格式化组件
function DetailedExplanation({ text }) {
  const parseExplanation = (text) => {
    if (!text) return []

    const steps = []
    const patterns = [
      { regex: /第([一二三四五六七八九十\d]+)行['"]([^'"]+)['"]/g, type: 'code_line' },
      { regex: /然后到了(['"]?[A-Z_]+['"]?)/g, type: 'label' },
      { regex: /然后['"]([^'"]+)['"]/g, type: 'then_code' },
      { regex: /接着['"]([^'"]+)['"]/g, type: 'next_code' },
      { regex: /最后['"]([^'"]+)['"]/g, type: 'final_code' },
    ]

    const allMatches = []
    patterns.forEach(({ regex, type }) => {
      let match
      let loopCount = 0
      while ((match = regex.exec(text)) !== null && loopCount < 1000) {
        loopCount++
        allMatches.push({ index: match.index, match, type })
      }
      regex.lastIndex = 0
    })

    allMatches.sort((a, b) => a.index - b.index)

    let stepNum = 1
    for (let i = 0; i < allMatches.length; i++) {
      const current = allMatches[i]
      const next = allMatches[i + 1]

      if (current.type === 'code_line') {
        const lineNum = current.match[1]
        const code = current.match[2]
        const startDesc = current.match.index + current.match[0].length
        const endDesc = next ? next.index : text.length
        const description = text.substring(startDesc, endDesc).replace(/^[，,、\s]+/, '')
        steps.push({ stepNum: stepNum++, lineNum, code, description, type: 'instruction' })
      } else if (['then_code', 'next_code', 'final_code'].includes(current.type)) {
        const code = current.match[1]
        const startDesc = current.match.index + current.match[0].length
        const endDesc = next ? next.index : text.length
        const description = text.substring(startDesc, endDesc).replace(/^[，,、\s]+/, '')
        steps.push({ stepNum: stepNum++, lineNum: null, code, description, type: current.type })
      } else if (current.type === 'label') {
        const labelName = current.match[1].replace(/['"]/g, '')
        const startDesc = current.match.index + current.match[0].length
        const endDesc = next ? next.index : text.length
        const description = text.substring(startDesc, endDesc).replace(/^[，,、\s]+/, '')
        steps.push({ stepNum: stepNum++, lineNum: null, label: labelName, description, type: 'label' })
      }
    }

    if (steps.length === 0) {
      return text.split(/\n|(?=第[一二三四五六七八九十\d]+行)|(?=然后)|(?=接着)|(?=最后)/)
        .filter(s => s.trim())
        .map((s, i) => ({ stepNum: i + 1, description: s.trim(), type: 'paragraph' }))
    }

    return steps
  }

  const steps = parseExplanation(text)

  if (steps.length === 0) {
    return <div className="detailed-explanation-plain"><p>{text}</p></div>
  }

  return (
    <div className="detailed-explanation-formatted">
      {steps.map((step, idx) => (
        <div key={idx} className={`explanation-step step-${step.type}`}>
          <div className="step-header">
            <span className="step-badge">步骤 {step.stepNum}</span>
            {step.lineNum && <span className="line-num-badge">第{step.lineNum}行</span>}
            {step.code && <code className="step-code">{step.code}</code>}
            {step.label && <span className="label-badge">{step.label}</span>}
          </div>
          <p className="step-description">{step.description}</p>
        </div>
      ))}
    </div>
  )
}

function AIAnalysis({ analysis, loading, flowchartLoading, fullLoading, error, activeView, onViewChange, onRefreshBasic, onRefreshFlowchart, onRefreshFull }) {
  const mermaidRef = useRef(null)
  const mermaidRenderSeqRef = useRef(0)
  const [componentError, setComponentError] = useState(null)
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    if (analysis) {
      console.log('AIAnalysis 接收到的 analysis 数据:', analysis)
      if (analysis?.fullAnalysis?.error) {
        console.error('完整语义分析错误:', analysis.fullAnalysis.error)
      }
    }
  }, [analysis])

  useEffect(() => {
    const handleError = (event) => {
      console.error('AIAnalysis 组件错误:', event.error)
      setComponentError(event.error?.message || '组件渲染错误')
    }
    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [])

  const escapeHtml = (text) => {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  useEffect(() => {
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        themeVariables: {
          primaryColor: '#58a6ff',
          primaryTextColor: '#e6edf3',
          primaryBorderColor: '#30363d',
          lineColor: '#8b949e',
          secondaryColor: '#161b22',
          tertiaryColor: '#21262d'
        }
      })
    } catch (error) {
      console.error('Mermaid 初始化失败:', error)
    }
  }, [])

  const sanitizeMermaidCode = (code) => {
    if (!code || typeof code !== 'string') return code

    let fixed = code
    fixed = fixed.replace(/(\w+)\{("(?:[^"]*)")\]/g, '$1{$2}')
    fixed = fixed.replace(/(\w+)\{("(?:[^"]*)")\)/g, '$1{$2}')
    fixed = fixed.replace(/(\w+)\{([^}")\]]*)\]/g, '$1{$2}')
    fixed = fixed.replace(/(\w+)\[([^\]]*?)\}/g, '$1[$2]')
    fixed = fixed.replace(/(\w+)\(([^)]*?)\]/g, '$1($2)')
    fixed = fixed.replace(/\(\["([^"]*?)"\s*[\])][\])]*\)?/g, '(["$1"])')

    const lines = fixed.split('\n')
    let graphCount = 0
    const cleaned = []

    for (const line of lines) {
      let fixedLine = line
      if (/^\s*graph\s+(TD|TB|LR|RL|BT)\s*$/.test(fixedLine.trim())) {
        graphCount++
        if (graphCount > 1) continue
      }
      fixedLine = fixedLine.replace(/(\s)(\w+)\s+(\w+)(\s*[\[{(])/g, '$1$2_$3$4')
      fixedLine = fixedLine.replace(/(-->(?:\|[^|]*\|)?)\s+(\w+)\s+(\w+)(\s*[\[{(])/g, '$1 $2_$3$4')
      fixedLine = fixedLine.replace(/(-->(?:\|[^|]*\|)?)\s+(\w+)\s+(\w+)\s*$/g, '$1 $2_$3')
      cleaned.push(fixedLine)
    }
    fixed = cleaned.join('\n')
    fixed = fixed.replace(/\n\s*[^\s\n][^\n]*[。，！？；：、].*$/gm, '')
    return fixed.trim()
  }

  useEffect(() => {
    if (activeView !== 'flowchart' || !analysis?.flowchart || flowchartLoading) return

    let cancelled = false
    const mermaidCode = sanitizeMermaidCode(analysis.flowchart)

    const run = () => {
      if (cancelled || !mermaidRef.current) return
      const id = `mmd-${Date.now()}-${++mermaidRenderSeqRef.current}`

      try {
        const renderResult = mermaid.render(id, mermaidCode)

        if (!renderResult) {
          console.error('mermaid.render() 返回了 undefined')
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML = `
              <div class="mermaid-error">
                <span class="error-icon">⚠️</span>
                <p>流程图渲染失败</p>
                <p class="error-detail">Mermaid 渲染返回空结果</p>
              </div>
            `
          }
          return
        }

        renderResult
          .then(({ svg }) => {
            if (cancelled || !mermaidRef.current) return
            mermaidRef.current.innerHTML = svg
          })
          .catch((error) => {
            console.error('Mermaid 渲染失败:', error)
            let errorMessage = error.message || '流程图渲染失败'
            if (error.message?.includes('SyntaxError')) errorMessage = '流程图语法错误，请检查代码格式'
            else if (error.message?.includes('ReferenceError')) errorMessage = '流程图引用错误，请检查节点名称'

            if (cancelled || !mermaidRef.current) return
            mermaidRef.current.innerHTML = `
              <div class="mermaid-error">
                <span class="error-icon">⚠️</span>
                <p>流程图渲染失败</p>
                <p class="error-detail">${errorMessage}</p>
                <details>
                  <summary>查看流程图代码</summary>
                  <pre class="mermaid-code">${escapeHtml(mermaidCode)}</pre>
                </details>
              </div>
            `
          })
      } catch (error) {
        console.error('Mermaid 渲染异常:', error)
        if (cancelled || !mermaidRef.current) return
        mermaidRef.current.innerHTML = `
          <div class="mermaid-error">
            <span class="error-icon">💥</span>
            <p>Mermaid 渲染异常</p>
            <p class="error-detail">${error.message || '未知错误'}</p>
          </div>
        `
      }
    }

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(run)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [analysis?.flowchart, activeView, flowchartLoading])

  return (
    <div className="ai-analysis">
      {/* AI 分析切换标签 - 三个独立功能 */}
      <div className="view-tabs ai-only-tabs">
        <button
          className={`view-tab ${activeView === 'basic' ? 'active' : ''}`}
          onClick={() => onViewChange('basic')}
        >
          📋 基础分析
        </button>
        <button
          className={`view-tab ${activeView === 'flowchart' ? 'active' : ''}`}
          onClick={() => onViewChange('flowchart')}
        >
          {flowchartLoading && activeView === 'flowchart' ? '⏳ 加载中...' : '📊 流程图'}
        </button>
        <button
          className={`view-tab ${activeView === 'full' ? 'active' : ''}`}
          onClick={() => onViewChange('full')}
        >
          {fullLoading && activeView === 'full' ? '⏳ 加载中...' : '🎓 完整语义分析'}
        </button>
      </div>

      {error && (
        <div className="card analysis-section error-state">
          <span className="error-icon">⚠️</span>
          <p>分析失败: {error}</p>
          <span className="error-hint">请检查网络连接或 API 配置</span>
        </div>
      )}

      {componentError && !error && (
        <div className="card analysis-section error-state">
          <span className="error-icon">💥</span>
          <h3>组件错误</h3>
          <p>AI 分析组件出现错误: {componentError}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </div>
      )}

      {/* 基础分析视图 */}
      {activeView === 'basic' && !error && !componentError && (
        loading ? (
          <div className="card analysis-section">
            <div className="card-body loading-state">
              <div className="loading-spinner"></div>
              <p>🤖 AI 正在分析代码...</p>
              <span className="loading-hint">AI分析可能需要30-60秒，请耐心等待</span>
            </div>
          </div>
        ) : !analysis?.summary ? (
          <div className="card analysis-section empty-state">
            <div className="card-body">
              <span className="empty-icon">🤖</span>
              <h3>AI 智能分析</h3>
              <p>点击"智能分析"按钮，让 AI 为您：</p>
              <ul className="feature-list">
                <li>📖 解释代码整体功能</li>
                <li>🔍 逐行详细分析</li>
                <li>📊 生成执行流程图</li>
                <li>🌊 追踪数据流动</li>
                <li>💡 提供优化建议</li>
                <li>🎓 完整语义教学</li>
              </ul>
              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={onRefreshBasic}
                  style={{ padding: '10px 24px', fontSize: '16px' }}
                >
                  <span>🧠</span>
                  开始智能分析
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {analysis && analysis._isMockData && (
              <div className="card analysis-section mock-warning">
                <div className="card-body">
                  <span className="warning-icon">⚠️</span>
                  <span className="warning-text">
                    AI服务暂时不可用，当前显示基于代码特征的智能分析结果
                  </span>
                </div>
              </div>
            )}

            {/* 刷新按钮 + 整体概述 */}
            <div className="card analysis-section">
              <div className="card-header section-header-row">
                <span className="card-title">
                  <span>📖</span>
                  代码概述
                </span>
                <button
                  className={`btn btn-sm btn-refresh ${loading ? 'btn-loading' : ''}`}
                  onClick={onRefreshBasic}
                  disabled={loading}
                  title="刷新基础分析"
                >
                  {loading ? '⏳' : '🔄'} 刷新基础分析
                </button>
              </div>
            <div className="card-body">
              <p className="summary-text">{analysis.summary}</p>
              {showDebug && (
                <div style={{ marginTop: '10px', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                  <div>数据类型: {typeof analysis.summary}</div>
                  <div>长度: {analysis.summary.length}</div>
                </div>
              )}
            </div>
            </div>

            {/* 逐行分析 */}
            {analysis && analysis.lineAnalysis && Array.isArray(analysis.lineAnalysis) && analysis.lineAnalysis.length > 0 && (
              <div className="card analysis-section">
                <div className="card-header">
                  <span className="card-title">
                    <span>🔍</span>
                    逐行分析
                  </span>
                </div>
                <div className="card-body">
                  <div className="line-analysis-list">
                    {analysis.lineAnalysis.map((line, idx) => (
                      <div key={idx} className="line-analysis-item">
                        <div className="line-header">
                          <span className="line-num">第 {line && line.line ? line.line : idx + 1} 行</span>
                        </div>
                        {line && line.code && (
                          <div className="line-code">
                            <code>{line.code}</code>
                          </div>
                        )}
                        <p className="line-explanation">{line && line.explanation ? line.explanation : '暂无解释'}</p>
                        {line && line.humanReadable && line.humanReadable !== line.explanation && (
                          <p className="line-human">
                            <span className="human-label">💡 大白话：</span>
                            {line.humanReadable}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 优化建议 */}
            {analysis && analysis.optimization && (
              <div className="card analysis-section">
                <div className="card-header">
                  <span className="card-title">
                    <span>💡</span>
                    优化建议
                  </span>
                </div>
                <div className="card-body">
                  <p className="optimization-text">{analysis.optimization}</p>
                </div>
              </div>
            )}

            {/* 基础分析文本 (当逐行分析为空时显示原始内容) */}
            {analysis && analysis.rawContent && (!analysis.lineAnalysis || analysis.lineAnalysis.length === 0) && (
              <div className="card analysis-section">
                <div className="card-header">
                  <span className="card-title">
                    <span>📝</span>
                    分析结果
                  </span>
                </div>
                <div className="card-body">
                  <pre className="raw-content">{analysis.rawContent}</pre>
                </div>
              </div>
            )}

            {/* 调试开关 */}
            {analysis && (
              <div className="card analysis-section">
                <div className="card-header">
                  <button
                    onClick={() => setShowDebug(!showDebug)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '14px' }}
                  >
                    {showDebug ? '🔽 隐藏原始数据' : '🔼 显示原始数据'}
                  </button>
                </div>
                {showDebug && (
                  <div className="card-body">
                    <pre className="raw-content" style={{ maxHeight: '300px', overflow: 'auto' }}>
                      {JSON.stringify(analysis, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {analysis && !analysis.summary && !analysis.lineAnalysis && !analysis.rawContent && (
              <div className="card analysis-section empty-state">
                <div className="card-body">
                  <span className="empty-icon">📭</span>
                  <p>暂无分析内容</p>
                </div>
              </div>
            )}
          </>
        )
      )}

      {/* 流程图视图 */}
      {activeView === 'flowchart' && (
        flowchartLoading ? (
          <div className="card analysis-section">
            <div className="card-body loading-state">
              <div className="loading-spinner"></div>
              <p>🤖 正在为您生成执行流程图，请稍候...</p>
            </div>
          </div>
        ) : analysis?.flowchart ? (
          <div className="card analysis-section">
            <div className="card-header section-header-row">
              <span className="card-title">
                <span>📊</span>
                执行流程图
              </span>
              <div className="section-header-actions">
                {analysis.flowchartWarning && (
                  <span className="warning-badge">{analysis.flowchartWarning}</span>
                )}
                <button
                  className={`btn btn-sm btn-refresh ${flowchartLoading ? 'btn-loading' : ''}`}
                  onClick={onRefreshFlowchart}
                  disabled={flowchartLoading}
                  title="刷新流程图"
                >
                  {flowchartLoading ? '⏳' : '🔄'} 刷新流程图
                </button>
              </div>
            </div>
            <div className="card-body">
              <div ref={mermaidRef} className="mermaid-chart"></div>
            </div>
          </div>
        ) : (
          <div className="card analysis-section empty-state">
            <div className="card-body">
              <span className="empty-icon">📊</span>
              <h3>执行流程图</h3>
              <p>点击按钮，AI 将为您解析并生成代码执行的可视化流程图：</p>
              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={onRefreshFlowchart}
                  style={{ padding: '10px 24px', fontSize: '16px' }}
                >
                  <span>📊</span>
                  生成流程图
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {/* 完整语义分析 */}
      {activeView === 'full' && (
        fullLoading ? (
          <div className="card analysis-section">
            <div className="card-body loading-state">
              <div className="loading-spinner"></div>
              <p>🎓 正在为您进行彻底的语义分析，包含深度的寄存器和错误排查，请稍候...</p>
            </div>
          </div>
        ) : analysis?.fullAnalysis ? (
          <div className="full-analysis-view">
            <div className="full-analysis-header">
              <span className="card-title" style={{ fontSize: '16px', fontWeight: '600' }}>
                🎓 完整语义分析
              </span>
              <button
                className={`btn btn-sm btn-refresh ${fullLoading ? 'btn-loading' : ''}`}
                onClick={onRefreshFull}
                disabled={fullLoading}
                title="刷新完整语义分析"
              >
                {fullLoading ? '⏳' : '🔄'} 刷新完整语义分析
              </button>
            </div>

            {analysis.fullAnalysis.overallFunction && (
              <div className="card analysis-section">
                <div className="card-header">
                  <span className="card-title">
                    <span>🎯</span>
                    整体功能
                  </span>
                </div>
                <div className="card-body">
                  <p className="full-analysis-text">{analysis.fullAnalysis.overallFunction}</p>
                </div>
              </div>
            )}

            {analysis.fullAnalysis.algorithm && (
              <div className="card analysis-section">
                <div className="card-header">
                  <span className="card-title">
                    <span>🧮</span>
                    算法思路
                  </span>
                </div>
                <div className="card-body">
                  <p className="full-analysis-text">{analysis.fullAnalysis.algorithm}</p>
                </div>
              </div>
            )}

            {analysis.fullAnalysis.registerUsage && Object.keys(analysis.fullAnalysis.registerUsage).length > 0 && (
              <div className="card analysis-section">
                <div className="card-header">
                  <span className="card-title">
                    <span>🔧</span>
                    寄存器使用说明
                  </span>
                </div>
                <div className="card-body">
                  <div className="register-usage-list">
                    {Object.entries(analysis.fullAnalysis.registerUsage).map(([reg, desc], idx) => (
                      <div key={idx} className="register-usage-item">
                        <span className="register-name">{reg}</span>
                        <span className="register-desc">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(analysis.fullAnalysis.keyPoints?.length > 0 || analysis.fullAnalysis.commonMistakes?.length > 0) && (
              <div className="card analysis-section">
                <div className="card-header">
                  <span className="card-title">
                    <span>⚠️</span>
                    关键点与常见错误
                  </span>
                </div>
                <div className="card-body">
                  {analysis.fullAnalysis.keyPoints?.length > 0 && (
                    <div className="key-points">
                      <h4>🔑 关键点</h4>
                      <ul>
                        {analysis.fullAnalysis.keyPoints.map((point, idx) => (
                          <li key={idx}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.fullAnalysis.commonMistakes?.length > 0 && (
                    <div className="common-mistakes">
                      <h4>❌ 常见错误</h4>
                      <ul>
                        {analysis.fullAnalysis.commonMistakes.map((mistake, idx) => (
                          <li key={idx}>{mistake}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {analysis.fullAnalysis.learningTips?.length > 0 && (
              <div className="card analysis-section">
                <div className="card-header">
                  <span className="card-title">
                    <span>💡</span>
                    学习建议
                  </span>
                </div>
                <div className="card-body">
                  <ul className="learning-tips-list">
                    {analysis.fullAnalysis.learningTips.map((tip, idx) => (
                      <li key={idx} className="learning-tip">{tip}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {analysis.fullAnalysis.detailedExplanation && (
              <div className="card analysis-section">
                <div className="card-header">
                  <span className="card-title">
                    <span>📝</span>
                    详细解释
                  </span>
                </div>
                <div className="card-body">
                  <DetailedExplanation text={analysis.fullAnalysis.detailedExplanation} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card analysis-section empty-state">
            <div className="card-body">
              <span className="empty-icon">🎓</span>
              <h3>完整语义教学</h3>
              <p>对代码进行深度剖析，包含寄存器推演、算法分析和易错点提醒：</p>
              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={onRefreshFull}
                  style={{ padding: '10px 24px', fontSize: '16px' }}
                >
                  <span>🎓</span>
                  开始完整分析
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}

function AIAnalysisWithErrorBoundary(props) {
  return (
    <ErrorBoundary>
      <AIAnalysis {...props} />
    </ErrorBoundary>
  )
}

export default AIAnalysisWithErrorBoundary
