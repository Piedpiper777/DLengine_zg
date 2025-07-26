/**
 * 文档上传与知识图谱构建模块
 */
(function() {
    // 在DOM加载完成后初始化
    document.addEventListener('DOMContentLoaded', function() {
        initializeUploadFeature();
    });

    /**
     * 初始化上传功能
     */
    function initializeUploadFeature() {
        console.log("初始化文档上传功能...");
        const uploadTab = document.getElementById('upload-tab');
        if (!uploadTab) {
            console.error("找不到上传标签页元素");
            return;
        }

        setupDragAndDrop();
        setupFileInput();
        addTabSwitchListener();
    }

    /**
     * 设置拖放上传功能
     */
    function setupDragAndDrop() {
        const uploadArea = document.getElementById('upload-area');
        if (!uploadArea) {
            console.error("找不到上传区域元素");
            return;
        }
        
        // 阻止默认拖放行为（避免浏览器打开文件）
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, preventDefaults, false);
        });

        // 高亮显示拖放区域
        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, highlight, false);
        });

        // 移除高亮显示
        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, unhighlight, false);
        });

        // 处理文件拖放
        uploadArea.addEventListener('drop', handleDrop, false);
        
        // 点击上传区域触发文件选择
        uploadArea.addEventListener('click', triggerFileInput, false);
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        function highlight() {
            uploadArea.classList.add('highlight');
        }
        
        function unhighlight() {
            uploadArea.classList.remove('highlight');
        }
        
        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length > 0) {
                handleFiles(files);
            }
        }
        
        function triggerFileInput() {
            const fileInput = document.getElementById('file-input');
            if (fileInput) {
                fileInput.click();
            }
        }
    }

    /**
     * 设置文件输入处理
     */
    function setupFileInput() {
        const fileInput = document.getElementById('file-input');
        if (!fileInput) {
            console.error("找不到文件输入元素");
            return;
        }
        
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                handleFiles(this.files);
            }
        });
    }

    /**
     * 处理上传的文件
     */
    function handleFiles(files) {
        // 验证文件数量
        if (files.length === 0) {
            showMessage('请选择要上传的文件', 'warning');
            return;
        }
        
        if (files.length > 1) {
            showMessage('目前只支持单文件上传，将处理第一个文件', 'warning');
        }
        
        const file = files[0];
        
        // 验证文件类型
        const fileName = file.name.toLowerCase();
        const validExtensions = ['.txt', '.doc', '.docx'];
        
        let isValidFile = validExtensions.some(ext => fileName.endsWith(ext));
        
        if (!isValidFile) {
            showMessage(`不支持的文件类型。支持的格式：${validExtensions.join(', ')}`, 'error');
            return;
        }
        
        // 验证文件大小（限制为10MB）
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            showMessage(`文件大小超过限制（${formatFileSize(maxSize)}），请选择更小的文件`, 'error');
            return;
        }
        
        // 验证文件名
        if (file.name.length > 255) {
            showMessage('文件名过长，请重命名后重试', 'error');
            return;
        }
        
        console.log(`准备上传文件: ${file.name}, 大小: ${formatFileSize(file.size)}`);
        
        // 显示文件信息
        displayFileInfo(file);
        
        // 上传文件
        uploadFile(file);
    }

    /**
     * 显示文件信息
     */
    function displayFileInfo(file) {
        const fileList = document.getElementById('upload-file-list');
        if (!fileList) return;
        
        const fileSize = formatFileSize(file.size);
        
        fileList.innerHTML = `
            <div class="upload-file-item" id="file-item-${Date.now()}">
                <div>
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${fileSize}</div>
                </div>
                <div class="file-status status-uploading">上传中</div>
            </div>
        `;
    }

    /**
     * 格式化文件大小
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 上传文件
     */
    function uploadFile(file) {
        const formData = new FormData();
        formData.append('document', file);
        
        const progressBar = document.getElementById('upload-progress');
        if (progressBar) {
            progressBar.style.display = 'block';
            progressBar.querySelector('.progress-bar').style.width = '0%';
        }
        
        fetch('/kg/upload_document', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`上传失败: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                updateFileStatus('success', '上传成功');
                if (progressBar) {
                    progressBar.querySelector('.progress-bar').style.width = '100%';
                }
                
                // 开始处理文档创建知识图谱
                showMessage('文件上传成功，开始创建知识图谱...', 'info');
                createKnowledgeGraph(data.documentId, file.name);
            } else {
                updateFileStatus('error', data.message || '上传失败');
                showMessage(data.message || '文件上传失败', 'error');
            }
        })
        .catch(error => {
            console.error('文件上传失败:', error);
            updateFileStatus('error', error.message);
            showMessage(`文件上传失败: ${error.message}`, 'error');
        });
    }

    /**
     * 更新文件状态
     */
    function updateFileStatus(status, message) {
        const fileItem = document.querySelector('.upload-file-item');
        if (!fileItem) return;
        
        const statusElement = fileItem.querySelector('.file-status');
        if (!statusElement) return;
        
        // 移除所有状态类
        statusElement.classList.remove('status-uploading', 'status-success', 'status-error');
        
        // 添加新的状态类
        statusElement.classList.add(`status-${status}`);
        statusElement.textContent = message;
    }

    /**
     * 创建知识图谱
     */
    function createKnowledgeGraph(documentId, fileName) {
        // 显示处理状态
        const processingStatus = document.getElementById('processing-status');
        if (processingStatus) {
            processingStatus.style.display = 'block';
            processingStatus.innerHTML = `
                <h5>正在处理文档并构建知识图谱...</h5>
                <p>这可能需要一些时间，请耐心等待。处理大型文档可能需要几分钟。</p>
                <div class="processing-steps">
                    <div class="processing-step">
                        <div class="step-icon">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <div class="step-text">文档解析 <span class="badge badge-info">进行中</span></div>
                    </div>
                    <div class="processing-step">
                        <div class="step-icon">
                            <i class="fas fa-brain"></i>
                        </div>
                        <div class="step-text">知识抽取 <span class="badge badge-secondary">等待中</span></div>
                    </div>
                    <div class="processing-step">
                        <div class="step-icon">
                            <i class="fas fa-project-diagram"></i>
                        </div>
                        <div class="step-text">图谱构建 <span class="badge badge-secondary">等待中</span></div>
                    </div>
                </div>
                <div class="progress mt-3">
                    <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 10%"></div>
                </div>
            `;
        }
        
        // 准备请求数据
        const requestData = {
            documentId: documentId,
            documentName: fileName
        };
        
        // 发送创建图谱请求
        fetch('/kg/create_temp_kg', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`创建图谱失败: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // 隐藏处理状态
            if (processingStatus) {
                processingStatus.style.display = 'none';
            }
            
            if (data.success) {
                // 显示创建成功结果
                showCreationResult(data);
                
                // 显示成功消息
                showMessage('知识图谱创建成功!', 'success');
                
                // 刷新图谱列表
                if (window.loadTempKGList) {
                    window.loadTempKGList();
                }
            } else {
                // 显示错误消息
                showCreationError(data.message || '创建知识图谱失败');
                showMessage(data.message || '创建知识图谱失败', 'error');
            }
        })
        .catch(error => {
            console.error('创建知识图谱失败:', error);
            
            // 隐藏处理状态
            if (processingStatus) {
                processingStatus.style.display = 'none';
            }
            
            // 显示错误消息
            showCreationError(error.message);
            showMessage(`创建知识图谱失败: ${error.message}`, 'error');
        });
        
        // 模拟进度更新
        let progress = 10;
        const progressInterval = setInterval(() => {
            if (processingStatus && processingStatus.style.display !== 'none') {
                progress += Math.floor(Math.random() * 5) + 1;
                if (progress > 90) {
                    progress = 90; // 不要到达100%，因为那表示完成
                }
                
                const progressBar = processingStatus.querySelector('.progress-bar');
                if (progressBar) {
                    progressBar.style.width = `${progress}%`;
                }
                
                // 更新步骤状态
                const steps = processingStatus.querySelectorAll('.processing-step');
                if (progress > 30 && steps.length >= 2) {
                    steps[0].querySelector('.badge').className = 'badge badge-success';
                    steps[0].querySelector('.badge').textContent = '完成';
                    steps[1].querySelector('.badge').className = 'badge badge-info';
                    steps[1].querySelector('.badge').textContent = '进行中';
                }
                if (progress > 60 && steps.length >= 3) {
                    steps[1].querySelector('.badge').className = 'badge badge-success';
                    steps[1].querySelector('.badge').textContent = '完成';
                    steps[2].querySelector('.badge').className = 'badge badge-info';
                    steps[2].querySelector('.badge').textContent = '进行中';
                }
            } else {
                clearInterval(progressInterval);
            }
        }, 1000);
    }

    /**
     * 显示创建结果
     */
    function showCreationResult(data) {
        const resultContainer = document.getElementById('creation-result');
        if (!resultContainer) return;
        
        // 获取实体类型列表
        let entityTypesList = '';
        if (data.stats && data.stats.entityTypes) {
            entityTypesList = data.stats.entityTypes.map(type => 
                `<span class="badge badge-info mr-1">${type}</span>`
            ).join(' ');
        }
        
        resultContainer.style.display = 'block';
        resultContainer.innerHTML = `
            <div class="alert alert-success">
                <h4><i class="fas fa-check-circle mr-2"></i> 知识图谱创建成功！</h4>
                <div class="row mt-3">
                    <div class="col-md-6">
                        <div class="card border-light mb-3">
                            <div class="card-body">
                                <h5 class="card-title">图谱信息</h5>
                                <table class="table table-sm">
                                    <tbody>
                                        <tr>
                                            <th scope="row">图谱名称</th>
                                            <td><strong>${data.kgName}</strong></td>
                                        </tr>
                                        <tr>
                                            <th scope="row">子图标识</th>
                                            <td><code>${data.stats.subgraph || 'UserKG_' + data.kgId}</code></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card border-light mb-3">
                            <div class="card-body">
                                <h5 class="card-title">统计数据</h5>
                                <table class="table table-sm">
                                    <tbody>
                                        <tr>
                                            <th scope="row">节点数量</th>
                                            <td><strong>${data.stats.nodeCount}</strong></td>
                                        </tr>
                                        <tr>
                                            <th scope="row">关系数量</th>
                                            <td><strong>${data.stats.relationCount}</strong></td>
                                        </tr>
                                        <tr>
                                            <th scope="row">实体类型</th>
                                            <td>${data.stats.entityTypes.length}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mt-3">
                    <h6>实体类型:</h6>
                    <div class="entity-types">
                        ${entityTypesList || '<span class="text-muted">无实体类型信息</span>'}
                    </div>
                </div>
                <div class="mt-3 text-center">
                    <button class="btn btn-primary" onclick="viewKnowledgeGraph('${data.kgId}')">
                        <i class="fas fa-eye mr-1"></i> 立即查看图谱
                    </button>
                    <button class="btn btn-outline-secondary ml-2" onclick="switchToManageTab()">
                        <i class="fas fa-list mr-1"></i> 查看图谱列表
                    </button>
                </div>
            </div>
        `;
        
        // ✅ 重要：刷新图谱列表
        setTimeout(() => {
            if (window.loadUserKgList) {
                window.loadUserKgList();
            }
            if (window.loadTempKGList) {
                window.loadTempKGList();
            }
        }, 1000);
    }

    /**
     * 显示创建错误
     */
    function showCreationError(errorMessage) {
        const resultContainer = document.getElementById('creation-result');
        if (!resultContainer) return;
        
        resultContainer.style.display = 'block';
        resultContainer.innerHTML = `
            <div class="alert alert-danger">
                <h4><i class="fas fa-exclamation-circle mr-2"></i> 知识图谱创建失败</h4>
                <p class="mt-3">${errorMessage}</p>
                <div class="mt-3 text-center">
                    <button class="btn btn-primary" onclick="location.reload()">
                        <i class="fas fa-redo mr-1"></i> 重试
                    </button>
                    <button class="btn btn-outline-secondary ml-2" onclick="switchToManageTab()">
                        <i class="fas fa-list mr-1"></i> 查看已有图谱
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * 切换到管理标签页
     */
    function switchToManageTab() {
        const manageTab = document.getElementById('manage-tab');
        if (manageTab) {
            manageTab.click();
        }
    }

    /**
     * 添加标签页切换监听器
     */
    function addTabSwitchListener() {
        const manageTab = document.getElementById('manage-tab');
        if (manageTab) {
            manageTab.addEventListener('click', function() {
                // 当切换到管理标签页时，刷新图谱列表
                setTimeout(() => {
                    if (window.loadTempKGList) {
                        window.loadTempKGList();
                    }
                }, 300);
            });
        }
        
        // 刷新按钮
        const refreshButton = document.getElementById('refresh-kg-list');
        if (refreshButton) {
            refreshButton.addEventListener('click', function() {
                if (window.loadTempKGList) {
                    window.loadTempKGList();
                }
            });
        }
    }

    /**
     * 显示消息
     */
    function showMessage(message, type = 'info') {
        if (window.showMessage) {
            window.showMessage(message, type);
        } else {
            // 如果全局函数不可用，使用备用实现
            console.log(`${type.toUpperCase()}: ${message}`);
            alert(message);
        }
    }

    // 暴露全局函数
    window.switchToManageTab = switchToManageTab;
})();