// File Service - 管理文件（代码 + AI分析 + 对话记录）
// 使用 localStorage 本地存储 + 云端同步

const API_BASE_URL = '';
const FILES_STORAGE_KEY = 'codebuddy_files';

const DEFAULT_ASM_CODE = `; 示例程序：计算 1 到 10 的和并打印结果
; 供评委测试 AI 智能分析、流程图生成等功能

DATA SEGMENT
    MSG DB "Sum of 1 to 10 is: $"
DATA ENDS

CODE SEGMENT
    ASSUME CS:CODE, DS:DATA
START:
    ; 1. 初始化数据段
    MOV AX, DATA
    MOV DS, AX

    ; 2. 打印提示信息
    MOV DX, OFFSET MSG
    MOV AH, 09H
    INT 21H

    ; 3. 计算 1 到 10 的累加和
    MOV CX, 10
    MOV AL, 0
    MOV BL, 1
SUM_LOOP:
    ADD AL, BL
    INC BL
    LOOP SUM_LOOP

    ; 此时 AL = 55 (汇编十进制，37H)
    
    ; 4. 将结果(55)的十位和个位分离并输出
    MOV CL, 0       ; 十位计数器
GET_TENS:
    CMP AL, 10
    JL PRINT_RES
    SUB AL, 10
    INC CL
    JMP GET_TENS

PRINT_RES:
    MOV BH, AL      ; 暂存个位到 BH
    
    ; 打印十位
    MOV DL, CL
    ADD DL, 30H     ; 数字转 ASCII
    MOV AH, 02H
    INT 21H

    ; 打印个位
    MOV DL, BH
    ADD DL, 30H     ; 数字转 ASCII
    MOV AH, 02H
    INT 21H

    ; 5. 退出程序
    MOV AH, 4CH
    INT 21H
CODE ENDS
END START
`;

