import React, { useState, useRef, useEffect } from 'react'
import './AIChat.css'

// onSendMessage: (userMessage, conversationHistory) => Promise<void>
// 所有 abort / loading 状态由 App 层 per-file 管理，AIChat 只负责 UI
function AIChat({ isOpen, messages, setMessages, isLoading, onClose, currentCode, onApplyCode, onSendMessage }) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)

  const scrollToBottom = (behavior = 'smooth') => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior })
    }, 100)
  }

  // 监听消息变化或对话框打开
  useEffect(() => {
    if (isOpen) {
      scrollToBottom(messages.length <= 1 ? 'auto' : 'smooth')
    }
  }, [messages, isOpen])

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage = input.trim()
    setInput('')

    // 构建对话历史（不含当前正在输入的用户消息，等待 App 追加）
    const conversationHistory = messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({ role: msg.role, content: msg.content }))

    // App 层负责：追加用户消息 → 发起请求 → 处理响应（含 abort 竞态保护）
    await onSendMessage(userMessage, conversationHistory)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const quickQuestions = [
    '帮我写一个从1加到100的累加程序',
    '这段代码是做什么的？',
    '帮我分析一下代码逻辑',
    '解释一下汇编语言中的寄存器'
  ]

  // Helper to render AI messages containing `action` code blocks
  const renderMessageContent = (content) => {
    // Check if the content has the special action block
    const parts = content.split(/(```action\r?\n[\s\S]*?\r?\n```)/g)

    return parts.map((part, idx) => {
      // Allow \r?\n in the start/end match and replace
      if (/^```action\r?\n/.test(part) && /\r?\n```$/.test(part)) {
        const code = part.replace(/^```action\r?\n/, '').replace(/\r?\n```$/, '')
        return (
          <div key={idx} className="ai-code-action-block">
            <div className="ai-code-action-header">
              <span>🚀 准备部署的代码</span>
              {onApplyCode && (
                <button
                  className="btn-apply-code"
                  onClick={(e) => {
                    e.stopPropagation(); // Preven chat panel click
                    onApplyCode(code);
                  }}
                  title="一键直接覆盖到左侧代码编辑器"
                >
                  ⚡ 应用到编辑器
                </button>
              )}
            </div>
            <pre className="ai-code-preview">{code}</pre>
          </div>
        )
      }
      // Normal text
      return <div key={idx} className="message-text">{part}</div>
    })
  }

  if (!isOpen) return null

  return (
    <div className="ai-chat-sidebar-content">
      {/* 头部 */}
      {/* 头部 */}
      <div className="chat-header">
        <div className="chat-title">
          <span className="ai-icon">🤖</span>
          <div>
            <h3>CoreLogic AI 助手</h3>
            <span className="ai-status">在线</span>
          </div>
        </div>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>

      {/* 消息区域 */}
      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'assistant' ? '🤖' : '👤'}
            </div>
            <div className="message-content">
              {renderMessageContent(msg.content)}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 快捷问题 */}
      <div className="quick-questions">
        {quickQuestions.map((q, idx) => (
          <button
            key={idx}
            className="quick-q-btn"
            onClick={() => {
              setInput(q)
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* 输入区域 */}
      <div className="chat-input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入你的问题，按 Enter 发送..."
          rows={2}
        />
        <button
          className="btn-send"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? '...' : '➤'}
        </button>
      </div>
    </div>
  )
}

export default AIChat
