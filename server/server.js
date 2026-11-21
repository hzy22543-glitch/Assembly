const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { mkdirSync } = require('node:fs');
const fetch = require('node-fetch');

function createAbortTimeout(ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  timer.unref();
  return ac.signal;
}

const app = express();
const PORT = process.env.PORT || 3001;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID']
}));
app.use(express.json());

// ==================== DashScope AI Proxy ====================
// Forward /dashscope/* to 阿里云 DashScope
app.all('/dashscope/:path(*)', async (req, res) => {
  try {
    const targetUrl = `https://dashscope.aliyuncs.com/${req.params.path}`;
    let bodyData = null;
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && Object.keys(req.body || {}).length > 0) {
      bodyData = JSON.stringify(req.body);
    }
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers['authorization'] || ''
      },
      signal: createAbortTimeout(180000)
    };
    if (bodyData) fetchOptions.body = bodyData;
    const response = await fetch(targetUrl, fetchOptions);
    const responseText = await response.text();
    res.status(response.status);
    res.set('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(responseText);
  } catch (err) {
    console.error('[DashScope Proxy] Error:', err.message);
    res.status(502).json({ error: { message: `代理请求失败: ${err.message}` } });
  }
});

// ==================== Database Setup ====================
// 使用单个数据库文件，同时存放 files 表（旧版 analysis_history 表自动保留但不再写入）
const dataDir = path.join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'history.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    // 启用 WAL 模式：允许读写并发，大幅提升多用户并发性能
    db.run('PRAGMA journal_mode=WAL', (err) => {
      if (err) {
        console.error('Error setting WAL mode:', err);
      } else {
        console.log('SQLite WAL mode enabled');
      }
    });
    initDatabase();
  }
});

function initDatabase() {
  // 只初始化 files 表（analysis_history 表已废弃，不再创建或写入）
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ai_analysis TEXT,
      chat_messages TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating files table:', err);
    } else {
      console.log('Files table initialized');
    }
  });
}

// Generate or validate device ID
function getDeviceId(req) {
  let deviceId = req.headers['x-device-id'] || req.body && req.body.deviceId;
  if (!deviceId) {
    deviceId = uuidv4();
  }
  return deviceId;
}

// ==================== Sandbox Proxy ====================
// Forward /api/sandbox/* to Python sandbox (port 5000)
const SANDBOX_URL = process.env.SANDBOX_URL || 'http://127.0.0.1:5000';

