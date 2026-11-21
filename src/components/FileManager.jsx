import React, { useState, useEffect, useRef } from 'react';
import {
  createFile,
  getAllFiles,
  deleteFile,
  renameFile,
  reorderFiles
} from '../services/fileService';
import './FileManager.css';

function FileManager({ isOpen, onClose, onFileSelect, onFileRename, currentFileId, width = 260 }) {
  const [files, setFiles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [dragOverId, setDragOverId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef(null);
  const newInputRef = useRef(null);
  const dragItemId = useRef(null);

  // 加载文件列表
  const loadFiles = () => {
    setFiles(getAllFiles());
  };

  useEffect(() => {
    loadFiles();
  }, [currentFileId, isOpen]);

  // 新建文件名输入框聚焦
  useEffect(() => {
    if (showNewDialog && newInputRef.current) {
      newInputRef.current.focus();
      newInputRef.current.select();
    }
  }, [showNewDialog]);

  // 编辑模式输入框聚焦
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // ---------- 新建 ----------
  const handleCreateFile = () => {
    setShowNewDialog(true);
    setNewFileName('');
    setErrorMsg('');
  };

  const handleConfirmCreate = () => {
    let name = newFileName.trim();
    if (!name) return;

    if (!/\.asm$/i.test(name)) {
      name = name + '.asm';
    }

    // 检查重名
    if (files.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      setErrorMsg('文件名已存在，请换一个名字');
      return;
    }

    const newFile = createFile(name);
    loadFiles();
    setShowNewDialog(false);
    setNewFileName('');
    setErrorMsg('');
    onFileSelect(newFile);
  };

  const handleCancelCreate = () => {
    setShowNewDialog(false);
    setNewFileName('');
    setErrorMsg('');
  };

  // ---------- 重命名 ----------
  const handleRenameClick = (file, e) => {
    e.stopPropagation();
    setEditingId(file.id);
    setEditingName(file.name.replace(/\.asm$/i, ''));
    setErrorMsg('');
  };

  const handleConfirmRename = () => {
    if (!editingId || !editingName.trim()) {
      setEditingId(null);
      setEditingName('');
      return;
    }

    let name = editingName.trim();
    if (!/\.asm$/i.test(name)) {
      name = name + '.asm';
    }

    // 检查重名（排除自身）
    if (files.some(f => f.id !== editingId && f.name.toLowerCase() === name.toLowerCase())) {
      setErrorMsg('文件名已存在，请换一个名字');
      return;
    }

    renameFile(editingId, name);
    onFileRename(editingId, name);
    loadFiles();
    setEditingId(null);
    setEditingName('');
    setErrorMsg('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setErrorMsg('');
  };

  // ---------- 删除 ----------
  const handleDelete = (file, e) => {
    e.stopPropagation();
    if (files.length <= 1) {
      alert('至少需要保留一个文件！');
      return;
    }
    if (window.confirm(`确定要删除文件 "${file.name}" 吗？此操作不可恢复。`)) {
      const wasActive = file.id === currentFileId;
      deleteFile(file.id);
      loadFiles();
      if (wasActive) {
        const remaining = getAllFiles();
        if (remaining.length > 0) {
          onFileSelect(remaining[0]);
        }
      }
    }
  };

  // ---------- 选择 ----------
  const handleSelect = (file) => {
    if (editingId) return;
    onFileSelect(file);
    onClose();
  };

  // ---------- 键盘 ----------
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirmRename();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleNewFileKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirmCreate();
    } else if (e.key === 'Escape') {
      handleCancelCreate();
    }
  };

  const handleNewFileNameChange = (e) => {
    setNewFileName(e.target.value);
    setErrorMsg('');
  };

  const handleEditNameChange = (e) => {
    setEditingName(e.target.value);
    setErrorMsg('');
  };

  // ---------- 拖拽排序 ----------
  const handleDragStart = (e, file) => {
    dragItemId.current = file.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', file.id);
  };

  const handleDragOver = (e, file) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== file.id) {
      setDragOverId(file.id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e, targetFile) => {
    e.preventDefault();
    setDragOverId(null);
    const draggedId = dragItemId.current;
    if (!draggedId || draggedId === targetFile.id) return;

    // 计算新顺序
    const currentFiles = getAllFiles();
    const draggedIdx = currentFiles.findIndex(f => f.id === draggedId);
    const targetIdx = currentFiles.findIndex(f => f.id === targetFile.id);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const newFiles = [...currentFiles];
    const [dragged] = newFiles.splice(draggedIdx, 1);
    newFiles.splice(targetIdx, 0, dragged);

    reorderFiles(newFiles.map(f => f.id));
    loadFiles();
    dragItemId.current = null;
  };

  const handleDragEnd = () => {
    setDragOverId(null);
    dragItemId.current = null;
  };

  return (
    <>
      <div
        className={`file-manager ${isOpen ? 'open' : ''}`}
        style={isOpen ? { width: `${width}px` } : undefined}
      >
        <div className="file-manager-header">
          <h3>
            <span>📁</span>
            文件管理器
          </h3>
          <button className="close-btn" onClick={onClose} aria-label="关闭文件管理器">×</button>
        </div>

        <div className="file-manager-actions">
          <button className="new-file-btn" onClick={handleCreateFile}>
            <span className="new-file-btn-icon" aria-hidden>+</span>
            新建文件
          </button>
        </div>

        <div className="file-list">
          {files.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📂</span>
              <p>暂无文件</p>
              <span className="empty-hint">点击上方按钮创建新文件</span>
            </div>
          ) : (
            files.map(file => (
              <div
                key={file.id}
                draggable
                className={`file-item ${file.id === currentFileId ? 'active' : ''} ${dragOverId === file.id ? 'drag-over' : ''} ${dragItemId.current === file.id ? 'dragging' : ''}`}
                onClick={() => handleSelect(file)}
                onDragStart={(e) => handleDragStart(e, file)}
                onDragOver={(e) => handleDragOver(e, file)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, file)}
                onDragEnd={handleDragEnd}
              >
                <span className="file-icon" aria-hidden="true">📄</span>

                {editingId === file.id ? (
                  <input
                    ref={inputRef}
                    type="text"
                    className="file-name-input"
                    value={editingName}
                    onChange={handleEditNameChange}
                    onKeyDown={handleKeyDown}
                    onBlur={handleConfirmRename}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button className="file-name file-open" type="button" onClick={event => {
                    event.stopPropagation();
                    handleSelect(file);
                  }}>{file.name}</button>
                )}

                <div className="file-item-actions">
                  <button
                    className="icon-btn rename-btn"
                    onClick={(e) => handleRenameClick(file, e)}
                    title="重命名"
                  >
                    ✏️
                  </button>
                  <button
                    className="icon-btn delete-btn"
                    onClick={(e) => handleDelete(file, e)}
                    title="删除文件"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="file-manager-footer">
          <span className="file-count">共 {files.length} 个文件</span>
        </div>

        {/* 新建文件对话框 */}
        {showNewDialog && (
          <div className="new-file-dialog-overlay" onClick={handleCancelCreate}>
            <div className="new-file-dialog" onClick={(e) => e.stopPropagation()}>
              <h4>新建文件</h4>
              <input
                ref={newInputRef}
                type="text"
                placeholder="输入文件名（自动添加.asm后缀）..."
                value={newFileName}
                onChange={handleNewFileNameChange}
                onKeyDown={handleNewFileKeyDown}
              />
              {errorMsg && <div className="dialog-error">{errorMsg}</div>}
              <div className="dialog-actions">
                <button className="btn-cancel" onClick={handleCancelCreate}>取消</button>
                <button className="btn-confirm" onClick={handleConfirmCreate}>创建</button>
              </div>
            </div>
          </div>
        )}

        {/* 重命名错误提示 */}
        {editingId && errorMsg && (
          <div className="inline-error">{errorMsg}</div>
        )}
      </div>
    </>
  );
}

export default FileManager;
