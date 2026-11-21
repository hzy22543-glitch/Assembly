import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Header from './components/Header'
import CodeEditor from './components/CodeEditor'
import Visualizer from './components/Visualizer'
import Explanation from './components/Explanation'
import ControlPanel from './components/ControlPanel'
import AIAnalysis from './components/AIAnalysis'
import AIChat from './components/AIChat'
import ConsolePanel from './components/ConsolePanel'
import DosPlayer from './components/DosPlayer'
import FileManager from './components/FileManager'
import PaywallModal from './components/PaywallModal'
import DemoGuide from './components/DemoGuide'
import TeacherDashboard from './components/TeacherDashboard'
import { createInitialState, AsmSimulator, MAX_HISTORY } from './core/asmSimulator'

import { analyzeAssemblyCode, generateFlowchart, addCommentsToCode, fullSemanticAnalysis, chatWithAI } from './services/aiService'
import { backendService } from './services/backendService'
import { createFile, createFileCopy, getActiveFile, getAllFiles, setActiveFile, updateFileCode, setFileAIAnalysisSnapshot, normalizeAiAnalysisFromFile, updateFileChatMessages, setFileAIView, setFileAIError, syncAllFileAIMeta, syncFilesToCloud } from './services/fileService'
import './styles/App.css'

const INITIAL_CPU_STATE = createInitialState()
const IS_STATIC_SITE = import.meta.env.VITE_STATIC_HOSTING === 'true'
const MAX_EXECUTION_STEPS = MAX_HISTORY - 1
const EXECUTION_LIMIT_MESSAGE = `\n执行已达到 ${MAX_EXECUTION_STEPS} 条指令的上限，请检查循环或跳转条件。`

const DEMO_PROGRAMS = [
  {
    key: 'hello',
    label: 'Hello World',
    code: `; Demo: Hello World
DATA SEGMENT
    MSG DB 'Hello World!$'
DATA ENDS

CODE SEGMENT
    ASSUME CS:CODE, DS:DATA
START:
    MOV AX, DATA
    MOV DS, AX
    MOV DX, OFFSET MSG
    MOV AH, 09H
    INT 21H
    MOV AH, 4CH
    INT 21H
CODE ENDS
END START`
  },
  {
    key: 'sum',
    label: '循环求和',
    code: `; Demo: 循环求和，计算 1 + 2 + 3 + 4 + 5
CODE SEGMENT
    ASSUME CS:CODE
START:
    MOV AX, 0
    MOV BX, 1
    MOV CX, 5
SUM_LOOP:
    ADD AX, BX
    INC BX
    LOOP SUM_LOOP
    MOV AH, 4CH
    INT 21H
CODE ENDS
END START`
  },
  {
    key: 'jump',
    label: '条件跳转',
    code: `; Demo: 条件跳转，观察 CMP 后 ZF 的变化
CODE SEGMENT
    ASSUME CS:CODE
START:
    MOV AX, 5
    MOV BX, 5
    CMP AX, BX
    JE EQUAL
    MOV CX, 0
    JMP DONE
EQUAL:
    MOV CX, 1
DONE:
    MOV AH, 4CH
    INT 21H
CODE ENDS
END START`
  },
  {
    key: 'stack',
    label: '栈操作',
    code: `; Demo: 栈操作，观察 PUSH / POP 对 SP、AX、BX 的影响
CODE SEGMENT
    ASSUME CS:CODE
START:
    MOV AX, 1234H
    MOV BX, 0
    PUSH AX
    MOV AX, 0
    POP BX
    MOV AH, 4CH
    INT 21H
CODE ENDS
END START`
  },
  {
    key: 'call',
    label: '子程序调用',
    code: `; Demo: 子程序调用，观察 CALL / RET 与返回值
CODE SEGMENT
    ASSUME CS:CODE
START:
    MOV AX, 2
    MOV BX, 3
    CALL ADD_NUM
    MOV CX, AX
    MOV AH, 4CH
    INT 21H
ADD_NUM:
    ADD AX, BX
    RET
CODE ENDS
END START`
  }
]