app.post('/api/sandbox/run', async (req, res) => {
  try {
    const response = await fetch(`${SANDBOX_URL}/api/sandbox/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: createAbortTimeout(15000)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Sandbox proxy error:', err.message);
    res.status(502).json({
      stdout: '',
      stderr: `沙盒服务不可用: ${err.message}`,
      exit_code: -1,
      elapsed_ms: 0,
      stage: 'error'
    });
  }
});

app.post('/api/sandbox/compile', async (req, res) => {
  try {
    const response = await fetch(`${SANDBOX_URL}/api/sandbox/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: createAbortTimeout(10000)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Sandbox compile proxy error:', err.message);
    res.status(502).json({
      stdout: '',
      stderr: `沙盒服务不可用: ${err.message}`,
      exit_code: -1,
      elapsed_ms: 0,
      stage: 'error'
    });
  }
});

app.post('/api/sandbox/executable', async (req, res) => {
  try {
    const response = await fetch(`${SANDBOX_URL}/api/sandbox/executable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: createAbortTimeout(15000)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Sandbox executable proxy error:', err.message);
    res.status(502).json({
      success: false,
      stderr: `编译服务不可用: ${err.message}`
    });
  }
});

// ==================== Health ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'asm-visual-tutor-api' });
});

// ==================== Files API (文件管理) ====================
// 每个文件存储：代码 + AI分析快照 + AI对话历史
// 取代了旧版独立的 analysis_history 全局时间线

// 同步文件到云端（批量 upsert）
app.post('/api/files/sync', (req, res) => {
  const { files } = req.body;
  const deviceId = getDeviceId(req);

  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'Invalid files data' });
  }

  const sql = `
    INSERT OR REPLACE INTO files
      (id, device_id, name, code, created_at, updated_at, ai_analysis, chat_messages)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.serialize(() => {
    const stmt = db.prepare(sql);
    let completed = 0;

    files.forEach(file => {
      stmt.run(
        file.id,
        deviceId,
        file.name,
        file.code || '',
        file.createdAt,
        file.updatedAt,
        file.aiAnalysis ? JSON.stringify(file.aiAnalysis) : null,
        file.chatMessages ? JSON.stringify(file.chatMessages) : null,
        (err) => {
          if (err) console.error('Error saving file:', err);
          completed++;
          if (completed === files.length) {
            stmt.finalize();
            res.json({ success: true, count: files.length });
          }
        }
      );
    });
  });
});

// 获取文件列表
app.get('/api/files', (req, res) => {
  const deviceId = req.headers['x-device-id'];
  if (!deviceId) return res.status(400).json({ error: 'Device ID is required' });

  const sql = `SELECT * FROM files WHERE device_id = ? ORDER BY updated_at DESC`;
  db.all(sql, [deviceId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch files' });

    const files = rows.map(row => ({
      id: row.id,
      name: row.name,
      code: row.code,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      aiAnalysis: row.ai_analysis ? JSON.parse(row.ai_analysis) : null,
      chatMessages: row.chat_messages ? JSON.parse(row.chat_messages) : null
    }));

    res.json({ success: true, files });
  });
});

// 获取单个文件
app.get('/api/files/:id', (req, res) => {
  const { id } = req.params;
  const deviceId = req.headers['x-device-id'];
  if (!deviceId) return res.status(400).json({ error: 'Device ID is required' });

  const sql = `SELECT * FROM files WHERE id = ? AND device_id = ?`;
  db.get(sql, [id, deviceId], (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch file' });
    if (!row) return res.status(404).json({ error: 'File not found' });

    res.json({
      success: true,
      file: {
        id: row.id,
        name: row.name,
        code: row.code,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        aiAnalysis: row.ai_analysis ? JSON.parse(row.ai_analysis) : null,
        chatMessages: row.chat_messages ? JSON.parse(row.chat_messages) : null
      }
    });
  });
});

// 删除文件
app.delete('/api/files/:id', (req, res) => {
  const { id } = req.params;
  const deviceId = req.headers['x-device-id'];
  if (!deviceId) return res.status(400).json({ error: 'Device ID is required' });

  const sql = `DELETE FROM files WHERE id = ? AND device_id = ?`;
  db.run(sql, [id, deviceId], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete file' });
    if (this.changes === 0) return res.status(404).json({ error: 'File not found' });
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

// ==================== Debug Proxy ====================
// Forward /api/debug/* to Python sandbox GDB debug endpoints
const DEBUG_ROUTES = [
  'start', 'step', 'next', 'continue',
  'registers', 'memory', 'stack', 'disasm',
  'breakpoint', 'stop', 'sessions'
];

for (const route of DEBUG_ROUTES) {
  const methods = route === 'sessions' ? ['get'] : ['post'];
  for (const method of methods) {
    app[method](`/api/debug/${route}`, async (req, res) => {
      try {
        const fetchOpts = {
          method: method.toUpperCase(),
          headers: { 'Content-Type': 'application/json' },
          signal: createAbortTimeout(20000)
        };
        if (method === 'post') {
          fetchOpts.body = JSON.stringify(req.body);
        }
        const response = await fetch(
          `${SANDBOX_URL}/api/debug/${route}`, fetchOpts
        );
        const data = await response.json();
        res.json(data);
      } catch (err) {
        console.error(`Debug proxy error (${route}):`, err.message);
        res.status(502).json({
          status: 'error',
          message: `调试服务不可用: ${err.message}`
        });
      }
    });
  }
}

// ==================== Static Files (Frontend SPA) ====================
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/dashscope')) {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ==================== Start ====================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend: http://localhost:${PORT}/`);
  console.log(`API:      http://localhost:${PORT}/api/`);
  console.log(`AI:       http://localhost:${PORT}/dashscope/`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nClosing database connection...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});
