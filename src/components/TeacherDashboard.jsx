import React, { useMemo, useState } from 'react'
import './TeacherDashboard.css'

const initialClasses = [
  {
    id: 'asm-1',
    name: '《汇编语言程序设计》实验班 1 班',
    inviteCode: 'ASM1-7KQ2',
    inviteLink: 'https://codebuddy.local/join/ASM1-7KQ2',
    members: [
      { id: 'stu-1', name: '林一鸣', studentNo: '20240101', completed: 2, total: 3, lastActive: '10 分钟前' },
      { id: 'stu-2', name: '陈若曦', studentNo: '20240108', completed: 1, total: 3, lastActive: '32 分钟前' },
      { id: 'stu-3', name: '周子涵', studentNo: '20240115', completed: 3, total: 3, lastActive: '今天 09:42' },
      { id: 'stu-4', name: '王启航', studentNo: '20240122', completed: 0, total: 3, lastActive: '昨天 21:16' }
    ]
  },
  {
    id: 'asm-2',
    name: '《汇编语言程序设计》实验班 2 班',
    inviteCode: 'ASM2-P9L4',
    inviteLink: 'https://codebuddy.local/join/ASM2-P9L4',
    members: [
      { id: 'stu-5', name: '赵嘉宁', studentNo: '20240203', completed: 1, total: 2, lastActive: '今天 11:05' },
      { id: 'stu-6', name: '孙明哲', studentNo: '20240209', completed: 2, total: 2, lastActive: '昨天 19:30' }
    ]
  }
]

const initialTasks = [
  {
    id: 'task-1',
    classId: 'asm-1',
    title: '实验 1：数据传送与寄存器操作',
    description: '完成 MOV、ADD、XCHG 等基础指令练习，观察 AX、BX、CX 的变化。',
    sampleCode: `CODE SEGMENT
START:
    MOV AX, 1234H
    MOV BX, 5678H
    XCHG AX, BX
    MOV AH, 4CH
    INT 21H
CODE ENDS
END START`,
    requirements: '提交可运行代码，并说明每一步寄存器变化。',
    deadline: '2026-06-20 23:59',
    testCases: 'AX=1234H, BX=5678H；交换后 AX=5678H, BX=1234H。',
    knowledge: '数据传送、通用寄存器、十六进制表示'
  },
  {
    id: 'task-2',
    classId: 'asm-1',
    title: '实验 2：条件跳转与循环结构',
    description: '使用 CMP/Jcc 与 LOOP 完成 1 到 10 累加。',
    sampleCode: `CODE SEGMENT
START:
    MOV AX, 0
    MOV BX, 1
    MOV CX, 10
SUM_LOOP:
    ADD AX, BX
    INC BX
    LOOP SUM_LOOP
    MOV AH, 4CH
    INT 21H
CODE ENDS
END START`,
    requirements: '必须展示一次单步调试过程，并提交 AI 分析结果。',
    deadline: '2026-06-24 23:59',
    testCases: '循环结束后 AX 应为 55，CX 应为 0。',
    knowledge: 'CMP、Jcc、LOOP、ZF 标志位'
  },
  {
    id: 'task-3',
    classId: 'asm-1',
    title: '实验 3：栈操作与子程序调用',
    description: '使用 PUSH/POP/CALL/RET 完成两个数求和。',
    sampleCode: `CODE SEGMENT
START:
    MOV AX, 2
    MOV BX, 3
    CALL ADD_NUM
    MOV AH, 4CH
    INT 21H
ADD_NUM:
    ADD AX, BX
    RET
CODE ENDS
END START`,
    requirements: '说明 CALL/RET 对栈的影响，检查是否存在栈不平衡。',
    deadline: '2026-06-28 23:59',
    testCases: '返回后 AX=5；SP 应恢复到调用前状态。',
    knowledge: '栈、子程序、返回地址、SP 寄存器'
  }
]

