import React, { useEffect, useRef, useState } from 'react';

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <script src="https://js-dos.com/6.22/current/js-dos.js"></script>
    <style>
        body { margin: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; color: white; overflow: hidden; }
        canvas { 
            display: block; 
            outline: none; 
            cursor: pointer;
        }
        canvas:focus {
            outline: none;
            box-shadow: 0 0 1px #0f0;
        }
        #loading { position: absolute; font-family: monospace; color: #0f0; pointer-events: none; }
    </style>
</head>
<body>
    <canvas id="dos-canvas" width="640" height="400" tabindex="0"></canvas>
    <div id="loading">⏳ 加载 DOSBox 环境中...</div>
    <script>
        const canvas = document.getElementById("dos-canvas");
        
        // 强制确保点击时获得焦点
        canvas.addEventListener('mousedown', () => {
            canvas.focus();
        });

        // 窗口获得焦点时自动重定向到 canvas
        window.addEventListener('focus', () => {
            canvas.focus();
        });

        window.addEventListener('message', async (event) => {
            if (event.data.type === 'START_DOS') {
                const exeData = event.data.exeData;
                const binaryString = window.atob(exeData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                try {
                    window.Dos(canvas, {
                        style: "none",
                        wdosboxUrl: "https://js-dos.com/6.22/current/wdosbox.js"
                    }).ready((fs, main) => {
                        document.getElementById("loading").style.display = "none";
                        fs.createFile("main.exe", bytes);
                        main(["main.exe"]);
                        
                        // 启动后立即尝试聚焦
                        setTimeout(() => canvas.focus(), 500);
                    });
                } catch(e) {
                    document.getElementById("loading").innerText = "DOSBox 加载失败: " + e.message;
                }
            }
        });
    </script>
</body>
</html>
`;

const DosPlayer = ({ exeData, onClose }) => {
    const iframeRef = useRef(null);

    // 自动将焦点移至 iframe
    useEffect(() => {
        if (iframeRef.current) {
            iframeRef.current.focus();
        }
    }, [exeData]);

    const handleIframeLoad = () => {
        if (iframeRef.current && exeData) {
            iframeRef.current.contentWindow.postMessage({ type: 'START_DOS', exeData }, '*');
        }
    };

    return (
        <div className="dos-player-overlay">
            <div className="dos-player-container">
                <div className="dos-player-header">
                    <span>🖥️ DOS 交互模式 (WASM 隔离沙盒)</span>
                    <button className="btn-close" onClick={onClose}>✖</button>
                </div>

                <div className="dos-canvas-wrapper" style={{ width: '640px', height: '400px', backgroundColor: '#000' }}>
                    <iframe
                        ref={iframeRef}
                        srcDoc={HTML_TEMPLATE}
                        onLoad={handleIframeLoad}
                        width="640"
                        height="400"
                        frameBorder="0"
                        scrolling="no"
                        title="dos-sandbox"
                        style={{ display: 'block' }}
                        sandbox="allow-scripts allow-downloads allow-pointer-lock allow-same-origin"
                        tabIndex="0"
                    />
                </div>

                <div className="dos-hint">
                    提示: 点击黑框以捕获鼠标/键盘。按 ESC 或 Ctrl+F10 释放。关闭此窗口后将彻底释放所有按键事件。
                </div>
            </div>

            <style>{`
        .dos-player-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        }
        .dos-player-container {
            background: #2a2a2a;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .dos-player-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #fff;
            font-weight: bold;
            border-bottom: 1px solid #444;
            padding-bottom: 8px;
        }
        .btn-close {
            background: transparent;
            border: none;
            color: #fff;
            font-size: 18px;
            cursor: pointer;
        }
        .dos-canvas-wrapper {
            position: relative;
        }
        .dos-hint {
            color: #aaa;
            font-size: 12px;
            text-align: center;
        }
      `}</style>
        </div>
    );
};

export default DosPlayer;