// 生成UUID
function generateId() {
  return 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 获取设备ID
function getDeviceId() {
  let deviceId = localStorage.getItem('asm_device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('asm_device_id', deviceId);
  }
  return deviceId;
}

// 获取所有文件（从localStorage）
function getLocalFiles() {
  try {
    const data = localStorage.getItem(FILES_STORAGE_KEY);
    if (!data) {
      return { files: [], activeFileId: null };
    }
    const parsed = JSON.parse(data);
    return Array.isArray(parsed?.files) ? parsed : { files: [], activeFileId: null };
  } catch (e) {
    console.error('Failed to parse local files:', e);
    return { files: [], activeFileId: null };
  }
}

// 保存所有文件到localStorage
function saveLocalFiles(data) {
  try {
    localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Failed to save local files:', e);
    return false;
  }
}

// 创建新文件（最新放在最后）
export function createFile(name = null, initialCode) {
  const id = generateId();
  const now = new Date().toISOString();
  const fileName = name || `未命名_${Date.now() % 100000}.asm`;

  // 自动添加 .asm 后缀
  const finalName = /\.asm$/i.test(fileName) ? fileName : `${fileName}.asm`;

  const newFile = {
    id,
    name: finalName,
    code: initialCode ?? (finalName === 'main.asm' ? DEFAULT_ASM_CODE : ''),
    createdAt: now,
    updatedAt: now,
    aiAnalysis: null,
    chatMessages: [
      {
        role: 'assistant',
        content: '你好！🤖 我是 CoreLogic AI 助手，你的汇编语言学习伙伴！\n\n我可以帮你：\n• 🔍 分析代码功能和逻辑\n• 📖 解释汇编指令\n• 💡 解答你的疑问\n• 🎓 提供学习建议\n\n有什么问题尽管问我吧！'
      }
    ]
  };

  const data = getLocalFiles();
  data.files.push(newFile);  // 最新放在最后
  data.activeFileId = id;
  saveLocalFiles(data);

  return newFile;
}

export function createFileCopy(name, code) {
  const stem = name.replace(/\.asm$/i, '');
  const existing = new Set(getAllFiles().map(file => file.name.toLowerCase()));
  let candidate = `${stem}.asm`;
  for (let number = 2; existing.has(candidate.toLowerCase()); number++) {
    candidate = `${stem}-${number}.asm`;
  }
  const file = createFile(candidate, code);
  if (getActiveFile()?.id !== file.id) {
    throw new Error('浏览器存储空间不足或不可用。');
  }
  return file;
}

// 获取当前活动文件
export function getActiveFile() {
  const data = getLocalFiles();
  if (!data.activeFileId) return null;
  return data.files.find(f => f.id === data.activeFileId) || null;
}

// 切换活动文件
export function setActiveFile(fileId) {
  const data = getLocalFiles();
  if (data.files.some(f => f.id === fileId)) {
    data.activeFileId = fileId;
    return saveLocalFiles(data);
  }
  return false;
}

// 更新文件代码
export function updateFileCode(fileId, code) {
  const data = getLocalFiles();
  const file = data.files.find(f => f.id === fileId);
  if (file) {
    if (file.code === code) return true;
    file.code = code;
    file.updatedAt = new Date().toISOString();
    return saveLocalFiles(data);
  }
  return false;
}

// 更新文件名
export function renameFile(fileId, newName) {
  const data = getLocalFiles();
  const file = data.files.find(f => f.id === fileId);
  if (file) {
    // 自动添加 .asm 后缀
    const finalName = newName.endsWith('.asm') ? newName : `${newName}.asm`;
    file.name = finalName;
    file.updatedAt = new Date().toISOString();
    saveLocalFiles(data);
    return true;
  }
  return false;
}

// 删除文件
export function deleteFile(fileId) {
  const data = getLocalFiles();
  const index = data.files.findIndex(f => f.id === fileId);
  if (index !== -1) {
    data.files.splice(index, 1);
    // 如果删除的是当前活动文件，切换到第一个
    if (data.activeFileId === fileId) {
      data.activeFileId = data.files.length > 0 ? data.files[0].id : null;
    }
    saveLocalFiles(data);
    return true;
  }
  return false;
}

// 重新排序文件
export function reorderFiles(orderedIds) {
  const data = getLocalFiles();
  const fileMap = {};
  data.files.forEach(f => { fileMap[f.id] = f; });
  data.files = orderedIds.map(id => fileMap[id]).filter(Boolean);
  saveLocalFiles(data);
  return true;
}

// 获取所有文件列表
export function getAllFiles() {
  const data = getLocalFiles();
  return data.files;
}

/**
 * 整份保存当前文件的 AI 分析快照（与界面 state 结构一致：扁平对象）
 * 避免误用 updateFileAIAnalysis(..., 'basic', wholeState) 导致嵌套在 basic 下、加载后结构错乱
 */
export function setFileAIAnalysisSnapshot(fileId, snapshot) {
  const data = getLocalFiles();
  const file = data.files.find(f => f.id === fileId);
  if (file) {
    // 写入时去除 _isMockData，避免污染本地存储
    const toSave = JSON.parse(JSON.stringify(snapshot));
    delete toSave._isMockData;
    file.aiAnalysis = toSave;
    file.updatedAt = new Date().toISOString();
    saveLocalFiles(data);
    return true;
  }
  return false;
}

/** 从 localStorage 读出的对象兼容旧版 { basic: {...} } 嵌套 */
export function normalizeAiAnalysisFromFile(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const result = raw.summary != null || raw.lineAnalysis != null || raw.rawContent != null
    ? raw
    : raw.basic && typeof raw.basic === 'object'
      ? { ...raw.basic, flowchart: raw.basic.flowchart ?? raw.flowchart, fullAnalysis: raw.basic.fullAnalysis ?? raw.fullAnalysis }
      : raw;
  // 过滤掉旧的 mock 标记，避免误导用户
  if (result && result._isMockData === true) {
    const { _isMockData, ...clean } = result;
    return Object.keys(clean).length > 0 ? clean : null;
  }
  return result;
}

// 兼容旧代码：按类型合并（不推荐，请优先用 setFileAIAnalysisSnapshot）
export function updateFileAIAnalysis(fileId, analysisType, analysisData) {
  const data = getLocalFiles();
  const file = data.files.find(f => f.id === fileId);
  if (file) {
    if (!file.aiAnalysis) {
      file.aiAnalysis = {};
    }
    file.aiAnalysis[analysisType] = analysisData;
    file.updatedAt = new Date().toISOString();
    saveLocalFiles(data);
    return true;
  }
  return false;
}

// 更新文件AI对话记录
export function updateFileChatMessages(fileId, messages) {
  const data = getLocalFiles();
  const file = data.files.find(f => f.id === fileId);
  if (file) {
    file.chatMessages = messages;
    file.updatedAt = new Date().toISOString();
    saveLocalFiles(data);
    return true;
  }
  return false;
}

// 保存文件当前视图
export function setFileAIView(fileId, view) {
  const data = getLocalFiles();
  const file = data.files.find(f => f.id === fileId);
  if (file) {
    file.aiView = view;
    saveLocalFiles(data);
    return true;
  }
  return false;
}

// 保存文件 AI 错误信息
export function setFileAIError(fileId, error) {
  const data = getLocalFiles();
  const file = data.files.find(f => f.id === fileId);
  if (file) {
    file.aiError = error || null;
    saveLocalFiles(data);
    return true;
  }
  return false;
}

// 批量同步所有文件的 AI 分析元数据（视图/错误，不含完整分析数据）
export function syncAllFileAIMeta(aiViewMap, aiErrorMap) {
  const data = getLocalFiles();
  data.files.forEach(file => {
    if (aiViewMap[file.id] !== undefined) file.aiView = aiViewMap[file.id]
    if (aiErrorMap[file.id] !== undefined) file.aiError = aiErrorMap[file.id] || null
  })
  saveLocalFiles(data)
}

// 同步文件到云端
export async function syncFilesToCloud() {
  const deviceId = getDeviceId();
  const localData = getLocalFiles();

  try {
    const response = await fetch(`${API_BASE_URL}/api/files/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': deviceId
      },
      body: JSON.stringify({
        files: localData.files,
        activeFileId: localData.activeFileId
      })
    });

    if (response.ok) {
      return { success: true };
    }
    return { success: false, error: 'Sync failed' };
  } catch (error) {
    console.error('Sync to cloud failed:', error);
    return { success: false, error: error.message };
  }
}

// 从云端拉取文件
export async function fetchFilesFromCloud() {
  const deviceId = getDeviceId();

  try {
    const response = await fetch(`${API_BASE_URL}/api/files`, {
      method: 'GET',
      headers: {
        'X-Device-ID': deviceId
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.files && data.files.length > 0) {
        const localData = getLocalFiles();
        // 合并：云端文件优先，保留本地独有的文件
        const localIds = new Set(localData.files.map(f => f.id));
        data.files.forEach(cloudFile => {
          if (!localIds.has(cloudFile.id)) {
            localData.files.push(cloudFile);
          }
        });
        localData.activeFileId = data.activeFileId || localData.activeFileId;
        saveLocalFiles(localData);
      }
      return { success: true };
    }
    return { success: false, error: 'Fetch failed' };
  } catch (error) {
    console.error('Fetch from cloud failed:', error);
    return { success: false, error: error.message };
  }
}

export default {
  createFile,
  getActiveFile,
  setActiveFile,
  updateFileCode,
  renameFile,
  deleteFile,
  reorderFiles,
  getAllFiles,
  setFileAIAnalysisSnapshot,
  normalizeAiAnalysisFromFile,
  updateFileAIAnalysis,
  updateFileChatMessages,
  setFileAIView,
  setFileAIError,
  syncAllFileAIMeta,
  syncFilesToCloud,
  fetchFilesFromCloud
};