const submissions = [
  {
    id: 'sub-1',
    taskId: 'task-2',
    studentName: '林一鸣',
    submittedAt: '2026-06-16 09:18',
    runStatus: '运行通过',
    completed: true,
    errors: [],
    aiSummary: 'AI 判断循环边界正确，AX 最终值为 55，建议补充对 LOOP 指令的文字解释。',
    code: `MOV AX, 0
MOV BX, 1
MOV CX, 10
SUM_LOOP:
    ADD AX, BX
    INC BX
    LOOP SUM_LOOP`,
    trace: {
      runs: 5,
      steps: 48,
      usedAI: true,
      viewedFlowchart: true,
      repeatedLine: 'LOOP SUM_LOOP',
      hotRegister: 'CX / ZF',
      copyRisk: '低'
    }
  },
  {
    id: 'sub-2',
    taskId: 'task-2',
    studentName: '陈若曦',
    submittedAt: '2026-06-16 10:02',
    runStatus: '运行错误',
    completed: false,
    errors: ['LOOP 循环次数错误', 'CMP / Jcc 条件判断错误'],
    aiSummary: 'AI 发现 CX 初值与循环出口不一致，建议先用时间轴回看第 7 步寄存器变化。',
    code: `MOV AX, 0
MOV BX, 1
MOV CX, 9
SUM_LOOP:
    ADD AX, BX
    CMP BX, 10
    JE DONE
    LOOP SUM_LOOP
DONE:`,
    trace: {
      runs: 12,
      steps: 136,
      usedAI: true,
      viewedFlowchart: false,
      repeatedLine: 'CMP BX, 10',
      hotRegister: 'CX / ZF',
      copyRisk: '中'
    }
  },
  {
    id: 'sub-3',
    taskId: 'task-3',
    studentName: '王启航',
    submittedAt: '暂未提交',
    runStatus: '未提交',
    completed: false,
    errors: ['栈不平衡', '标签未定义'],
    aiSummary: '暂无有效提交，系统记录到多次 RET 返回异常和未定义标签。',
    code: `CALL ADD_NUM
PUSH AX
RET`,
    trace: {
      runs: 3,
      steps: 19,
      usedAI: false,
      viewedFlowchart: false,
      repeatedLine: 'RET',
      hotRegister: 'SP',
      copyRisk: '高'
    }
  }
]

const commonErrors = [
  { name: 'LOOP 循环次数错误', count: 18 },
  { name: 'CMP / Jcc 条件判断错误', count: 15 },
  { name: '标签未定义', count: 11 },
  { name: 'INT 21h 参数错误', count: 9 },
  { name: 'MASM 语法错误', count: 8 },
  { name: '栈不平衡', count: 7 },
  { name: '寄存器值溢出', count: 5 },
  { name: '死循环风险', count: 4 }
]

