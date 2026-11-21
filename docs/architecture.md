# 项目总结与架构档案

当前安装与部署步骤见[部署指南](deployment.md)。

项目名称：汇编程——基于端云混合架构的 AI 汇编可视化教学平台 
更新日期：2026-04-04 
版本：v1.0.6 
文档定位：面向维护者、架构评审与大赛评委的完整项目档案

一、项目总览
属性	内容
项目名称	汇编程 / CodeBuddy
项目定位	面向高校学生的 8086 汇编语言在线学习与调试平台
核心价值	零配置浏览器内可视化执行 + AI 智能助教 + 毫秒级时间旅行调试
前端	React 18.2.0 + Vite 5.0.8
后端	Node.js (Express) + SQLite（WAL 模式）
沙箱	Python Flask + NASM / GCC / JWasm / WLink / DOSBox + waitress 生产级 WSGI
AI	阿里云百炼 DashScope（DeepSeek V3）
主要特性：	
纯 JavaScript 8086 指令集虚拟机（src/core/asmSimulator.js，1631 行）
独创稀疏内存快照算法，支撑 20000 步历史溯源
AI 逐行中文注释、Mermaid 流程图、完整语义分析
Node.js All-In-One 网关代理 + PM2 进程管理，Windows Server 生产级一键部署
跨平台汇编编译（64-bit 原生 + 16-bit DOS）
SQLite WAL 模式，支持多用户并发读写
二、项目目录结构

```text
Assembly/
│
├── .env.example                          # 环境变量示例
├── package.json                          # 前端依赖
├── vite.config.js                        # Vite 配置（含 /api /dashscope 代理规则）
├── index.html                            # HTML 入口
├── AI_协同流程说明文档.md                 # OPC 赛道 AI 协同说明
├── ecosystem.config.cjs                  # PM2 进程管理配置（生产环境推荐）
├── scripts/                              # Windows 启动、PM2 管理与打包脚本
├── docs/                                 # 项目文档
│
├── src/                                  # ========================================
│   ├── main.jsx                         # React 挂载入口
│   ├── App.jsx                          # 主应用（991 行，状态中枢）
│   │
│   ├── core/
│   │   └── asmSimulator.js             # 【核心】8086 模拟器（1631 行，纯 JS）
│   │
│   ├── services/
│   │   ├── aiService.js               # 【核心】AI 服务（1816 行）
│   │   ├── fileService.js             # 文件管理（localStorage CRUD，338 行）
│   │   └── backendService.js          # 后端 API 代理（70 行）
│   │
│   ├── components/
│   │   ├── Header.jsx / .css          # 顶部导航栏
│   │   ├── CodeEditor.jsx / .css      # 代码编辑器（Prism.js 语法高亮 + 补全）
│   │   ├── Visualizer.jsx / .css      # CPU 可视化（寄存器/内存/标志位）
│   │   ├── Explanation.jsx / .css     # 指令执行解释面板
│   │   ├── ControlPanel.jsx / .css     # 控制面板（Parse/Step/Run/AI）
│   │   ├── AIAnalysis.jsx / .css      # AI 分析展示（基础/流程图/语义）
│   │   ├── AIChat.jsx / .css         # AI 对话侧边栏
│   │   ├── ConsolePanel.jsx / .css     # 终端输出面板
│   │   ├── DosPlayer.jsx / .css       # JS-DOS 播放器
│   │   ├── FileManager.jsx / .css      # 文件管理器（多文件 + 拖拽排序）
│   │   └── ErrorBoundary.jsx           # React 错误边界
│   │
│   ├── styles/
│   │   ├── App.css                    # 主布局样式
│   │   └── index.css                  # 全局基础样式
│   │
│   └── utils/
│       └── syntaxHighlighter.js        # MASM 语法高亮规则
│
├── server/                              # ========================================
│   ├── server.js                      # Express 主入口（356 行，端口 3001）
│   ├── package.json                   # 后端依赖
│   └── data/                          # SQLite 数据库目录
│
├── sandbox/                             # ========================================
│   ├── api_endpoint.py               # 【核心】Flask API 整合入口（沙箱 + 调试）
│   ├── assembler_runner.py            # 跨平台汇编编译器（NASM/GCC/JWasm）
│   ├── debug_endpoint.py              # GDB MI 调试蓝图（10 个端点）
│   ├── start_sandbox.bat             # 沙箱启动脚本
│   └── tools/                         # 编译器工具目录（nasm/gcc/jwasm/wlink）
│
└── dist/                               # ========================================
    └── assets/                        # Vite 生产构建产物
```

