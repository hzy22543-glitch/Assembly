import React, { useCallback, useEffect, useRef, useState } from 'react'
import Editor from 'react-simple-code-editor'
import { highlightAssembly } from '../utils/syntaxHighlighter'
import { getInlineSuggestion } from '../services/aiService'
import './CodeEditor.css'

const LOCAL_VOCABULARY = [
  'MOV', 'ADD', 'SUB', 'INC', 'DEC', 'CMP', 'JMP', 'JE', 'JNE', 'JZ', 'JNZ', 'JG', 'JL',
  'LOOP', 'PUSH', 'POP', 'CALL', 'RET', 'INT', 'MUL', 'DIV', 'AND', 'OR', 'XOR', 'NOT',
  'SHL', 'SHR', 'LEA', 'NOP', 'AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'CS', 'DS',
  'SS', 'ES', 'AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH', 'SEGMENT', 'ENDS', 'ASSUME',
  'MACRO', 'ENDM', 'END', 'DB', 'DW', 'DD', 'OFFSET', 'PTR', 'EQU'
]

function CodeEditor({ code, onChange, currentLine, onAutoComment, isAutoCommenting, fileName, onOpenFileManager, onSave, onImport, onDownload, saveStatus, fileNotice }) {
  const fileInput = useRef(null)
  const lines = code.split('\n')
  const editorWrapperRef = useRef(null)
  const textareaRef = useRef(null)
  const debounceRef = useRef(null)
  const requestIdRef = useRef(0)
  const lastContextRef = useRef({ code: '', index: -1 })
  const cursorRef = useRef({ index: 0, hasSelection: false })
  const suggestionAbortControllerRef = useRef(null)

  const [cursorIndex, setCursorIndex] = useState(0)
  const [inlineSuggestion, setInlineSuggestion] = useState('')
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [localSuggestions, setLocalSuggestions] = useState([])
  const [selectedLocalIndex, setSelectedLocalIndex] = useState(0)

  const updateCursorInfo = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart ?? 0
    const end = textarea.selectionEnd ?? start

    cursorRef.current = {
      index: start,
      hasSelection: start !== end
    }

    setCursorIndex(prev => (prev === start ? prev : start))
  }, [])

  const applySuggestion = useCallback(() => {
    if (!inlineSuggestion) return
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart ?? cursorRef.current.index ?? 0
    const end = textarea.selectionEnd ?? start
    const nextCode = code.slice(0, start) + inlineSuggestion + code.slice(end)

    onChange(nextCode)
    setInlineSuggestion('')

    requestAnimationFrame(() => {
      const nextPos = start + inlineSuggestion.length
      textarea.selectionStart = nextPos
      textarea.selectionEnd = nextPos
      updateCursorInfo()
    })
  }, [code, inlineSuggestion, onChange, updateCursorInfo])

  const highlightWithSuggestion = useCallback((value) => {
    // ⚠️ 严禁在这里插入 ghost 标签！
    // react-simple-code-editor 严格要求生成的 HTML 内容与 textarea 字符串长度必须100%相等。
    // 如果强行注入 <span class="inline-ghost">，会导致底层占位完全错乱。
    // 用户在错位后试图删除、选中、复制时，浏览器的原生 selection API 就会崩溃（删不了/复制不了）。
    // AI 实时提示已经在右下角的 .inline-suggestion-bar 浮层显示，这就足够了！
    return highlightAssembly(value)
  }, [])

  useEffect(() => {
    if (!editorWrapperRef.current) return
    const textarea = editorWrapperRef.current.querySelector('textarea')
    if (!textarea) return

    textareaRef.current = textarea

    const handleKeyDown = (event) => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      if (localSuggestions.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSelectedLocalIndex(prev => (prev + 1) % localSuggestions.length)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSelectedLocalIndex(prev => (prev - 1 + localSuggestions.length) % localSuggestions.length)
          return
        }
        if (event.key === 'Tab' || event.key === 'Enter') {
          event.preventDefault()
          const word = localSuggestions[selectedLocalIndex] ?? localSuggestions[0]
          const match = code.slice(0, cursorRef.current.index).match(/[a-zA-Z0-9_]+$/)
          const currentWordLen = match ? match[0].length : 0
          const start = cursorRef.current.index - currentWordLen
          const nextCode = code.slice(0, start) + word + code.slice(cursorRef.current.index)

          onChange(nextCode)
          setLocalSuggestions([])
          setInlineSuggestion('')

          requestAnimationFrame(() => {
            textarea.selectionStart = start + word.length
            textarea.selectionEnd = start + word.length
            updateCursorInfo()
          })
          return
        }
        // Let other keys pass and hide suggestion context if matching changes
      }

      if (event.key === 'Tab' && inlineSuggestion && localSuggestions.length === 0) {
        event.preventDefault()
        applySuggestion()
      }
    }

    const handleCursorActivity = () => updateCursorInfo()

    textarea.addEventListener('keydown', handleKeyDown)
    textarea.addEventListener('keyup', handleCursorActivity)
    textarea.addEventListener('click', handleCursorActivity)
    textarea.addEventListener('mouseup', handleCursorActivity)
    textarea.addEventListener('focus', handleCursorActivity)

    updateCursorInfo()

    return () => {
      textarea.removeEventListener('keydown', handleKeyDown)
      textarea.removeEventListener('keyup', handleCursorActivity)
      textarea.removeEventListener('click', handleCursorActivity)
      textarea.removeEventListener('mouseup', handleCursorActivity)
      textarea.removeEventListener('focus', handleCursorActivity)
    }
  }, [applySuggestion, inlineSuggestion, updateCursorInfo, localSuggestions, selectedLocalIndex, code, onChange])

  useEffect(() => {
    if (!code || !code.trim()) {
      requestIdRef.current += 1
      setInlineSuggestion('')
      setIsSuggesting(false)
      return
    }

    if (cursorRef.current.hasSelection) {
      requestIdRef.current += 1
      setInlineSuggestion('')
      setIsSuggesting(false)
      return
    }

    const lastContext = lastContextRef.current
    if (lastContext.code === code && lastContext.index === cursorIndex) {
      return
    }

    // 方案3上半部分：生成本地词汇提示
    const match = code.slice(0, cursorIndex).match(/[a-zA-Z0-9_]+$/)
    const currentWord = match ? match[0].toUpperCase() : ''

    if (currentWord.length > 0) {
      const matches = LOCAL_VOCABULARY.filter(v => v.startsWith(currentWord) && v !== currentWord)
      setSelectedLocalIndex(0)
      if (matches.length > 0) {
        setLocalSuggestions(matches.slice(0, 5))
      } else {
        setLocalSuggestions([])
      }
    } else {
      setLocalSuggestions([])
    }

    // 方案3下半部分：前端静态词法补全 - 不要在打到一半（全是字母数字）时触发AI，只在按完空格或换行等界限符时触发
    const charBeforeCursor = code[cursorIndex - 1] || ''
    const isTypingWord = /[a-zA-Z0-9_]/.test(charBeforeCursor)
    if (isTypingWord) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setIsSuggesting(false)
      setInlineSuggestion('')
      return
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      if (suggestionAbortControllerRef.current) {
        suggestionAbortControllerRef.current.abort()
      }
      suggestionAbortControllerRef.current = new AbortController()
      const signal = suggestionAbortControllerRef.current.signal

      const requestId = (requestIdRef.current += 1)
      lastContextRef.current = { code, index: cursorIndex }
      setIsSuggesting(true)

      const suggestion = await getInlineSuggestion(code, cursorIndex, signal)
      if (requestId !== requestIdRef.current) return

      setIsSuggesting(false)

      if (!suggestion) {
        setInlineSuggestion('')
        return
      }

      const afterText = code.slice(cursorIndex, cursorIndex + suggestion.length)
      if (afterText === suggestion) {
        setInlineSuggestion('')
        return
      }

      setInlineSuggestion(suggestion)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (suggestionAbortControllerRef.current) suggestionAbortControllerRef.current.abort()
    }
  }, [code, cursorIndex])

  return (
    <div className="code-editor-container card">
      <div className="card-header">
        <div className="card-title">
          <span className="editor-title">代码编辑器</span>
          <span className="filename" title={fileName}>{fileName || '未命名.asm'}</span>
        </div>
        <div className="editor-actions">
          <button type="button" className="editor-tool" onClick={onOpenFileManager} title="文件管理器">文件</button>
          <button type="button" className="editor-tool" onClick={() => fileInput.current?.click()}>导入</button>
          <input type="file" accept=".asm" ref={fileInput} hidden onChange={event => {
            const file = event.currentTarget.files[0]
            event.currentTarget.value = ''
            onImport(file)
          }} />
          <button type="button" className="editor-tool" onClick={onDownload}>下载</button>
          <button
            type="button"
            className={`editor-tool ${saveStatus === 'saved' ? 'saved' : ''}`}
            onClick={onSave}
            title="保存到当前文件（Ctrl / ⌘ + S）"
          >
            {saveStatus === 'saved' ? '已保存' : '保存'}
          </button>
          <button type="button" className="editor-tool" onClick={onAutoComment} disabled={isAutoCommenting} title="自动注释">
            {isAutoCommenting ? '注释中…' : '注释'}
          </button>
        </div>
      </div>
      {fileNotice && <p className="editor-notice" role="alert">{fileNotice}</p>}
      <div className="card-body editor-wrapper">
        {/* 行号 */}
        <div className="line-numbers" aria-hidden="true">
          {lines.map((_, index) => (
            <div
              key={index}
              className={`line-number ${index + 1 === currentLine ? 'active' : ''}`}
            >
              {index + 1}
            </div>
          ))}
        </div>

        {/* 代码编辑器 */}
        <div className="editor-area" ref={editorWrapperRef}>
          <Editor
            value={code.replace(/\r/g, '')}
            onValueChange={(val) => onChange(val.replace(/\r\n/g, '\n'))}
            highlight={highlightWithSuggestion}
            padding={16}
            className="code-editor"
            textareaId="asm-source"
            textareaClassName="code-textarea"
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 14,
              '--active-line-top': currentLine > 0 ? `${16 + (currentLine - 1) * 22}px` : '-22px',
            }}
          />
          {(inlineSuggestion || isSuggesting || localSuggestions.length > 0) && (
            <div className={`inline-suggestion-bar ${localSuggestions.length > 0 ? 'local-mode' : ''}`}>
              {localSuggestions.length > 0 ? (
                <>
                  <span className="inline-suggestion-label local-label">本地词库提示</span>
                  <div className="local-suggestions-list">
                    {localSuggestions.map((item, idx) => (
                      <div key={item} className={`local-suggestion-item ${idx === selectedLocalIndex ? 'selected' : ''}`}>
                        {item}
                      </div>
                    ))}
                  </div>
                  <span className="inline-suggestion-hint local-hint">按 ↑ ↓ 选择，Tab/Enter 补全</span>
                </>
              ) : (
                <>
                  <span className="inline-suggestion-label">实时浮层提示</span>
                  {isSuggesting ? (
                    <span className="inline-suggestion-loading">生成中...</span>
                  ) : (
                    <>
                      <span className="inline-suggestion-text">{inlineSuggestion}</span>
                      <span className="inline-suggestion-hint">Tab 接受</span>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CodeEditor