function App() {
  // ==================== 所有状态变量必须先定义 ====================

  // 核心状态
  const [code, setCode] = useState('')
  const [isPro, setIsPro] = useState(false)
  const [aiUsageCount, setAiUsageCount] = useState(0)
  const [showPaywall, setShowPaywall] = useState(false)

  // AI Usage interceptor
  const checkAILimit = useCallback(() => {
    if (isPro) return true;
    if (aiUsageCount >= 2) {
      setShowPaywall(true);
      return false;
    }
    setAiUsageCount(prev => prev + 1);
    return true;
  }, [isPro, aiUsageCount]);

  // 文件管理器状态
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false)
  const [currentFile, setCurrentFile] = useState(null)
  const [currentFileId, setCurrentFileId] = useState(null)
  const [saveStatus, setSaveStatus] = useState('')
  const [fileNotice, setFileNotice] = useState('')
  const saveStatusTimer = useRef(null)
  const [isFirstLoad, setIsFirstLoad] = useState(true)

  // 模拟器状态
  const [totalSteps, setTotalSteps] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1000)
  const [explanations, setExplanations] = useState([])

  // Ref
  const simulatorRef = useRef(null)
  const executionCapped = useRef(false)
  const editRevision = useRef(0)

  // Layout State
  const [consoleOutput, setConsoleOutput] = useState([])
  const [consoleInput, setConsoleInput] = useState('')
  const [leftPanelWidth, setLeftPanelWidth] = useState(46)
  const [consoleHeight, setConsoleHeight] = useState(26)
  const [showConsole, setShowConsole] = useState(true)
  const [showDosPlayer, setShowDosPlayer] = useState(false)
  const [dosExeData, setDosExeData] = useState(null)

  // 实机编译：AbortController 取消旧请求 + requestId 丢弃过期响应
  const [backendCompileLoading, setBackendCompileLoading] = useState(false)
  const backendCompileCtrlRef = useRef(null)    // 当前活跃的 AbortController
  const backendCompileRequestIdRef = useRef(0)  // 追踪最新请求编号

  const [isDraggingH, setIsDraggingH] = useState(false)
  const [isDraggingV, setIsDraggingV] = useState(false)
  const [isDraggingAI, setIsDraggingAI] = useState(false)
  const [aiChatWidth, setAiChatWidth] = useState(25)
  const mainContentRef = useRef(null)

  // 文件管理器侧边栏宽度
  const [fileManagerWidth, setFileManagerWidth] = useState(260)
  const [isDraggingFileManager, setIsDraggingFileManager] = useState(false)
  const fileManagerDragActiveRef = useRef(false)

  // AI 分析状态（per-file Map，key = fileId）
  const [aiAnalysisMap, setAiAnalysisMap] = useState({})    // { [fileId]: analysisObject }
  const [aiErrorMap, setAiErrorMap] = useState({})           // { [fileId]: errorMessage }
  const [aiViewMap, setAiViewMap] = useState({})             // { [fileId]: 'basic'|'flowchart'|'full' }
  const [aiLoadingMap, setAiLoadingMap] = useState({})       // { [fileId]: true } — 基础分析加载中
  const [flowchartLoadingMap, setFlowchartLoadingMap] = useState({}) // { [fileId]: true }
  const [fullLoadingMap, setFullLoadingMap] = useState({})   // { [fileId]: true }
  const [autoCommentLoading, setAutoCommentLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('simulation')
  const [appMode, setAppMode] = useState('student')
  const [activeDemoKey, setActiveDemoKey] = useState(null)
  const [demoStepIndex, setDemoStepIndex] = useState(0)
  const [isDemoGuideOpen, setIsDemoGuideOpen] = useState(false)
  const isDemoHighlightActive = isDemoGuideOpen && !!activeDemoKey

  // 当前文件的派生状态（从 per-file map 中读取）
  const currentAiAnalysis = currentFileId ? (aiAnalysisMap[currentFileId] || null) : null
  const currentAiView = currentFileId ? (aiViewMap[currentFileId] || 'basic') : 'basic'
  const currentAiError = currentFileId ? aiErrorMap[currentFileId] : null
  const isAiLoading = !!(currentFileId && aiLoadingMap[currentFileId])
  const isFlowchartLoading = !!(currentFileId && flowchartLoadingMap[currentFileId])
  const isFullLoading = !!(currentFileId && fullLoadingMap[currentFileId])

  // AI 对话
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: '你好！🤖 我是 CoreLogic AI 助手，你的汇编语言学习伙伴！\n\n我可以帮你：\n• 🔍 分析代码功能和逻辑\n• 📖 解释汇编指令\n• 💡 解答你的疑问\n• 🎓 提供学习建议\n\n有什么问题尽管问我吧！' }
  ])
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const [chatLoadingMap, setChatLoadingMap] = useState({})   // per-file chat loading
  const chatAbortMapRef = useRef({})                         // 同步访问（无闭包延迟）

  // ==================== 回调函数（使用后面定义的状态） ====================

  // 初始化：加载或创建文件
  useEffect(() => {
    if (isFirstLoad) {
      const activeFile = getActiveFile()
      if (activeFile) {
        setCurrentFile(activeFile)
        setCurrentFileId(activeFile.id)
        setCode(activeFile.code || '')
        // 初始化时恢复所有文件的 AI 分析状态到各文件的独立 Map
        const allFiles = getAllFiles()
        const analysisMap = {}
        const viewMap = {}
        const errorMap = {}
        allFiles.forEach(f => {
          if (f.aiAnalysis) {
            const norm = normalizeAiAnalysisFromFile(f.aiAnalysis)
            if (norm) analysisMap[f.id] = norm
          }
          if (f.aiView) viewMap[f.id] = f.aiView
          if (f.aiError) errorMap[f.id] = f.aiError
        })
        if (Object.keys(analysisMap).length) setAiAnalysisMap(analysisMap)
        if (Object.keys(viewMap).length) setAiViewMap(viewMap)
        if (Object.keys(errorMap).length) setAiErrorMap(errorMap)
        if (activeFile.chatMessages) setChatMessages(activeFile.chatMessages)
      } else {
        const newFile = createFile('main.asm')
        setCurrentFile(newFile)
        setCurrentFileId(newFile.id)
        setCode(newFile.code || '')
      }
      setIsFirstLoad(false)
    }
  }, [isFirstLoad])

  // 页面卸载时保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentFileId && code !== undefined) {
        updateFileCode(currentFileId, code)
        if (currentAiAnalysis) setFileAIAnalysisSnapshot(currentFileId, currentAiAnalysis)
        updateFileChatMessages(currentFileId, chatMessages)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentFileId, code, currentAiAnalysis, chatMessages])

  // aiViewMap / aiErrorMap 变更时自动持久化
  useEffect(() => {
    syncAllFileAIMeta(aiViewMap, aiErrorMap)
  }, [aiViewMap, aiErrorMap])

  const advanceDemoTo = useCallback((targetStep) => {
    if (!activeDemoKey) return
    setDemoStepIndex(prev => Math.max(prev, targetStep))
  }, [activeDemoKey])

  const resetSimulation = useCallback(() => {
    editRevision.current++
    simulatorRef.current = null
    executionCapped.current = false
    setTotalSteps(0)
    setCurrentStep(0)
    setExplanations([])
    setConsoleOutput([])
    setIsPlaying(false)
    if (backendCompileCtrlRef.current) {
      backendCompileRequestIdRef.current++
      backendCompileCtrlRef.current.abort()
      backendCompileCtrlRef.current = null
      setBackendCompileLoading(false)
    }
    setShowDosPlayer(false)
  }, [])

  const handleCodeChange = useCallback((value) => {
    setCode(value)
    setFileNotice('')
    resetSimulation()
  }, [resetSimulation])

  const handleInputChange = useCallback((value) => {
    setConsoleInput(value)
    resetSimulation()
  }, [resetSimulation])

  const handleDemoGuideClose = useCallback(() => {
    setIsDemoGuideOpen(false)
  }, [])

  const handleModeChange = useCallback((mode) => {
    setAppMode(mode)
    if (mode === 'teacher') {
      setIsPlaying(false)
      setIsFileManagerOpen(false)
      setIsAIChatOpen(false)
    }
  }, [])

  // 文件切换
  const handleFileSelect = useCallback((targetFile) => {
    if (targetFile.id === currentFileId) return
    // 保存旧文件的代码、对话（AI 分析由各 handler 独立保存快照，这里不重复保存）
    if (currentFileId) {
      updateFileCode(currentFileId, code)
      updateFileChatMessages(currentFileId, chatMessages)
      // 取消旧文件的对话请求（防止返回后写错文件）
      if (chatAbortMapRef.current[currentFileId]) {
        chatAbortMapRef.current[currentFileId].abort()
        delete chatAbortMapRef.current[currentFileId]
        setChatLoadingMap(prev => { const n = { ...prev }; delete n[currentFileId]; return n })
      }
    }

    setActiveFile(targetFile.id)
    setCurrentFile(targetFile)
    setCurrentFileId(targetFile.id)
    setCode(targetFile.code || '')
    setFileNotice('')
    clearTimeout(saveStatusTimer.current)
    setSaveStatus('')
    setActiveDemoKey(null)
    setIsDemoGuideOpen(false)
    // 从持久化数据中恢复 AI 分析（如果 Map 中没有则从文件对象加载）
    if (targetFile.aiAnalysis) {
      const norm = normalizeAiAnalysisFromFile(targetFile.aiAnalysis)
      if (norm && !aiAnalysisMap[targetFile.id]) {
        setAiAnalysisMap(prev => ({ ...prev, [targetFile.id]: norm }))
      }
    }
    if (targetFile.aiView) setAiViewMap(prev => ({ ...prev, [targetFile.id]: targetFile.aiView }))
    if (targetFile.aiError) setAiErrorMap(prev => ({ ...prev, [targetFile.id]: targetFile.aiError }))
    // 加载新文件的对话
    if (targetFile.chatMessages && targetFile.chatMessages.length) {
      setChatMessages(targetFile.chatMessages)
    } else {
      setChatMessages([
        {
          role: 'assistant',
          content:
            '你好！🤖 我是 CoreLogic AI 助手，你的汇编语言学习伙伴！\n\n我可以帮你：\n• 🔍 分析代码功能和逻辑\n• 📖 解释汇编指令\n• 💡 解答你的疑问\n• 🎓 提供学习建议\n\n有什么问题尽管问我吧！'
        }
      ])
    }
    setConsoleInput('')
    resetSimulation()
  }, [currentFileId, code, chatMessages, aiAnalysisMap, resetSimulation])

  const selectImportedFile = useRef(handleFileSelect)
  useEffect(() => {
    selectImportedFile.current = handleFileSelect
  }, [handleFileSelect])

  const handleDemoProgramSelect = useCallback((programKey) => {
    const program = DEMO_PROGRAMS.find(item => item.key === programKey)
    if (!program) return
    try {
      handleFileSelect(createFileCopy(`demo-${program.key}.asm`, program.code))
      setActiveDemoKey(programKey)
      setDemoStepIndex(0)
      setActiveTab('simulation')
      setShowConsole(true)
    } catch (error) {
      setFileNotice(error.message)
    }
  }, [handleFileSelect])

  const handleImport = async (file) => {
    if (!file) return
    if (!/\.asm$/i.test(file.name) || file.size > 1024 * 1024) {
      setFileNotice('请选择不超过 1 MB 的 .asm 文件。')
      return
    }
    try {
      const source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      selectImportedFile.current(createFileCopy(file.name, source.replace(/\r\n?/g, '\n')))
      setActiveTab('simulation')
    } catch (error) {
      setFileNotice(error instanceof TypeError ? '请将文件保存为 UTF-8 编码后重新导入。' : error.message)
    }
  }

  const handleDownload = () => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = currentFile?.name || 'main.asm'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // 保存
  const handleSave = useCallback(() => {
    if (!currentFileId) return
    clearTimeout(saveStatusTimer.current)
    if (!updateFileCode(currentFileId, code)) {
      setSaveStatus('')
      setFileNotice('本地保存失败，请下载代码备份。')
      return
    }
    if (currentAiAnalysis) setFileAIAnalysisSnapshot(currentFileId, currentAiAnalysis)
    updateFileChatMessages(currentFileId, chatMessages)
    if (!IS_STATIC_SITE) syncFilesToCloud().catch(err => console.log('Sync failed:', err))
    setSaveStatus('saved')
    setFileNotice('')
    saveStatusTimer.current = setTimeout(() => setSaveStatus(''), 2000)
  }, [currentFileId, code, currentAiAnalysis, chatMessages])

  useEffect(() => {
    const saveShortcut = (event) => {
      if (appMode !== 'student' || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      handleSave()
    }
    window.addEventListener('keydown', saveShortcut)
    return () => window.removeEventListener('keydown', saveShortcut)
  }, [appMode, handleSave])

  useEffect(() => () => clearTimeout(saveStatusTimer.current), [])

  // 代码变化时自动保存
  useEffect(() => {
    if (!currentFileId || isFirstLoad) return
    const timeoutId = setTimeout(() => updateFileCode(currentFileId, code), 1000)
    return () => clearTimeout(timeoutId)
  }, [code, currentFileId, isFirstLoad])

  // 对话变化时防抖写入当前文件（避免仅依赖手动保存或切文件）
  useEffect(() => {
    if (!currentFileId || isFirstLoad) return
    const timeoutId = setTimeout(() => updateFileChatMessages(currentFileId, chatMessages), 800)
    return () => clearTimeout(timeoutId)
  }, [chatMessages, currentFileId, isFirstLoad])

  // 存储当前代码供 AI 分析使用
  useEffect(() => {
    window.currentCode = code
  }, [code])

  const startDragH = useCallback((e) => {
    e.preventDefault()
    setIsDraggingH(true)
  }, [])

  const startDragAI = useCallback((e) => {
    e.preventDefault()
    setIsDraggingAI(true)
  }, [])

  const startDragV = useCallback((e) => {
    e.preventDefault()
    setIsDraggingV(true)
  }, [])

  // 文件管理器拖拽（用 ref 避免闭包导致拖拽不生效）
  const startDragFileManager = useCallback((e) => {
    e.preventDefault()
    fileManagerDragActiveRef.current = true
    setIsDraggingFileManager(true)
  }, [])

  const handleFileManagerDrag = useCallback((e) => {
    if (!fileManagerDragActiveRef.current) return
    const newWidth = Math.min(Math.max(e.clientX, 200), 560)
    setFileManagerWidth(newWidth)
  }, [])

  const stopFileManagerDrag = useCallback(() => {
    fileManagerDragActiveRef.current = false
    setIsDraggingFileManager(false)
  }, [])

  useEffect(() => {
    if (!isDraggingFileManager) return
    window.addEventListener('mousemove', handleFileManagerDrag)
    window.addEventListener('mouseup', stopFileManagerDrag)
    return () => {
      window.removeEventListener('mousemove', handleFileManagerDrag)
      window.removeEventListener('mouseup', stopFileManagerDrag)
    }
  }, [isDraggingFileManager, handleFileManagerDrag, stopFileManagerDrag])

  useEffect(() => {
    const handleDrag = (e) => {
      const bounds = mainContentRef.current?.getBoundingClientRect()
      if (!bounds?.width) return
      if (isDraggingH) {
        const width = ((e.clientX - bounds.left) / bounds.width) * 100
        setLeftPanelWidth(Math.min(Math.max(width, 20), isAIChatOpen ? 80 - aiChatWidth : 72))
      }
      if (isDraggingAI) {
        const width = ((bounds.right - e.clientX) / bounds.width) * 100
        setAiChatWidth(Math.min(Math.max(width, 15), 80 - leftPanelWidth))
      }
      if (isDraggingV) {
        const leftPanel = document.querySelector('.left-panel')
        if (leftPanel) {
          const rect = leftPanel.getBoundingClientRect()
          const offset = e.clientY - rect.top
          const percentage = (1 - (offset / rect.height)) * 100
          setConsoleHeight(Math.min(Math.max(percentage, 5), 85))
        }
      }
    }

    const stopDrag = () => {
      setIsDraggingH(false)
      setIsDraggingV(false)
      setIsDraggingAI(false)
    }

    if (isDraggingH || isDraggingV || isDraggingAI) {
      window.addEventListener('mousemove', handleDrag)
      window.addEventListener('mouseup', stopDrag)
    }

    return () => {
      window.removeEventListener('mousemove', handleDrag)
      window.removeEventListener('mouseup', stopDrag)
    }
  }, [isDraggingH, isDraggingV, isDraggingAI, aiChatWidth, isAIChatOpen, leftPanelWidth])

  const showExecutionStep = useCallback((index) => {
    const sim = simulatorRef.current
    const snapshot = sim?.history[index]
    if (!snapshot) return
    setCurrentStep(index)
    const output = snapshot.output
    if (index === sim.history.length - 1 && executionCapped.current) {
      output.push(EXECUTION_LIMIT_MESSAGE)
    }
    setConsoleOutput(output)
  }, [])

  const prepareSimulation = useCallback((mode) => {
    setIsPlaying(false)
    setActiveTab('simulation')
    try {
      const sim = new AsmSimulator(code)
      if (sim.instructions.length === 0) {
        resetSimulation()
        setConsoleOutput(['未发现可执行的 8086 指令。请选择示例或检查源代码。'])
        setShowConsole(true)
        return
      }

      sim.setInput(consoleInput)
      executionCapped.current = sim.run(MAX_EXECUTION_STEPS)
      simulatorRef.current = sim
      setTotalSteps(sim.history.length)
      setExplanations(sim.explanations)

      if (mode === 'parse') {
        setCurrentStep(0)
        setConsoleOutput([
          `解析完成，共 ${sim.instructions.length} 条指令。\n`,
          executionCapped.current ? EXECUTION_LIMIT_MESSAGE : '点击「单步」查看下一条指令。'
        ])
        advanceDemoTo(1)
      } else {
        showExecutionStep(mode === 'run' ? sim.history.length - 1 : 1)
        advanceDemoTo(2)
      }
      setShowConsole(true)
    } catch (error) {
      resetSimulation()
      setConsoleOutput([`解析失败：${error.message}`])
      setShowConsole(true)
    }
  }, [code, consoleInput, advanceDemoTo, resetSimulation, showExecutionStep])

  const handleParse = () => prepareSimulation('parse')
  const handleRun = () => prepareSimulation('run')

  // ==================== 网页端运行 (WASM) ====================
  const handleRunWeb = useCallback(async () => {
    // 取消上一次还在进行的请求
    if (backendCompileCtrlRef.current) {
      backendCompileCtrlRef.current.abort()
    }
    const ctrl = new AbortController()
    backendCompileCtrlRef.current = ctrl
    const requestId = ++backendCompileRequestIdRef.current

    setShowConsole(true)
    setBackendCompileLoading(true)
    setDosExeData(null)   // 重置旧 DOS 结果，防止残留
    setConsoleOutput([])
    setIsPlaying(false)

    try {
      const result = await backendService.getExecutable(code, ctrl.signal)
      // 主动取消的请求会走 catch (AbortError)，不会执行到这里
      if (backendCompileRequestIdRef.current !== requestId) return

      if (result.success && result.executable) {
        setDosExeData(result.executable)
        setShowDosPlayer(true)
        setConsoleOutput(['✅ 编译成功！正在启动 JS-DOS...'])
      } else {
        const outputLines = ['❌ 编译错误:']
        if (result.stderr) outputLines.push(result.stderr)
        if (result.errors) result.errors.forEach(err => outputLines.push(`[${err.type}] ${err.message} `))
        setConsoleOutput(outputLines)
      }
    } catch (e) {
      // AbortController.abort() 抛出的 DOMException 属正常中断，无需处理
      if (e.name === 'AbortError') return
      if (backendCompileRequestIdRef.current !== requestId) return
      setConsoleOutput(['❌ 编译请求失败: ' + e.message])
    } finally {
      if (backendCompileRequestIdRef.current === requestId) {
        setBackendCompileLoading(false)
        backendCompileCtrlRef.current = null
        setShowConsole(true)   // 完成 / 失败均弹窗
      }
    }
  }, [code])



  const handleStepBack = () => {
    setIsPlaying(false)
    showExecutionStep(currentStep - 1)
  }

  const handleStepChange = (newStep) => {
    setIsPlaying(false)
    showExecutionStep(newStep)
    advanceDemoTo(2)
  }

  const handleStep = () => {
    setIsPlaying(false)
    if (!simulatorRef.current) {
      prepareSimulation('step')
      return
    }
    showExecutionStep(currentStep + 1)
    advanceDemoTo(2)
  }

  const togglePlay = () => {
    if (currentStep >= totalSteps - 1) showExecutionStep(0)
    setIsPlaying(playing => !playing)
  }

  // Clear Console
  const handleClearConsole = useCallback(() => {
    setConsoleOutput([])
  }, [])


  // AI Analysis Handlers（per-file 状态，互不干扰）
  // 每个文件的分析结果存储在 aiAnalysisMap 中，切换文件不会丢失结果
  const handleAIAnalysis = async () => {
    if (!currentFileId) return
    const fid = currentFileId
    // 从当前文件的 Map 中获取已有分析结果
    const existing = aiAnalysisMap[fid]
    // 有结果时跳过，不重复请求
    if (existing && (existing.summary || existing.rawContent || (existing.lineAnalysis && existing.lineAnalysis.length))) return

    setAiLoadingMap(prev => ({ ...prev, [fid]: true }))
    setAiErrorMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    try {
      const result = await analyzeAssemblyCode(code)
      // 仅当仍属于当前文件时写入
      if (currentFileId !== fid) return
      setAiAnalysisMap(prev => {
        const next = { ...prev, [fid]: { ...(prev[fid] || {}), ...result } }
        setFileAIAnalysisSnapshot(fid, next[fid])
        return next
      })
      setActiveTab('ai')
      setAiViewMap(prev => ({ ...prev, [fid]: 'basic' }))
      advanceDemoTo(4)
    } catch (err) {
      if (err.name === 'AbortError') return
      if (currentFileId !== fid) return
      setAiErrorMap(prev => ({ ...prev, [fid]: err.message }))
    } finally {
      setAiLoadingMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    }
  }

  const handleGenerateFlowchart = async () => {
    if (!currentFileId) return
    const fid = currentFileId
    const existing = aiAnalysisMap[fid]
    // 有结果时跳过，不重复请求
    if (existing && existing.flowchart) return
    setFlowchartLoadingMap(prev => ({ ...prev, [fid]: true }))
    setAiErrorMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    try {
      const result = await generateFlowchart(code)
      if (currentFileId !== fid) return
      setAiAnalysisMap(prev => {
        const next = { ...prev, [fid]: { ...(prev[fid] || {}), flowchart: result.mermaidCode, flowchartWarning: result.warning } }
        setFileAIAnalysisSnapshot(fid, next[fid])
        return next
      })
      setActiveTab('ai')
      setAiViewMap(prev => ({ ...prev, [fid]: 'flowchart' }))
      advanceDemoTo(4)
      return result
    } catch (err) {
      if (err.name === 'AbortError') return
      if (currentFileId !== fid) return
      setAiErrorMap(prev => ({ ...prev, [fid]: err.message }))
      throw err
    } finally {
      setFlowchartLoadingMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    }
  }

  const handleFullAnalysis = async () => {
    if (!currentFileId) return
    const fid = currentFileId
    const existing = aiAnalysisMap[fid]
    // 有结果时跳过，不重复请求
    if (existing && existing.fullAnalysis) return
    setFullLoadingMap(prev => ({ ...prev, [fid]: true }))
    setAiErrorMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    try {
      const result = await fullSemanticAnalysis(code)
      if (currentFileId !== fid) return
      setAiAnalysisMap(prev => {
        const next = { ...prev, [fid]: { ...(prev[fid] || {}), fullAnalysis: result } }
        setFileAIAnalysisSnapshot(fid, next[fid])
        return next
      })
      setActiveTab('ai')
      setAiViewMap(prev => ({ ...prev, [fid]: 'full' }))
      advanceDemoTo(4)
      return result
    } catch (err) {
      if (err.name === 'AbortError') return
      if (currentFileId !== fid) return
      setAiErrorMap(prev => ({ ...prev, [fid]: err.message }))
      throw err
    } finally {
      setFullLoadingMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    }
  }

  // 强制刷新：先清空对应结果，再重新请求
  const handleRefreshBasic = async () => {
    if (!currentFileId) return
    if (!checkAILimit()) return
    const fid = currentFileId
    setAiLoadingMap(prev => ({ ...prev, [fid]: true }))
    setAiErrorMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    try {
      const result = await analyzeAssemblyCode(code)
      if (currentFileId !== fid) return
      setAiAnalysisMap(prev => {
        const next = { ...prev, [fid]: { ...(prev[fid] || {}), ...result } }
        setFileAIAnalysisSnapshot(fid, next[fid])
        return next
      })
      advanceDemoTo(4)
    } catch (err) {
      if (currentFileId === fid) setAiErrorMap(prev => ({ ...prev, [fid]: err.message || '分析失败' }))
    } finally {
      if (currentFileId === fid) setAiLoadingMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    }
  }

  const handleRefreshFlowchart = async () => {
    if (!currentFileId) return
    if (!checkAILimit()) return
    const fid = currentFileId
    setFlowchartLoadingMap(prev => ({ ...prev, [fid]: true }))
    setAiErrorMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    try {
      const result = await generateFlowchart(code)
      if (currentFileId !== fid) return
      setAiAnalysisMap(prev => {
        const next = { ...prev, [fid]: { ...(prev[fid] || {}), flowchart: result.mermaidCode, flowchartWarning: result.warning } }
        setFileAIAnalysisSnapshot(fid, next[fid])
        return next
      })
      advanceDemoTo(4)
    } catch (err) {
      if (currentFileId === fid) setAiErrorMap(prev => ({ ...prev, [fid]: err.message || '生成失败' }))
    } finally {
      if (currentFileId === fid) setFlowchartLoadingMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    }
  }

  const handleRefreshFull = async () => {
    if (!currentFileId) return
    if (!checkAILimit()) return
    const fid = currentFileId
    setFullLoadingMap(prev => ({ ...prev, [fid]: true }))
    setAiErrorMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    try {
      const result = await fullSemanticAnalysis(code)
      if (currentFileId !== fid) return
      setAiAnalysisMap(prev => {
        const next = { ...prev, [fid]: { ...(prev[fid] || {}), fullAnalysis: result } }
        setFileAIAnalysisSnapshot(fid, next[fid])
        return next
      })
      advanceDemoTo(4)
    } catch (err) {
      if (currentFileId === fid) setAiErrorMap(prev => ({ ...prev, [fid]: err.message || '分析失败' }))
    } finally {
      if (currentFileId === fid) setFullLoadingMap(prev => { const n = { ...prev }; delete n[fid]; return n })
    }
  }

  const handleViewChange = (view) => {
    const fid = currentFileId
    if (!fid) return
    setActiveTab('ai')
    setAiViewMap(prev => ({ ...prev, [fid]: view }))
    advanceDemoTo(3)
  }

  const handleAutoComment = async () => {
    if (!currentFileId) return
    const revision = editRevision.current
    setAutoCommentLoading(true)
    try {
      const newCode = await addCommentsToCode(code)
      if (revision === editRevision.current) handleCodeChange(newCode)
    } catch (error) {
      if (revision !== editRevision.current) return
      console.error("Auto comment error:", error)
      setAiErrorMap(prev => ({ ...prev, [currentFileId]: "Failed to generate comments" }))
      setConsoleOutput(prev => [...prev, `❌ 自动注释生成失败: ${error.message} `, '请检查网络连接或 API Key 设置。'])
      setShowConsole(true)
    } finally {
      setAutoCommentLoading(false)
    }
  }

  useEffect(() => {
    if (!isPlaying || !totalSteps) return
    const nextStep = currentStep + 1
    const timeoutId = setTimeout(() => {
      showExecutionStep(nextStep)
      if (nextStep >= totalSteps - 1) {
        setIsPlaying(false)
        setShowConsole(true)
      }
    }, speed)
    return () => clearTimeout(timeoutId)
  }, [currentStep, isPlaying, showExecutionStep, speed, totalSteps])

  const currentState = useMemo(() => (
    totalSteps ? simulatorRef.current?.getFullState(currentStep) ?? INITIAL_CPU_STATE : INITIAL_CPU_STATE
  ), [currentStep, totalSteps, code, consoleInput])

  return (
    <div className="app-container" style={{ cursor: isDraggingH || isDraggingAI || isDraggingFileManager ? 'col-resize' : (isDraggingV ? 'row-resize' : 'default') }}>
      {/* 文件管理器侧边栏 - 可拖拽收缩 */}
      <FileManager
        isOpen={isFileManagerOpen}
        onClose={() => setIsFileManagerOpen(false)}
        onFileSelect={handleFileSelect}
        onFileRename={(id, name) => {
          if (id === currentFileId) setCurrentFile(file => ({ ...file, name }))
        }}
        currentFileId={currentFileId}
        width={fileManagerWidth}
      />

      {/* 拖拽条 - 仅侧边栏打开时显示，与面板右缘对齐 */}
      {isFileManagerOpen && (
        <div
          className={`file-manager-drag-bar visible ${isDraggingFileManager ? 'dragging' : ''}`}
          style={{ left: `${fileManagerWidth}px` }}
          onMouseDown={startDragFileManager}
        />
      )}

      {/* 主内容区域 - 侧边栏打开时收缩 */}
      <div
        className="main-wrapper"
        style={{
          marginLeft: isFileManagerOpen ? `${fileManagerWidth}px` : '0px',
          transition: isDraggingFileManager ? 'none' : 'margin-left 0.2s ease'
        }}
      >
        <Header
          isPro={isPro}
          onUpgrade={() => setShowPaywall(true)}
          activeMode={appMode}
          onModeChange={handleModeChange}
        />

        {appMode === 'teacher' ? (
          <TeacherDashboard />
        ) : (
        <main className="main-content" ref={mainContentRef}>
          {/* Left Panel: Code & Console */}
          <div className="left-panel" style={{ width: `${leftPanelWidth}% ` }}>
            <div className="code-editor-section" style={{ height: showConsole ? `${100 - consoleHeight}% ` : '100% ' }}>
              <CodeEditor
                code={code}
                onChange={handleCodeChange}
                currentLine={currentState.lineNumber}
                onAutoComment={handleAutoComment}
                isAutoCommenting={autoCommentLoading}
                fileName={currentFile?.name || '未命名.asm'}
                onOpenFileManager={() => setIsFileManagerOpen(true)}
                onSave={handleSave}
                onImport={handleImport}
                onDownload={handleDownload}
                saveStatus={saveStatus}
                fileNotice={fileNotice}
              />
            </div>

          {showConsole && (
            <>
              <div
                className={`resizer-vertical ${isDraggingV ? 'resizing-v' : ''}`}
                onMouseDown={startDragV}
                title="Drag to resize console"
              />
              <div className="console-section" style={{ height: `${consoleHeight}% ` }}>
                <ConsolePanel
                  output={consoleOutput}
                  error={currentState.error}
                  input={consoleInput}
                  onInputChange={handleInputChange}
                  onClear={handleClearConsole}
                  onClose={() => setShowConsole(false)}
                  isBackendCompileLoading={backendCompileLoading}
                />

              </div>
            </>
          )}
        </div>

        <div
          className={`resizer-horizontal ${isDraggingH ? 'resizing-h' : ''}`}
          onMouseDown={startDragH}
          title="Drag to resize panels"
        />

        {/* Right Panel: Controls & Visualizer */}
        <div className="right-panel" style={{ width: `${100 - leftPanelWidth - (isAIChatOpen ? aiChatWidth : 0)}% ` }}>
          <ControlPanel
            onParse={handleParse}
            onStep={handleStep}
            onStepBack={handleStepBack}
            onStepChange={handleStepChange}
            onReset={resetSimulation}
            onTogglePlay={togglePlay}
            onRun={handleRun}
            onRunWeb={handleRunWeb}
            isStaticSite={IS_STATIC_SITE}
            backendCompileLoading={backendCompileLoading}
            onShowConsole={() => setShowConsole(prev => !prev)}
            /* sInteractive={isInteractive} */
            /* onToggleInteractive={() => setIsInteractive(prev => !prev)} */
            isPlaying={isPlaying}

            canStep={totalSteps ? currentStep < totalSteps - 1 : !!code.trim()}
            speed={speed}
            onSpeedChange={setSpeed}
            currentStep={currentStep}
            totalSteps={totalSteps}
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab)
              if (tab === 'ai') {
                setIsPlaying(false)
                advanceDemoTo(3)
              }
            }}
            demoHighlightStep={isDemoHighlightActive ? demoStepIndex : null}

          />

            <DemoGuide
              programs={DEMO_PROGRAMS}
              activeProgramKey={activeDemoKey}
              currentStep={demoStepIndex}
              isOpen={isDemoGuideOpen}
              onToggle={() => setIsDemoGuideOpen(open => !open)}
              onSelectProgram={handleDemoProgramSelect}
              onNext={() => setDemoStepIndex(prev => Math.min(prev + 1, 4))}
              onPrev={() => setDemoStepIndex(prev => Math.max(prev - 1, 0))}
              onClose={handleDemoGuideClose}
            />

          <div className="content-area">
            {activeTab === 'simulation' ? (
              <>
                <Visualizer
                  state={currentState}
                  demoHighlightRegisters={isDemoHighlightActive && demoStepIndex === 1}
                >
                  <Explanation explanations={explanations} currentLine={currentState.lineNumber} />
                </Visualizer>
              </>
            ) : IS_STATIC_SITE ? (
              <section className="card service-notice">
                <h2>AI 分析</h2>
                <p>在线演示支持本地编写、执行与回溯汇编程序。联机分析和答疑需要启动 AI 服务。</p>
              </section>
            ) : (
              <AIAnalysis
                analysis={currentAiAnalysis}
                loading={isAiLoading}
                flowchartLoading={isFlowchartLoading}
                fullLoading={isFullLoading}
                error={currentAiError}
                activeView={currentAiView}
                onViewChange={handleViewChange}
                onRefreshBasic={handleRefreshBasic}
                onRefreshFlowchart={handleRefreshFlowchart}
                onRefreshFull={handleRefreshFull}
              />
            )}
          </div>
        </div>

        {isAIChatOpen && (
          <>
            <div
              className={`resizer-horizontal ${isDraggingAI ? 'resizing-h' : ''}`}
              onMouseDown={startDragAI}
              title="Drag to resize AI chat"
            />
            <div className="ai-chat-sidebar" style={{ width: `${aiChatWidth}%` }}>
              <AIChat
                isOpen={isAIChatOpen}
                messages={chatMessages}
                setMessages={setChatMessages}
                isLoading={!!(currentFileId && chatLoadingMap[currentFileId])}
                onClose={() => setIsAIChatOpen(false)}
                currentCode={code}
                currentFileId={currentFileId}
                onSendMessage={async (userMessage, conversationHistory) => {
                  if (!currentFileId) return
                  const fid = currentFileId
                  // 取消该文件的上一次对话请求
                  if (chatAbortMapRef.current[fid]) {
                    chatAbortMapRef.current[fid].abort()
                  }
                  const ctrl = new AbortController()
                  chatAbortMapRef.current[fid] = ctrl
                  setChatLoadingMap(prev => ({ ...prev, [fid]: true }))

                  setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
                  try {
                    const response = await chatWithAI(userMessage, conversationHistory, code || '', ctrl.signal)
                    // 仅当仍属于当前文件时写入
                    if (chatAbortMapRef.current[fid] === ctrl) {
                      setChatMessages(prev => [...prev, { role: 'assistant', content: response }])
                    }
                  } catch (err) {
                    if (err.name === 'AbortError') return
                    if (chatAbortMapRef.current[fid] === ctrl) {
                      setChatMessages(prev => [...prev, {
                        role: 'assistant',
                        content: '抱歉，我遇到了一些问题：' + err.message + '\n\n请稍后再试。'
                      }])
                    }
                  } finally {
                    if (chatAbortMapRef.current[fid] === ctrl) {
                      delete chatAbortMapRef.current[fid]
                      setChatLoadingMap(prev => { const n = { ...prev }; delete n[fid]; return n })
                    }
                  }
                }}
                onApplyCode={handleCodeChange}
              />
            </div>
          </>
        )}
      </main>
        )}
      </div>{/* 关闭 main-wrapper */}

      {appMode === 'student' && !isAIChatOpen && !IS_STATIC_SITE && (
        <button
          className={`ai-chat-trigger ${isDemoHighlightActive && demoStepIndex === 4 ? 'demo-highlight-target' : ''}`}
          onClick={() => {
            setLeftPanelWidth(width => Math.min(width, 80 - aiChatWidth))
            setIsAIChatOpen(true)
            advanceDemoTo(4)
          }}
          title="AI 答疑解惑"
        >
          <span>💬</span>
        </button>
      )}

      {showDosPlayer && (
        <DosPlayer
          exeData={dosExeData}
          onClose={() => setShowDosPlayer(false)}
        />
      )}

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setIsPro(true)
          setShowPaywall(false)
        }}
      />
    </div>
  )
}

export default App
