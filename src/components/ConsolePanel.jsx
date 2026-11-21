import React, { useRef, useEffect } from 'react'
import './ConsolePanel.css'

function ConsolePanel({
    output,
    error,
    input,
    onInputChange,
    onClear,
    onClose,
    isBackendCompileLoading = false
}) {
    const contentRef = useRef(null)

    useEffect(() => {
        // Securely scroll only the local container without involving browser's native alignment
        if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight
        }
    }, [output, error])

    const hasOutput = output && output.length > 0

    return (
        <div className="console-panel card">
            <div className="console-header">
                <span className="console-title"><span aria-hidden="true">&gt;_</span> 控制台</span>
                <div className="console-actions">
                    <button className="console-clear-btn" onClick={onClear} title="清空输出">
                        清空
                    </button>
                    {onClose && (
                        <button className="console-close-btn" onClick={onClose} title="关闭终端">
                            ✕
                        </button>
                    )}
                </div>
            </div>

            <div className="console-content" ref={contentRef}>
                {isBackendCompileLoading ? (
                    <div className="console-loading-state">
                        <div className="console-loading-spinner" aria-hidden />
                        <p>⚙️ 正在后端编译 EXE…</p>
                        <span className="console-loading-hint">
                            编译可能需要 15–60 秒，可继续编辑代码或切换标签页；完成后将自动弹出本窗口与 DOS 模拟器
                        </span>
                    </div>
                ) : hasOutput ? (
                    <pre>{output.join('')}</pre>
                ) : (
                    <div className="console-empty">程序输出会显示在这里。</div>
                )}
                {!isBackendCompileLoading && error && <pre className="console-stderr">{error}</pre>}
            </div>
            <details className="console-input-area">
                <summary>程序输入 <code>stdin</code></summary>
                <label className="console-input-label" htmlFor="console-stdin">在运行前输入内容，支持多行。</label>
                <textarea id="console-stdin" className="console-input" value={input}
                    onChange={event => onInputChange(event.target.value)} rows={3} />
            </details>
        </div>
    )
}

export default ConsolePanel