三、技术架构
3.1 系统整体架构
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    用户浏览器 (Browser)                           │
│   React 18 SPA → asmSimulator.js 虚拟机 / AI 分析 / JS-DOS DosPlayer            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────┐  ┌──────────────────────────────────────────────────────┐    │
│  │  FileManager    │  │                   Left Panel                          │    │
│  │  (文件管理器)    │  │  ┌──────────────────────┐  ┌──────────────────────┐  │    │
│  │  · 多文件切换    │  │  │   CodeEditor          │  │  ControlPanel         │  │    │
│  │  · 拖拽排序      │  │  │   代码编辑器           │  │  · Parse / Run / Step  │  │    │
│  │  · 新建/重命名   │  │  │  · 语法高亮           │  │  · ▶/⏸ 自动播放       │  │    │
│  │  · 删除文件      │  │  │  · AI 内联补全       │  │  · AI Analysis        │  │    │
│  │                 │  │  │  · 行号/当前行高亮  │  │  · 速度滑块           │  │    │
│  └─────────────────┘  │  └──────────────────────┘  └──────────────────────┘  │    │
│                       │  ┌──────────────────────────────────────────────────┐ │    │
│                       │  │         ConsolePanel（终端输出）                  │ │    │
│                       │  └──────────────────────────────────────────────────┘ │    │
│                       └──────────────────────────────────────────────────────┘    │
│                                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────────────┐ │
│  │                           Right Panel                                        │ │
│  │  ┌───────────────────────────┐  ┌────────────────────────────────────────┐  │ │
│  │  │    Visualizer (CPU可视化)   │  │    AIAnalysis (AI 分析面板)             │  │ │
│  │  │  ┌─────────┐ ┌──────────┐ │  │  [基础分析] [流程图] [完整语义]         │  │ │
│  │  │  │寄存器   │ │  内存映射  │ │  │                                        │  │ │
│  │  │  │AX/BX/   │ │ 栈:16字  │ │  │  · 代码概述 + 逐行中文注释            │  │ │
│  │  │  │CX/DX/   │ │ 内存视图  │ │  │  · Mermaid SVG 流程图               │  │ │
│  │  │  │SP/BP/   │ │          │ │  │  · 算法 + 关键点 + 常见错误           │  │ │
│  │  │  │SI/DI    │ │          │ │  │                                        │  │ │
│  │  │  └─────────┘ └──────────┘ │  └────────────────────────────────────────┘  │ │
│  │  │  ┌─────────┐ ┌──────────┐ │  ┌────────────────────────────────────────┐  │ │
│  │  │  │标志位   │ │  当前指令  │ │  │    Explanation (指令解释)              │  │ │
│  │  │  │ZF/SF/  │ │ MOV AX,5 │ │  │    按指令类型分组说明                   │  │ │
│  │  │  │OF/CF   │ │ 正在执行 │ │  │                                        │  │ │
│  │  │  └─────────┘ └──────────┘ │  └────────────────────────────────────────┘  │ │
│  │  └───────────────────────────┘                                            │ │
│  └──────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────────────┐ │
│  │                    AIChat (AI 答疑侧边栏)                                     │ │
│  │     实时对话 · 快捷问题 · 代码块一键应用 · per-file 对话历史                  │ │
│  └──────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
                    │                                         │
                    ▼                                         ▼
        ┌───────────────────────┐               ┌─────────────────────────────┐
        │    localStorage        │               │     Node.js (port 3001)     │
        │  files[] / activeId    │               │  ┌─────────────────────────┐ │
        └───────────────────────┘               │  │ /api/sandbox/*           │ │
                                               │  │ → Python 沙盒转发       │ │
                                               │  └─────────────────────────┘ │
                                               │  ┌─────────────────────────┐ │
                                               │  │ /dashscope/*            │ │
                                               │  │ → 阿里云 DashScope      │ │
                                               │  └─────────────────────────┘ │
                                               │  ┌─────────────────────────┐ │
                                               │  │ /api/files/*            │ │
                                               │  │ → SQLite CRUD           │ │
                                               │  └─────────────────────────┘ │
                                               │  ┌─────────────────────────┐ │
                                               │  │ /api/debug/*            │ │
                                               │  │ → GDB MI 调试代理       │ │
                                               │  └─────────────────────────┘ │
                                               │  ┌─────────────────────────┐ │
                                               │  │ express.static (dist/)  │ │
                                               │  │ → 前端静态资源托管       │ │
                                               │  └─────────────────────────┘ │
                                               └─────────────────────────────┘
                                                               │
                                                               ▼
                                               ┌─────────────────────────────┐
                                               │  Python 沙箱 (port 5000)    │
                                               │  waitress WSGI (8 threads)  │
                                               │  ├─ AssemblerRunner         │
                                               │  ├─ /api/sandbox/check      │
                                               │  ├─ /api/sandbox/run        │
                                               │  ├─ /api/sandbox/compile    │
                                               │  ├─ /api/sandbox/executable │
                                               │  └─ /api/debug/* (GDB MI)   │
                                               └─────────────────────────────┘
3.2 端口分配
端口	服务	技术栈	说明
3000	前端（开发）	React + Vite	npm run dev，代理 /api 和 /dashscope
3001	生产网关	Node.js Express	唯一对外暴露端口，All-In-One 托管
5000	Python 沙盒	Flask + waitress	内部端口，禁止外网暴露，Node.js 代理转发
3.3 数据持久化架构
每个文件 ========================== 一个完整的学习存档
    │
    ├── code              代码内容
    ├── aiAnalysis        该文件下 AI 分析结果（基础/流程图/语义）
    ├── chatMessages      该文件下 AI 对话历史
    ├── aiView            当前 AI 视图状态
    └── updatedAt          最后修改时间
四、核心模块详解
4.1 asmSimulator.js（8086 模拟器核心）
文件: src/core/asmSimulator.js | 行数: 1631 行 | 实现: 纯 JavaScript，无外部依赖

状态对象
{
  // 通用寄存器（16-bit）
  ax: 0, bx: 0, cx: 0, dx: 0,
  // 指针寄存器
  sp: 0xFFFE, bp: 0, si: 0, di: 0,
  // 段寄存器
  cs: 0, ds: 0, ss: 0, es: 0,
  // 指令指针
  ip: 0,
  // 标志位
  flags: { z: false, s: false, o: false, c: false },
  // 64KB 内存
  memory: new Array(65536).fill(0),
  // INT 21h 输出缓冲
  output: [],
  // INT 21h/AH=0A 输入队列
  inputQueue: [],
  // 本步活跃的寄存器/内存（UI 高亮用）
  activeRegisters: [], activeMemory: [],
  // 当前正在执行的指令字符串
  currentInstruction: null,
  error: null
}
核心方法
方法	功能
step()	执行单条指令，返回是否继续执行
run(steps)	执行指定步数
getFullState(index)	获取指定步完整状态（含稀疏内存重建）
setInput(text)	设置 STDIN 输入数据
parseAssembly(code)	解析 MASM 风格汇编代码
getValue(operand)	获取操作数的值
setValue(operand, value)	设置操作数的值
updateFlags(...)	根据运算结果更新标志位
稀疏内存快照机制（核心性能优化）
// 用 Set 追踪已使用地址，替代全量数组
this._nonZeroAddrs = new Set();
// recordHistory() 中：仅存储发生偏移的非零地址
for (const addr of this._nonZeroAddrs) {
  const val = this.state.memory[addr];
  if (val !== 0) sparseMemory[addr] = val;
}
// 存储 { addr: value } 对象，而非完整 65536 数组
MAX_HISTORY = 20000
效果：空间复杂度从 O(65536 × N) 降为 O(k × N)，支撑 20000 步指令历史溯源而不触发浏览器 OOM。

指令集覆盖
类别	指令
数据传送	MOV, PUSH, POP, LEA, XCHG, LAHF, SAHF
算术运算	ADD, SUB, ADC, SBB, INC, DEC, NEG, CMP, MUL, IMUL, DIV, IDIV, CBW, CWD
逻辑运算	AND, OR, XOR, NOT, TEST
移位/循环	SHL, SHR, SAL, SAR, ROL, ROR, RCL, RCR
控制转移	JMP, JE/JZ, JNE/JNZ, JG, JGE, JL, JLE, JA, JAE, JB, JBE, JC, JNC, JS, JNS, JO, JNO, LOOP, LOOPE, LOOPNE, CALL, RET
处理器控制	CLC, STC, CMC, CLD, STD, NOP, HLT, WAIT
中断	INT（INT 21h 支持 AH=01, 02, 07, 08, 09, 0A, 0B, 4C）
字符串指令	MOVSB/W, CMPSB/W, SCASB/W, LODSB/W, STOSB/W, REP/REPE/REPNE
汇编语法	SEGMENT/ENDS, ASSUME, DB/DW/DD, EQU, PROC/ENDP, OFFSET, PTR, :, END
4.2 aiService.js（AI 服务核心）
文件: src/services/aiService.js | 行数: 1816 行

配置
API_KEY       = import.meta.env.VITE_AI_API_KEY || ''
MODEL         = import.meta.env.VITE_AI_MODEL || 'deepseek-v3'
API_URL       = '/dashscope/compatible-mode/v1/chat/completions'
USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === true
导出函数
函数	用途
analyzeAssemblyCode(code)	基础 AI 分析（概述 + 逐行 + 寄存器流向 + 优化建议）
generateFlowchart(code)	生成 Mermaid 流程图
fullSemanticAnalysis(code)	完整语义分析（算法 + 关键点 + 常见错误）
addCommentsToCode(code)	自动为代码添加中文注释
chatWithAI(message, history, code, signal)	实时对话答疑（支持 AbortController 取消）
getInlineSuggestion(code, cursorIndex)	代码内联补全建议
API 调用封装
async function callOpenAI(messages, temperature, max_tokens) {
  // 超时: 3 分钟（180000ms）
  // 重试: 最多 2 次（504 / 429 状态码自动重试）
  // 自动从响应中提取 JSON
}
4.3 fileService.js（文件管理服务）
文件: src/services/fileService.js | 行数: 338 行

文件对象结构
{
  id: "file_a1b2c3d4",          // UUID
  name: "main.asm",              // 文件名
  code: "MOV AX, 5\
...",        // 代码内容
  createdAt: "ISO 时间戳",       // 创建时间
  updatedAt: "ISO 时间戳",        // 修改时间
  aiAnalysis: { /* 分析结果 */ }, // 该文件的 AI 分析
  aiView: "basic",               // 当前 AI 视图
  aiError: null,                 // AI 错误
  chatMessages: [                // per-file AI 对话
    { role: "assistant", content: "你好！" },
    { role: "user", content: "这个循环怎么工作的？" }
  ]
}
核心函数
函数	说明
createFile(name)	创建新 .asm 文件
setActiveFile(id)	切换活动文件
updateFileCode(id, code)	更新代码（1 秒防抖自动保存）
renameFile(id, newName)	重命名
deleteFile(id)	删除文件
reorderFiles(orderedIds)	拖拽排序
setFileAIAnalysisSnapshot(id, snapshot)	保存 AI 分析
updateFileChatMessages(id, messages)	保存 per-file 对话
syncFilesToCloud()	同步到服务器 SQLite
fetchFilesFromCloud()	从服务器拉取
五、Node.js 后端（server/server.js）
文件: server/server.js | 行数: 356 行 | 端口: 3001 | 数据库: SQLite WAL 模式 (server/data/history.db)

