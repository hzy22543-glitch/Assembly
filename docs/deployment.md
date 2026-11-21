# 部署指南

## Docker Compose

安装 Docker 和 Docker Compose v2，在仓库根目录执行以下命令。首次构建会下载基础镜像和依赖，并从前端源码生成静态文件。

```bash
docker compose up -d --build
```

打开 `http://localhost:8080`。Nginx 将 `/api/` 转发给后端，后端使用宿主机 `server/data/` 保存 SQLite 数据。

### 启用实机编译

```bash
docker compose --profile sandbox up -d --build
```

后端通过 Compose 网络访问沙箱。镜像内带 NASM、GCC、GDB 和 DOSBox。使用 JWasm 和 WLink 的编译模式时，先按 [Linux 工具安装说明](../sandbox/tools/README_LINUX.md) 将工具放入 `sandbox/tools/`。Compose 会以只读方式挂载该目录。

查看状态和日志，或停止服务。

```bash
docker compose --profile sandbox ps
docker compose logs -f backend
docker compose --profile sandbox down
```

## Windows 启动

安装 Node.js 24 和 Python 3.12，运行 [`scripts/start-windows.bat`](../scripts/start-windows.bat)，然后打开 `http://localhost:3001`。脚本会安装依赖，按需生成 `dist/`，并启动 Express 和 Flask。实机模式需要的编译器可按 [Windows 工具安装说明](../sandbox/tools/HOW_TO_INSTALL.txt) 安装。

可通过 [`scripts/manage-pm2.bat`](../scripts/manage-pm2.bat) 管理服务，或在安装项目依赖和 PM2 后，从仓库根目录运行 `pm2 start ecosystem.config.cjs`。

## 单独启动 Python 沙箱

在 Python 虚拟环境中，从仓库根目录执行以下命令。

```bash
python -m pip install -r sandbox/requirements.txt
python sandbox/api_endpoint.py
```

沙箱默认监听 `5000`，健康检查地址为 `http://localhost:5000/health`。本机 Express 默认连接该端口。可以在启动 Express 前设置 `SANDBOX_URL`，指定其他沙箱地址。

## 打包源码

运行 `pwsh -File scripts/package.ps1`，从当前 Git 提交生成 `CodeBuddy-Release.zip`。使用 ZIP 的接收方可以按本指南安装依赖并构建。
