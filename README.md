# 汇编程 · Assembly

面向 8086 汇编语言学习的可视化教学工具。浏览器内置模拟器支持单步执行、查看寄存器和内存，以及回看执行状态。可选的 Python 沙箱提供实机编译和运行功能。

## 在线体验

打开 [GitHub Pages 演示](https://hzy22543-glitch.github.io/Assembly/) 即可使用浏览器模拟器。云端文件同步、AI 分析和实机编译需要另行启动对应服务。[部署指南](docs/deployment.md)提供完整启动步骤。

## 快速开始

使用 Node.js 24 和 npm。在仓库根目录运行以下命令，然后访问 `http://localhost:3000`。

```bash
npm ci
npm run dev
```

浏览器模拟器可以独立运行。如需服务端文件同步，在另一个终端运行以下命令。Express 默认监听 `3001`，并在 `server/data/` 中初始化 SQLite 数据库。

```bash
npm ci --prefix server
npm start --prefix server
```

执行 `npm run build` 生成 `dist/`，或按 [部署指南](docs/deployment.md) 启动 Docker、Windows 或 Python 沙箱。

## AI 配置

本地调试 AI 功能时，可将 [`.env.example`](.env.example) 复制为 `.env`，再按需配置模型和 API。`VITE_*` 会对浏览器可见，应在公开部署时保持 `VITE_AI_API_KEY` 为空。Docker 前端从源码构建，构建上下文会排除本地 `.env`。

## 项目目录

| 路径 | 用途 |
| --- | --- |
| [`src/`](src/) | React 界面、8086 模拟器和前端服务 |
| [`server/`](server/) | Express API 和 SQLite 文件存储 |
| [`sandbox/`](sandbox/) | Python 编译和调试服务 |
| [`docs/`](docs/) | [部署指南](docs/deployment.md)、[架构档案](docs/architecture.md)和 [AI 协同记录](docs/ai-collaboration.md) |
| [`scripts/`](scripts/) | Windows 启动、PM2 管理和源码打包脚本 |