function buildInviteCode(index) {
  return `ASM${index + 1}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function TeacherDashboard() {
  const [classes, setClasses] = useState(initialClasses)
  const [tasks, setTasks] = useState(initialTasks)
  const [selectedClassId, setSelectedClassId] = useState(initialClasses[0].id)
  const [selectedTaskId, setSelectedTaskId] = useState(initialTasks[1].id)
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(submissions[1].id)
  const [newClassName, setNewClassName] = useState('《汇编语言程序设计》实验班 3 班')
  const [newStudentName, setNewStudentName] = useState('')
  const [newTask, setNewTask] = useState({
    title: '实验 4：综合调试与流程图分析',
    description: '综合使用寄存器、循环、分支与 AI 分析，完成一段可解释的汇编程序。',
    sampleCode: 'CODE SEGMENT\nSTART:\n    MOV AX, 0\n    MOV AH, 4CH\n    INT 21H\nCODE ENDS\nEND START',
    requirements: '提交代码、运行结果、AI 逐行注释和 Mermaid 流程图截图。',
    deadline: '2026-07-02 23:59',
    testCases: '至少包含 1 个正常用例和 1 个边界用例。',
    knowledge: '寄存器、分支、循环、AI 辅助调试'
  })

  const selectedClass = classes.find(item => item.id === selectedClassId) || classes[0]
  const classTasks = tasks.filter(task => task.classId === selectedClass?.id)
  const selectedTask = tasks.find(task => task.id === selectedTaskId && task.classId === selectedClass?.id) || classTasks[0] || null
  const taskSubmissions = selectedTask ? submissions.filter(item => item.taskId === selectedTask.id) : []
  const selectedSubmission = taskSubmissions.find(item => item.id === selectedSubmissionId) || taskSubmissions[0] || null
  const maxErrorCount = Math.max(...commonErrors.map(item => item.count))

  const classStats = useMemo(() => {
    const members = selectedClass?.members || []
    const totalMembers = members.length
    const completionRate = totalMembers
      ? Math.round((members.reduce((sum, item) => sum + item.completed / item.total, 0) / totalMembers) * 100)
      : 0
    return {
      totalMembers,
      taskCount: classTasks.length,
      completionRate,
      activeCount: members.filter(item => item.lastActive.includes('分钟') || item.lastActive.includes('今天')).length
    }
  }, [selectedClass, classTasks.length])

  const createClass = () => {
    const trimmedName = newClassName.trim()
    if (!trimmedName) return
    const inviteCode = buildInviteCode(classes.length)
    const nextClass = {
      id: `class-${Date.now()}`,
      name: trimmedName,
      inviteCode,
      inviteLink: `https://codebuddy.local/join/${inviteCode}`,
      members: []
    }
    setClasses(prev => [...prev, nextClass])
    setSelectedClassId(nextClass.id)
    setNewClassName('')
  }

  const regenerateInvite = () => {
    const inviteCode = buildInviteCode(classes.length)
    setClasses(prev => prev.map(item => item.id === selectedClass.id
      ? { ...item, inviteCode, inviteLink: `https://codebuddy.local/join/${inviteCode}` }
      : item
    ))
  }

  const addStudent = () => {
    const trimmedName = newStudentName.trim()
    if (!trimmedName) return
    setClasses(prev => prev.map(item => item.id === selectedClass.id
      ? {
          ...item,
          members: [
            ...item.members,
            {
              id: `stu-${Date.now()}`,
              name: trimmedName,
              studentNo: `2024${String(item.members.length + 1).padStart(4, '0')}`,
              completed: 0,
              total: Math.max(classTasks.length, 1),
              lastActive: '刚刚加入'
            }
          ]
        }
      : item
    ))
    setNewStudentName('')
  }

  const publishTask = () => {
    const title = newTask.title.trim()
    if (!title) return
    const nextTask = {
      id: `task-${Date.now()}`,
      classId: selectedClass.id,
      ...newTask,
      title
    }
    setTasks(prev => [nextTask, ...prev])
    setSelectedTaskId(nextTask.id)
  }

  return (
    <main className="teacher-dashboard">
      <section className="teacher-hero">
        <div>
          <span className="teacher-kicker">教师端 MVP</span>
          <h2>高校汇编实验课管理台</h2>
          <p>围绕班级、实验、提交、调试过程和共性错误，帮助教师从“收作业”升级到“看见学习过程”。</p>
        </div>
        <div className="teacher-hero-actions">
          <button type="button" className="teacher-primary-btn" onClick={publishTask}>发布当前实验</button>
          <button type="button" className="teacher-secondary-btn" onClick={regenerateInvite}>刷新邀请码</button>
        </div>
      </section>

      <section className="teacher-stat-grid">
        <div className="teacher-stat">
          <span>班级成员</span>
          <strong>{classStats.totalMembers}</strong>
          <small>{classStats.activeCount} 人今天活跃</small>
        </div>
        <div className="teacher-stat">
          <span>实验任务</span>
          <strong>{classStats.taskCount}</strong>
          <small>当前班级已发布</small>
        </div>
        <div className="teacher-stat">
          <span>完成率</span>
          <strong>{classStats.completionRate}%</strong>
          <small>按班级实验进度统计</small>
        </div>
        <div className="teacher-stat">
          <span>高频错误</span>
          <strong>{commonErrors[0].count}</strong>
          <small>{commonErrors[0].name}</small>
        </div>
      </section>

      <section className="teacher-grid teacher-grid-main">
        <div className="teacher-panel">
          <div className="teacher-panel-header">
            <h3>班级 / 课程管理</h3>
            <span>邀请码：{selectedClass?.inviteCode}</span>
          </div>

          <div className="teacher-field-row">
            <input
              value={newClassName}
              onChange={event => setNewClassName(event.target.value)}
              placeholder="输入班级名称"
            />
            <button type="button" onClick={createClass}>创建班级</button>
          </div>

          <div className="teacher-class-list">
            {classes.map(item => (
              <button
                key={item.id}
                type="button"
                className={item.id === selectedClassId ? 'active' : ''}
                onClick={() => setSelectedClassId(item.id)}
              >
                <strong>{item.name}</strong>
                <span>{item.members.length} 名学生</span>
              </button>
            ))}
          </div>

          <div className="teacher-invite-box">
            <span>学生加入链接</span>
            <code>{selectedClass?.inviteLink}</code>
          </div>

          <div className="teacher-field-row">
            <input
              value={newStudentName}
              onChange={event => setNewStudentName(event.target.value)}
              placeholder="模拟学生输入邀请码后加入"
            />
            <button type="button" onClick={addStudent}>加入班级</button>
          </div>

          <div className="teacher-member-list">
            {selectedClass?.members.map(member => (
              <div key={member.id} className="teacher-member-row">
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.studentNo}</span>
                </div>
                <div className="teacher-progress">
                  <span style={{ width: `${Math.round((member.completed / member.total) * 100)}%` }} />
                </div>
                <small>{member.completed}/{member.total}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="teacher-panel">
          <div className="teacher-panel-header">
            <h3>实验任务发布</h3>
            <span>模板可复用</span>
          </div>

          <div className="teacher-task-form">
            <input value={newTask.title} onChange={event => setNewTask(prev => ({ ...prev, title: event.target.value }))} />
            <textarea value={newTask.description} onChange={event => setNewTask(prev => ({ ...prev, description: event.target.value }))} />
            <textarea className="teacher-code-input" value={newTask.sampleCode} onChange={event => setNewTask(prev => ({ ...prev, sampleCode: event.target.value }))} />
            <input value={newTask.requirements} onChange={event => setNewTask(prev => ({ ...prev, requirements: event.target.value }))} />
            <div className="teacher-form-split">
              <input value={newTask.deadline} onChange={event => setNewTask(prev => ({ ...prev, deadline: event.target.value }))} />
              <input value={newTask.knowledge} onChange={event => setNewTask(prev => ({ ...prev, knowledge: event.target.value }))} />
            </div>
            <input value={newTask.testCases} onChange={event => setNewTask(prev => ({ ...prev, testCases: event.target.value }))} />
          </div>

          <div className="teacher-task-list">
            {classTasks.map(task => (
              <button
                key={task.id}
                type="button"
                className={task.id === selectedTask?.id ? 'active' : ''}
                onClick={() => setSelectedTaskId(task.id)}
              >
                <strong>{task.title}</strong>
                <span>{task.deadline}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="teacher-grid teacher-grid-review">
        <div className="teacher-panel">
          <div className="teacher-panel-header">
            <h3>学生代码提交与查看</h3>
            <span>{selectedTask?.title}</span>
          </div>

          <div className="teacher-submission-table">
            <div className="teacher-table-head">
              <span>学生</span>
              <span>提交时间</span>
              <span>运行状态</span>
              <span>完成</span>
            </div>
            {taskSubmissions.map(item => (
              <button
                key={item.id}
                type="button"
                className={item.id === selectedSubmission?.id ? 'active' : ''}
                onClick={() => setSelectedSubmissionId(item.id)}
              >
                <span>{item.studentName}</span>
                <span>{item.submittedAt}</span>
                <span className={item.completed ? 'ok' : 'bad'}>{item.runStatus}</span>
                <span>{item.completed ? '已完成' : '需跟进'}</span>
              </button>
            ))}
          </div>

          <div className="teacher-code-review">
            <pre>{selectedSubmission?.code}</pre>
            <div>
              <h4>AI 分析结果</h4>
              <p>{selectedSubmission?.aiSummary}</p>
              <h4>错误标记</h4>
              <div className="teacher-tags">
                {(selectedSubmission?.errors.length ? selectedSubmission.errors : ['暂无错误']).map(error => (
                  <span key={error}>{error}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="teacher-panel">
          <div className="teacher-panel-header">
            <h3>学生调试轨迹查看</h3>
            <span>{selectedSubmission?.studentName}</span>
          </div>

          <div className="teacher-trace-grid">
            <div><span>运行次数</span><strong>{selectedSubmission?.trace.runs}</strong></div>
            <div><span>单步调试</span><strong>{selectedSubmission?.trace.steps}</strong></div>
            <div><span>AI 分析</span><strong>{selectedSubmission?.trace.usedAI ? '已使用' : '未使用'}</strong></div>
            <div><span>流程图</span><strong>{selectedSubmission?.trace.viewedFlowchart ? '已查看' : '未查看'}</strong></div>
            <div><span>反复出错行</span><strong>{selectedSubmission?.trace.repeatedLine}</strong></div>
            <div><span>相关寄存器</span><strong>{selectedSubmission?.trace.hotRegister}</strong></div>
          </div>

          <div className={`teacher-risk-card risk-${selectedSubmission?.trace.copyRisk}`}>
            <span>复制提交风险</span>
            <strong>{selectedSubmission?.trace.copyRisk}</strong>
            <p>结合运行次数、调试步数、AI 使用情况和时间轴回看行为综合判断。</p>
          </div>
        </div>
      </section>

      <section className="teacher-panel teacher-error-panel">
        <div className="teacher-panel-header">
          <h3>本次实验常见错误统计</h3>
          <span>用于下节课集中讲解</span>
        </div>
        <div className="teacher-error-chart">
          {commonErrors.map(error => (
            <div key={error.name} className="teacher-error-row">
              <span>{error.name}</span>
              <div>
                <i style={{ width: `${(error.count / maxErrorCount) * 100}%` }} />
              </div>
              <strong>{error.count}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default TeacherDashboard