数据库架构
-- files 表（analysis_history 表已废弃，不再写入）
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ai_analysis TEXT,       -- JSON：AI 分析结果
  chat_messages TEXT       -- JSON：AI 对话历史
)
-- 启用 WAL 模式，允许读写并发，大幅提升多用户性能
PRAGMA journal_mode=WAL
API 端点
端点	方法	功能
/api/files/sync	POST	批量同步文件到云端（upsert）
/api/files	GET	获取文件列表
/api/files/:id	GET	获取单个文件
/api/files/:id	DELETE	删除文件
/api/sandbox/run	POST	编译并运行汇编代码
/api/sandbox/executable	POST	编译并返回 EXE（base64，仅 DOS）
/api/sandbox/compile	POST	仅编译（语法检查）
/api/debug/*	POST/GET	GDB MI 调试代理（10 个端点）
/api/health	GET	健康检查
/dashscope/*	ALL	AI 模型代理（→ 阿里云 DashScope）
六、Python 沙箱（sandbox/）
6.1 api_endpoint.py（Flask API 整合入口）
文件: sandbox/api_endpoint.py | 框架: Flask + waitress（生产级多线程 WSGI） | 端口: 5000 整合 assembler_runner（编译运行）与 debug_endpoint（GDB 调试）两个模块：

路由	方法	功能
/health	GET	健康检查
/api/sandbox/check	GET	编译器依赖检测（nasm/gcc/jwasm/wlink）
/api/sandbox/run	POST	编译运行（含 DOS 自动识别）
/api/sandbox/compile	POST	仅编译
/api/sandbox/executable	POST	编译 DOS EXE 并返回 base64
生产环境使用 waitress（8 线程生产级 WSGI 服务器），自动降级为 Flask 开发服务器。		
6.2 assembler_runner.py（跨平台汇编编译器）
文件: sandbox/assembler_runner.py | 行数: 1087 行 | 安全: 临时目录隔离 + 超时熔断 + 输出截断

跨平台汇编编译
平台	编译命令
Windows 64-bit	nasm -f win64 → gcc -no-pie
Linux 64-bit	nasm -f elf64 -g -F dwarf → gcc -no-pie -m64
macOS 64-bit	nasm -f macho64 → gcc
DOS 16-bit	jwasm -bin → WLink file bin → DOSBox
错误解析器
函数	用途
parse_nasm_errors(stderr)	NASM 输出 → 结构化错误列表
parse_gcc_errors(stderr)	GCC 链接错误
_parse_jwasm_errors(log)	JWasm 输出
_parse_wlink_errors(log)	WLink 输出
6.3 debug_endpoint.py（GDB MI 调试蓝图）
文件: sandbox/debug_endpoint.py | 框架: Flask Blueprint | 端点: 10 个

路由	方法	功能
/api/debug/start	POST	启动调试会话
/api/debug/step	POST	单步执行
/api/debug/next	POST	跳过函数调用
/api/debug/continue	POST	继续执行
/api/debug/registers	POST	读取寄存器
/api/debug/memory	POST	读取内存
/api/debug/stack	POST	读取栈
/api/debug/disasm	POST	反汇编
/api/debug/breakpoint	POST	设置断点
/api/debug/sessions	GET	查询会话列表
七、App.jsx 核心状态与执行流程
文件: src/App.jsx | 行数: 991 行

核心状态
// 文件管理
code, currentFile, currentFileId, saveStatus, isFirstLoad
// 模拟器
simulationState, currentStep, isPlaying, speed, explanations
// 控制台
consoleOutput, consoleInput, showConsole, consoleHeight
// 布局（可拖拽分栏）
leftPanelWidth, aiChatWidth, fileManagerWidth
isDraggingH, isDraggingV, isDraggingAI, isDraggingFileManager
// AI 分析（per-file Map，切换文件不丢失分析）
aiAnalysisMap: { [fileId]: AnalysisResult }
aiErrorMap, aiViewMap, aiLoadingMap
flowchartLoadingMap, fullLoadingMap, autoCommentLoading
// AI 对话
chatMessages, isAIChatOpen
chatLoadingMap, chatAbortMap
// DOS 播放器
showDosPlayer, dosExeData
执行流程（预计算模型）
用户点击"解析"
  → new AsmSimulator(code)
  → sim.parseAssembly(code)
  → while (sim.step()) { }  // 预计算所有步，存入 history[]
  → setSimulationState({ historyLength: sim.history.length })
  → setCurrentStep(0)
用户点击"单步"
  → setCurrentStep(nextStep)
  → state = sim.getFullState(nextStep)  // 从 history 取状态
  → Visualizer / Explanation 渲染新状态
togglePlay()
  → useEffect + setTimeout 递归循环
  → 从 history 依次取步渲染
核心导入
import { createInitialState, AsmSimulator } from './core/asmSimulator'
import { analyzeAssemblyCode, generateFlowchart, addCommentsToCode,
         fullSemanticAnalysis, chatWithAI } from './services/aiService'
八、功能实现清单
8.1 模拟器功能
功能	状态	说明
8086 指令集模拟	✅	~70 条指令
MASM 语法解析	✅	SEGMENT/ENDS/DB/EQU/OFFSET 等
寄存器可视化	✅	AX-DI + CS-DS-SS-ES + IP + Flags
内存可视化	✅	栈附近 16 word
单步 / 自动播放	✅	setTimeout 递归循环，100-2000ms 可调
预计算执行模型	✅	解析时完整遍历所有步
稀疏内存快照	✅	_nonZeroAddrs Set 优化
DOS INT 21h 模拟	✅ 基础	AH=01/02/07/08/09/0A/0B/4C
8.2 AI 功能
功能	状态	说明
基础代码分析	✅	概述 + 逐行中文注释 + 寄存器流向
Mermaid 流程图	✅	自动从跳转指令生成 SVG
完整语义分析	✅	算法 + 关键点 + 常见错误
自动添加注释	✅	逐行中文注释
内联代码补全	✅	300ms 防抖
实时对话答疑	✅	支持代码块一键应用
Mock 数据降级	✅	API 不可用时自动切换
AbortController 取消	✅	快速切换文件时旧请求自动终止
8.3 编辑与文件管理
功能	状态	说明
MASM 语法高亮	✅	指令/寄存器/数字/注释
本地词汇补全	✅	~30 条指令词库
文件管理器	✅	新建/重命名/删除/拖拽排序
per-file AI 状态隔离	✅	切换文件不丢失分析结果
自动保存	✅	1 秒防抖
云端同步	✅	SQLite + 设备 ID
8.4 执行选项
功能	状态	说明
Web 模拟执行	✅	纯 JS asmSimulator
快速运行	✅	预计算 + 一步到位
后端编译执行	✅	NASM + GCC
16-bit DOS EXE	✅	JWasm + WLink + DOSBox
JS-DOS 播放	✅	iframe sandbox
编译器依赖检测	✅	/api/sandbox/check
九、Windows Server 云端生产环境部署
9.1 All-In-One 网关代理模式
整个系统的所有流量全部收敛在 server.js（端口 3001），彻底摒弃了 Nginx 反向代理：

静态托管：express.static 直接下发 dist/ 目录中的前端资源
DashScope 代理：Node.js 拦截 /dashscope/* 请求，附加真实 VITE_AI_API_KEY 后转发至阿里云，隐藏 Key 并绕过 CORS
沙盒反向代理：前端发送 /api/sandbox/* → Node.js 内部转发至 127.0.0.1:5000
9.2 PM2 进程管理方案（生产推荐）
PM2 是 Node.js 进程管理器，支持崩溃自动重启、开机自启、日志管理，比 bat 更适合长期运行的生产环境。

进程配置（ecosystem.config.cjs）
module.exports = {
  apps: [
    {
      name: 'codebuddy-flask',
      script: 'sandbox/api_endpoint.py',
      interpreter: 'python',
      cwd: __dirname,
      autorestart: true,
      max_memory_restart: '500M',
      error_file: __dirname + '/logs/flask-error.log',
      out_file: __dirname + '/logs/flask-out.log'
    },
    {
      name: 'codebuddy-server',
      script: 'server/server.js',
      exec_mode: 'fork',
      node_args: '--no-warnings',
      autorestart: true,
      max_memory_restart: '500M',
      error_file: __dirname + '/logs/server-error.log',
      out_file: __dirname + '/logs/server-out.log'
    }
  ]
};
首次配置
# 1. 安装 PM2（全局）
npm install -g pm2
# 2. 启动服务
npx pm2 start ecosystem.config.cjs
# 3. 查看状态
npx pm2 status
# 4. 保存进程列表（重启后自动恢复）
npx pm2 save
# 5. 设置开机自启
npx pm2 startup
# 以管理员权限运行输出的命令即可
`scripts/manage-pm2.bat`（交互式菜单）
选项	功能
1	启动所有服务
2	停止所有服务
3	重启所有服务
4	查看服务状态
5	查看实时日志
6	保存进程列表
7	设置开机自启
8	监控面板（实时资源）
对比：bat vs PM2
对比项	bat 脚本	PM2
崩溃自启	❌	✅
开机自启	❌	✅
日志持久化	❌（窗口关闭丢失）	✅（写入文件）
多进程管理	多个独立窗口	统一管理
内存限制	❌	✅（500M 上限防泄漏）
远程管理	❌	✅（pm2 命令远程操作）
9.3 增量更新流程（无需重装服务）
本地执行 npm run build，重新生成 dist/ 目录
上传 dist/ 目录（通过 FTP/SCP/宝塔面板等），覆盖服务器上的 dist/ 内容
刷新浏览器即可看到更新，无需重启 Node.js 服务

9.4 部署架构
用户浏览器
    │
    ▼
┌──────────────────────────────────────┐
│  http://服务器IP:3001                │
│  Node.js Express（PM2 守护）           │
│  ├─ GET /*        → 静态资源 dist/  │
│  ├─ POST /api/*  → 内部转发 5000    │
│  └─ GET /dashscope/* → 转发阿里云   │
└────────────────┬─────────────────────┘
                 │
                 ▼
         内部通信（127.0.0.1）
┌──────────────────────────────────────┐
│  http://127.0.0.1:5000              │
│  Flask + waitress（PM2 守护）         │
│  ├─ NASM  (16/32位汇编)             │
│  ├─ GCC   (C 代码编译)              │
│  ├─ JWasm (16位汇编)                │
│  └─ Wlink (链接器)                  │
└──────────────────────────────────────┘
十、缺失功能与改进建议
高优先级
功能	说明
双引擎交叉验证	AI 分析与模拟器执行各自独立，无法比对跳转逻辑差异
断点调试	无法在指定行设置断点
寄存器监视窗口	无法监视特定寄存器/内存地址
调用栈视图	CALL/RET 嵌套无调用栈展示
中优先级
功能	说明
浮点数（FPU）模拟	不支持 FLDCW / FADD / FMUL 等
INT 10h/13h/16h	DOS 图形/磁盘/键盘中断未实现
Web Worker 优化	大文件解析主线程阻塞
深色主题	仅有浅色主题
国际化（i18n）	仅支持中文
低优先级
功能	说明
单元测试 / E2E 测试	完全没有测试覆盖
PWA 离线支持	不支持 Service Worker
教学课程系统	无课程内容管理
性能分析器	无执行时间统计
十一、设计决策记录（ADR）
ADR-001：预计算执行模型
解析阶段完整遍历所有指令，将每步状态存入 history[]。单步和自动播放都从历史中读取，保证 UI 流畅。代价：解析阶段有一定延迟。

ADR-002：稀疏内存快照
历史状态中的内存不存储完整 65536 元素数组，只存储 _nonZeroAddrs 中记录的地址。getFullState(index) 通过合并历史快照与当前内存重建完整状态，空间复杂度从 O(65536 × N) 降为 O(k × N)。

ADR-003：Per-File AI 状态隔离
每个文件的 AI 分析结果独立缓存在 aiAnalysisMap（key = fileId）中，切换文件不丢失分析，也无需重新请求 AI。

ADR-004：AbortController 竞态控制
AI 请求使用 AbortController 支持取消，防止快速切换文件/视图时旧请求覆盖新结果。

ADR-005：文件即存档（历史记录整合）
将原本独立的全局历史时间线（analysis_history 表 + historyService.js）删除，改为以文件为粒度保存代码 + AI 分析结果 + AI 对话。每个 .asm 文件本身就是一份完整的"学习存档"。

ADR-006：All-In-One 网关代理
前端模拟执行（Web）、后端编译（沙盒）、AI 代理（DashScope）、文件存储（SQLite）全部通过 Node.js（端口 3001）统一对外出口，实现单端口交付 + 沙盒端口完全隔离。

ADR-007：SQLite WAL 模式
启用 PRAGMA journal_mode=WAL，允许读写并发，大幅提升多用户场景下的数据库性能。

ADR-008：waitress 生产级 WSGI
沙箱 Flask API 使用 waitress 作为生产服务器（8 线程），替代 Flask 开发服务器，提供稳定的多线程并发处理能力。
十二、运行指令
# 前端开发（端口 3000）
npm install
npm run dev
# 前端生产构建
npm run build
# 后端服务（端口 3001）
cd server && npm install && node server.js
# Python 沙箱（端口 5000）
cd sandbox && python api_endpoint.py
# PM2 生产部署（推荐）
npx pm2 start ecosystem.config.cjs
npx pm2 save
npx pm2 startup
