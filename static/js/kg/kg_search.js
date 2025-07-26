// 全局变量定义 - 使用window对象来避免重复声明
if (typeof window.contentLoaded === 'undefined') {
    window.contentLoaded = false;
}
if (typeof window.kgInitialized === 'undefined') {
    window.kgInitialized = false;
}
if (typeof window.queryUrl === 'undefined') {
    window.queryUrl = '/kg/kg_search';
}

// 基础工具函数
// 显示消息通知
function showMessage(message, type = 'info') {
    let messageContainer = document.getElementById('message-container');
    
    if (!messageContainer) {
        // 如果容器不存在，创建一个
        messageContainer = document.createElement('div');
        messageContainer.id = 'message-container';
        messageContainer.style.position = 'fixed';
        messageContainer.style.top = '20px';
        messageContainer.style.right = '20px';
        messageContainer.style.zIndex = '9999';
        document.body.appendChild(messageContainer);
    }
    
    // 创建消息元素
    const messageElement = document.createElement('div');
    
    // 根据类型设置不同的样式
    let alertClass = 'alert-info';
    if (type === 'error') alertClass = 'alert-danger';
    if (type === 'success') alertClass = 'alert-success';
    if (type === 'warning') alertClass = 'alert-warning';
    
    messageElement.className = `alert ${alertClass} alert-dismissible fade show`;
    messageElement.role = 'alert';
    messageElement.innerHTML = `
        ${message}
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
            <span aria-hidden="true">&times;</span>
        </button>
    `;
    
    // 添加到容器
    messageContainer.appendChild(messageElement);
    
    // 自动关闭
    setTimeout(() => {
        messageElement.classList.remove('show');
        setTimeout(() => {
            if (messageElement.parentNode === messageContainer) {
                messageContainer.removeChild(messageElement);
            }
        }, 300);
    }, 5000);
}

function hideMessage() {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        messageContainer.style.display = 'none';
    }
}

// 知识图谱可视化函数
function visualizeKG(kgId = 'default') {
    console.log(`开始加载知识图谱: ${kgId}`);
    
    const graphContainer = document.getElementById('neo4j-graph');
    const loadingElement = document.getElementById('kg-loading');
    const loadingMessage = document.getElementById('loading-message');
    
    if (!graphContainer) {
        console.error("❌ 找不到图谱容器元素 'neo4j-graph'");
        return;
    }
    
    // 显示加载状态
    graphContainer.innerHTML = '';
    if (loadingElement) loadingElement.style.display = 'flex';
    if (loadingMessage) loadingMessage.textContent = '正在加载知识图谱...';
    
    // ✅ 使用新的可视化 API
    fetch(`/kg/visualization/${kgId}`)
        .then(response => response.json())
        .then(data => {
            if (loadingElement) loadingElement.style.display = 'none';
            
            if (data.success) {
                console.log('获取可视化数据成功:', data.data);
                renderVisualization(data.data, kgId);
            } else {
                console.error('获取可视化数据失败:', data.message);
                graphContainer.innerHTML = `
                    <div style="text-align:center;padding:50px;color:#d32f2f;">
                        <h4>加载失败</h4>
                        <p>${data.message}</p>
                        <button class="btn btn-primary mt-3" onclick="visualizeKG('${kgId}')">
                            重试
                        </button>
                    </div>
                `;
            }
        })
        .catch(error => {
            console.error('获取可视化数据失败:', error);
            if (loadingElement) loadingElement.style.display = 'none';
            
            graphContainer.innerHTML = `
                <div style="text-align:center;padding:50px;color:#d32f2f;">
                    <h4>网络错误</h4>
                    <p>无法连接到服务器，请检查网络连接</p>
                    <button class="btn btn-primary mt-3" onclick="visualizeKG('${kgId}')">
                        重试
                    </button>
                </div>
            `;
        });
}

// 4. 添加渲染可视化数据的函数
// 改进可视化错误处理
function renderVisualization(data, kgId) {
    const graphContainer = document.getElementById('neo4j-graph');
    
    if (!data || !data.nodes || data.nodes.length === 0) {
        graphContainer.innerHTML = `
            <div style="text-align:center;padding:50px;">
                <i class="fas fa-info-circle" style="font-size:48px;color:#6c757d;margin-bottom:15px;"></i>
                <h4>暂无数据</h4>
                <p class="text-muted">该知识图谱中暂无节点数据</p>
                ${kgId !== 'default' ? `
                    <button class="btn btn-outline-primary mt-2" onclick="switchToUploadTab()">
                        上传文档创建图谱
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }
    
    // 检查 NeoVis 是否可用
    if (typeof NeoVis === 'undefined') {
        console.error("❌ NeoVis库未加载");
        graphContainer.innerHTML = `
            <div style="text-align:center;padding:50px;color:#d32f2f;">
                <i class="fas fa-exclamation-triangle" style="font-size:48px;margin-bottom:15px;"></i>
                <h4>无法加载可视化库</h4>
                <p>请刷新页面重试</p>
                <button class="btn btn-primary mt-3" onclick="window.location.reload()">
                    <i class="fas fa-redo mr-1"></i> 刷新页面
                </button>
            </div>
        `;
        return;
    }
    
    // 构建 Cypher 查询
    let cypher;
    if (kgId === 'default') {
        cypher = `
            MATCH (n)-[r]->(m)
            WHERE NOT any(label IN labels(n) WHERE label =~ 'UserKG_.*') 
            AND NOT any(label IN labels(m) WHERE label =~ 'UserKG_.*')
            RETURN n, r, m LIMIT 50
        `;
    } else {
        const safe_kg_id = kgId.replace('-', '_');
        cypher = `
            MATCH (n:\`UserKG_${safe_kg_id}\`)-[r]->(m:\`UserKG_${safe_kg_id}\`)
            WHERE r.kg_id = "${kgId}"
            RETURN n, r, m LIMIT 100
        `;
    }
    
    // NeoVis 配置
    const config = {
        containerId: 'neo4j-graph',
        neo4j: {
            serverUrl: "bolt://localhost:7687",
            serverUser: "neo4j",
            serverPassword: "3080neo4j"
        },
        labels: {
            "*": {
                "caption": "name",
                "size": 25,
                "font": {
                    "size": 16,
                    "color": "#343434"
                }
            }
        },
        relationships: {
            "*": {
                "caption": true,
                "thickness": 2
            }
        },
        visConfig: {
            nodes: {
                shape: 'circle',
                size: 25,
                font: { size: 16, color: '#343434' }
            },
            edges: {
                arrows: { to: { enabled: true } },
                font: { size: 14, color: '#666' }
            },
            physics: {
                enabled: true,
                stabilization: { enabled: true, iterations: 1000 }
            },
            interaction: {
                hover: true,
                zoomView: true,
                dragNodes: true,
                dragView: true
            }
        }
    };
    
    try {
        const viz = new NeoVis.default(config);
        window.currentViz = viz;
        
        viz.registerOnEvent("completed", (e) => {
            console.log("图谱渲染完成");
            if (viz.network) {
                window.currentViz.network = viz.network;
            }
        });
        
        viz.registerOnEvent("error", (error) => {
            console.error("可视化错误:", error);
            graphContainer.innerHTML = `
                <div style="text-align:center;padding:50px;color:#d32f2f;">
                    <h4>渲染失败</h4>
                    <p>可视化渲染出现错误</p>
                </div>
            `;
        });
        
        viz.renderWithCypher(cypher);
        
    } catch (e) {
        console.error("初始化可视化失败:", e);
        graphContainer.innerHTML = `
            <div style="text-align:center;padding:50px;color:#d32f2f;">
                <h4>初始化失败</h4>
                <p>可视化组件初始化失败</p>
            </div>
        `;
    }
}


// 添加标签页切换监听函数
function setupTabSwitchListeners() {
    // 监听管理标签页切换
    const manageTab = document.getElementById('manage-tab');
    if (manageTab) {
        manageTab.addEventListener('shown.bs.tab', function() {
            console.log("切换到管理标签页，加载图谱列表");
            setTimeout(() => {
                loadTempKGList();
            }, 200);
        });
    }
    
    // 监听上传标签页切换
    const uploadTab = document.getElementById('upload-tab');
    if (uploadTab) {
        uploadTab.addEventListener('shown.bs.tab', function() {
            console.log("切换到上传标签页");
            // 这里可以添加上传页面的初始化逻辑
        });
    }
    
    // 监听探索标签页切换
    const exploreTab = document.getElementById('explore-tab');
    if (exploreTab) {
        exploreTab.addEventListener('shown.bs.tab', function() {
            console.log("切换到探索标签页");
            // 确保可视化正常显示
            setTimeout(() => {
                const currentKgId = document.getElementById('kg-selector')?.value || 'default';
                visualizeKG(currentKgId);
            }, 200);
        });
    }
}

// 6. 添加显示查询结果的函数
function displayQueryResults(data) {
    const resultContainer = document.getElementById('query-result');
    
    let resultHTML = `<div class="result-section">
        <div class="result-query">
            <h4>生成的查询语句:</h4>
            <pre><code>${data.query}</code></pre>
        </div>
        <div class="result-data">
            <h4>查询结果:</h4>`;
            
    if (!data.result || data.result.length === 0) {
        resultHTML += '<div class="no-results">未找到匹配的结果</div>';
    } else {
        // 构建结果表格
        resultHTML += '<table class="result-table table table-striped"><thead><tr>';
        
        // 获取所有列名
        const columns = new Set();
        data.result.forEach(row => {
            Object.keys(row).forEach(key => columns.add(key));
        });
        
        // 表头
        columns.forEach(col => {
            resultHTML += `<th>${col}</th>`;
        });
        resultHTML += '</tr></thead><tbody>';
        
        // 表格内容
        data.result.forEach(row => {
            resultHTML += '<tr>';
            columns.forEach(col => {
                let value = row[col] || '';
                
                if (typeof value === 'object' && value !== null) {
                    if (value.name) {
                        value = value.name;
                    } else {
                        value = JSON.stringify(value);
                    }
                }
                
                resultHTML += `<td>${value}</td>`;
            });
            resultHTML += '</tr>';
        });
        
        resultHTML += '</tbody></table>';
    }
    
    resultHTML += '</div></div>';
    resultContainer.innerHTML = resultHTML;
}

// 2. 添加加载用户图谱列表的函数
function loadUserKgList() {
    const kgSelector = document.getElementById('kg-selector');
    if (!kgSelector) {
        console.log("找不到图谱选择器");
        return;
    }
    
    console.log("加载用户知识图谱列表...");
    
    fetch('/kg/list')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 清除现有的用户图谱选项（保留默认选项）
                const defaultOption = kgSelector.querySelector('option[value="default"]');
                kgSelector.innerHTML = '';
                if (defaultOption) {
                    kgSelector.appendChild(defaultOption);
                } else {
                    const option = document.createElement('option');
                    option.value = 'default';
                    option.textContent = '默认知识图谱';
                    kgSelector.appendChild(option);
                }
                
                // 添加用户图谱选项
                data.kgs.forEach(kg => {
                    const option = document.createElement('option');
                    option.value = kg.kgId;
                    option.textContent = `${kg.name} (${kg.nodeCount || 0}节点, ${kg.relationCount || 0}关系)`;
                    kgSelector.appendChild(option);
                });
                
                console.log(`加载了 ${data.kgs.length} 个用户图谱`);
            } else {
                console.error('加载用户图谱列表失败:', data.message);
            }
        })
        .catch(error => {
            console.error('获取用户图谱列表失败:', error);
        });
}

// 1. 修复查询 API 路径
async function submitQuery(event) {
    if (event) {
        event.preventDefault();
    }
    
    const queryInput = document.getElementById('query-input');
    const resultContainer = document.getElementById('query-result');
    const kgSelector = document.getElementById('kg-selector');
    const queryButton = document.getElementById('query-button');
    
    if (!queryInput || !resultContainer) {
        console.error("找不到查询相关DOM元素");
        return;
    }
    
    const question = queryInput.value.trim();
    const kgId = kgSelector ? kgSelector.value : 'default';
    
    if (!question) {
        resultContainer.innerHTML = '<div class="alert alert-warning">请输入查询问题</div>';
        return;
    }
    
    // 显示加载状态
    if (queryButton) {
        queryButton.disabled = true;
        queryButton.textContent = '查询中...';
    }
    resultContainer.innerHTML = '<div class="loading">正在查询...</div>';
    
    try {
        // ✅ 修复：使用正确的 API 路径
        const response = await fetch('/kg/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: question,
                kgId: kgId
            })
        });
        
        const data = await response.json();
        
        // 恢复按钮状态
        if (queryButton) {
            queryButton.disabled = false;
            queryButton.textContent = '查询';
        }
        
        if (data.success) {
            // 显示查询结果
            displayQueryResults(data);
        } else {
            resultContainer.innerHTML = `<div class="alert alert-danger">查询失败: ${data.message}</div>`;
        }
    } catch (error) {
        console.error('查询请求失败:', error);
        resultContainer.innerHTML = '<div class="alert alert-danger">查询请求失败，请检查网络连接</div>';
        
        if (queryButton) {
            queryButton.disabled = false;
            queryButton.textContent = '查询';
        }
    }
}

// 单一的初始化函数
function initializeKG() {
    if (window.kgInitialized) {
        console.log("知识图谱已初始化，跳过重复初始化");
        return;
    }
    window.kgInitialized = true;
    
    console.log("🚀 初始化知识图谱系统...");
    
    // 检查当前页面是否是知识图谱页面
    const graphContainer = document.getElementById('neo4j-graph');
    const queryForm = document.getElementById('query-form');
    const kgSelector = document.getElementById('kg-selector');
    
    const isKGPage = graphContainer || queryForm;
    
    if (!isKGPage) {
        console.log("当前页面不是知识图谱页面，跳过初始化");
        window.kgInitialized = false;
        return;
    }
    
    // 初始化下拉框和事件监听
    if (kgSelector) {
        loadUserKgList();
        
        // 监听下拉框变化
        kgSelector.addEventListener('change', function() {
            const selectedKgId = this.value;
            console.log(`切换到图谱: ${selectedKgId}`);
            visualizeKG(selectedKgId);
            loadKGInfo(selectedKgId);
        });
    }
    
    // 初始化可视化组件
    if (graphContainer) {
        setupControlButtons();
        setTimeout(() => {
            visualizeKG('default');
            loadKGInfo('default');
        }, 800);
    }
    
    // 初始化查询组件
    if (queryForm) {
        setupQueryHandlers();
    }
    
    // ✅ 添加标签页切换监听
    setupTabSwitchListeners();
    
    console.log("✅ 知识图谱系统初始化完成");
}

// 添加标签页切换监听函数
function setupTabSwitchListeners() {
    // 监听管理标签页切换
    const manageTab = document.getElementById('manage-tab');
    if (manageTab) {
        manageTab.addEventListener('shown.bs.tab', function() {
            console.log("切换到管理标签页，加载图谱列表");
            setTimeout(() => {
                loadTempKGList();
            }, 200);
        });
    }
    
    // 监听上传标签页切换
    const uploadTab = document.getElementById('upload-tab');
    if (uploadTab) {
        uploadTab.addEventListener('shown.bs.tab', function() {
            console.log("切换到上传标签页");
            // 这里可以添加上传页面的初始化逻辑
        });
    }
    
    // 监听探索标签页切换
    const exploreTab = document.getElementById('explore-tab');
    if (exploreTab) {
        exploreTab.addEventListener('shown.bs.tab', function() {
            console.log("切换到探索标签页");
            // 确保可视化正常显示
            setTimeout(() => {
                const currentKgId = document.getElementById('kg-selector')?.value || 'default';
                visualizeKG(currentKgId);
            }, 200);
        });
    }
}

// 改进连接检查函数，增加超时和更好的错误处理
function checkNeo4jConnection() {
    return new Promise((resolve) => {
        console.log("检查Neo4j连接状态...");
        
        // 添加超时，避免长时间等待
        const timeout = setTimeout(() => {
            console.warn("Neo4j连接检查超时，继续尝试加载图谱");
            resolve(true);
        }, 3000);
        
        // 发送简单查询测试连接
        fetch('/kg/check_connection', {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' }  // 避免缓存
        })
            .then(response => {
                clearTimeout(timeout);
                
                if (!response.ok) {
                    if (response.status === 404) {
                        console.warn("Neo4j连接检查API未实现，继续尝试加载图谱");
                    } else {
                        console.warn(`Neo4j连接检查返回状态码 ${response.status}，继续尝试加载图谱`);
                    }
                    resolve(true);
                    return null;
                }
                return response.json();
            })
            .then(data => {
                if (!data) return;
                
                if (data.success) {
                    console.log("✅ Neo4j连接正常");
                    resolve(true);
                } else {
                    console.warn("⚠️ Neo4j连接检查未成功，但仍尝试继续:", data.message);
                    resolve(true);
                }
            })
            .catch(error => {
                clearTimeout(timeout);
                console.warn("⚠️ Neo4j连接检查请求出错，但仍尝试继续:", error);
                resolve(true);
            });
    });
}

// 显示更友好的连接错误信息
function showConnectionError() {
    const graphContainer = document.getElementById('neo4j-graph');
    const loadingElement = document.getElementById('kg-loading');
    
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
    
    if (graphContainer) {
        graphContainer.innerHTML = `
            <div style="text-align:center;padding:50px;color:#d32f2f;">
                <h4>连接错误</h4>
                <p>无法连接到Neo4j数据库。请确保Neo4j服务已启动，然后尝试以下操作:</p>
                <div class="mt-3">
                    <ol class="text-left" style="display:inline-block;">
                        <li>确认Neo4j服务运行正常</li>
                        <li>检查连接配置是否正确</li>
                        <li>检查网络连接是否正常</li>
                    </ol>
                </div>
                <button class="btn btn-primary mt-3" onclick="window.location.reload()">
                    刷新页面重试
                </button>
            </div>
        `;
    }
}

// 添加加载临时知识图谱列表的函数
function loadTempKGList() {
    const tempKGListContainer = document.getElementById('temp-kg-list');
    const noTempKGMsg = document.getElementById('no-temp-kg-msg');
    
    if (!tempKGListContainer) {
        console.log("找不到临时知识图谱列表容器，可能在另一个页面");
        return;
    }
    
    // 显示加载状态
    tempKGListContainer.innerHTML = '<div class="text-center py-3">加载知识图谱列表...</div>';
    
    // ✅ 使用正确的API路径
    fetch('/kg/list')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.kgs && data.kgs.length > 0) {
                // 隐藏"无图谱"消息
                if (noTempKGMsg) noTempKGMsg.style.display = 'none';
                
                // 生成知识图谱列表
                let html = '';
                data.kgs.forEach(kg => {
                    const statusBadge = getStatusBadge(kg.status);
                    const entityTypes = kg.entity_types ? kg.entity_types.slice(0, 3).join(', ') : '未知';
                    
                    html += `
                        <div class="kg-item" data-kg-id="${kg.kgId}">
                            <div>
                                <div class="kg-name">
                                    ${kg.name} 
                                    ${statusBadge}
                                </div>
                                <div class="kg-details">
                                    <small class="text-muted">
                                        ${kg.nodeCount}个节点 • ${kg.relationCount}个关系 • ${entityTypes}
                                    </small>
                                    <br>
                                    <small class="text-muted">创建时间: ${new Date(kg.createdAt).toLocaleString()}</small>
                                </div>
                            </div>
                            <div class="kg-actions">
                                <button class="kg-view-btn" onclick="viewKnowledgeGraph('${kg.kgId}')" title="查看图谱">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="kg-edit-btn" onclick="editKnowledgeGraph('${kg.kgId}')" title="编辑图谱">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="kg-delete-btn" onclick="showDeleteConfirm('${kg.kgId}')" title="删除图谱">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
                
                tempKGListContainer.innerHTML = html;
                console.log(`✅ 加载了 ${data.kgs.length} 个用户图谱`);
            } else {
                // 显示"无图谱"消息
                if (noTempKGMsg) {
                    noTempKGMsg.style.display = 'block';
                } else {
                    tempKGListContainer.innerHTML = `
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle mr-2"></i>
                            暂无知识图谱，请先上传文档创建图谱
                        </div>`;
                }
            }
        })
        .catch(error => {
            console.error('获取知识图谱列表失败:', error);
            tempKGListContainer.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle mr-2"></i>
                    加载知识图谱列表失败
                    <button class="btn btn-sm btn-outline-secondary ml-2" onclick="loadTempKGList()">
                        重试
                    </button>
                </div>`;
        });
}

// 删除确认函数
function showDeleteConfirm(kgId) {
    const modal = $('#confirmDeleteModal'); // 使用jQuery选择器
    
    if (modal.length === 0) {
        console.error("找不到删除确认模态框");
        return;
    }
    
    // 设置确认按钮的点击事件
    $('#confirmDeleteBtn').off('click').on('click', function() {
        deleteKG(kgId);
        modal.modal('hide');
    });
    
    // 显示模态框
    modal.modal('show');
}

// 删除知识图谱函数
function deleteKG(kgId) {
    console.log(`开始删除知识图谱: ${kgId}`);
    
    // ✅ 使用正确的API路径和方法
    fetch(`/kg/delete/${kgId}`, { 
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`请求失败: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // 显示成功消息
            showMessage(`知识图谱删除成功`, 'success');
            
            // 刷新知识图谱列表
            loadTempKGList();
            loadUserKgList(); // 同时刷新下拉框
            
            // 如果当前正在显示被删除的图谱，则切换到默认图谱
            const kgSelector = document.getElementById('kg-selector');
            if (kgSelector && kgSelector.value === kgId) {
                kgSelector.value = 'default';
                visualizeKG('default');
                loadKGInfo('default');
            }
        } else {
            console.error(`删除知识图谱失败: ${data.message}`);
            showMessage(`删除失败: ${data.message}`, 'error');
        }
    })
    .catch(error => {
        console.error('删除知识图谱请求失败:', error);
        showMessage(`删除请求失败: ${error.message}`, 'error');
    });
}

// 单一的DOMContentLoaded事件监听器
document.addEventListener('DOMContentLoaded', function() {
    if (contentLoaded) {
        console.log("内容已加载过，跳过重复初始化");
        return;
    }
    contentLoaded = true;
    
    console.log("🔄 页面DOM加载完成，开始初始化知识图谱...");
    
    // 使用带延迟的initializeKG，确保DOM元素已完全渲染
    setTimeout(initializeKG, 500);
});

// 确保窗口加载完成后知识图谱已初始化
window.addEventListener('load', function() {
    console.log("窗口完全加载，确保知识图谱已初始化...");
    
    // 如果还未初始化，则进行初始化
    if (!window.kgInitialized) {
        initializeKG();
    }
    
    // 如果已初始化但图谱未显示，重新加载
    setTimeout(() => {
        const graphContainer = document.getElementById('neo4j-graph');
        const loadingElement = document.getElementById('kg-loading');
        
        if (graphContainer && 
            loadingElement && 
            loadingElement.style.display === 'none' && 
            (!graphContainer.innerHTML || graphContainer.innerHTML.trim() === '')) {
            console.log("知识图谱未正常加载，强制重新加载...");
            loadKGInfo('default');
            visualizeKG('default');
        }
    }, 1500);
});

// 修改全局暴露部分
(function() {
    // 将关键函数暴露到全局作用域
    window.visualizeKG = visualizeKG;
    window.loadKGInfo = loadKGInfo;
    window.submitQuery = submitQuery;
    window.setupControlButtons = setupControlButtons;
    window.setupQueryHandlers = setupQueryHandlers;
    window.initializeKG = initializeKG;
    window.checkNeo4jConnection = checkNeo4jConnection;
    window.loadTempKGList = loadTempKGList;
    window.showDeleteConfirm = showDeleteConfirm;
    window.deleteKG = deleteKG;
    window.showMessage = showMessage;
    window.loadUserKgList = loadUserKgList;
    window.getStatusBadge = getStatusBadge;
    window.viewKnowledgeGraph = viewKnowledgeGraph;
    window.editKnowledgeGraph = editKnowledgeGraph;
    window.switchToUploadTab = switchToUploadTab;
})();

// 在现有代码后添加：

function loadKGInfo(kgId = 'default') {

    console.log(`🔍 加载知识图谱信息: ${kgId}`);
    
    // 更新统计信息的函数
    function updateStats(stats) {
        const nodeCountEl = document.getElementById('node-count');
        const relationCountEl = document.getElementById('relation-count');
        const entityTypesCountEl = document.getElementById('entity-types-count');
        const createdTimeEl = document.getElementById('kg-created-time');
        
        if (nodeCountEl) nodeCountEl.textContent = stats.node_count || 0;
        if (relationCountEl) relationCountEl.textContent = stats.relation_count || 0;
        if (entityTypesCountEl) entityTypesCountEl.textContent = (stats.node_types || []).length;
        if (createdTimeEl) createdTimeEl.textContent = stats.created_time || '未知时间';
    }
    
    if (kgId === 'default') {
        // 显示默认图谱信息
        updateStats({
            node_count: '-',
            relation_count: '-',
            node_types: [],
            created_time: '系统预置'
        });
    } else {
        // 获取用户子图信息
        fetch(`/kg/subgraph/${kgId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    updateStats({
                        node_count: data.node_count,
                        relation_count: data.relation_count,
                        node_types: data.node_types,
                        created_time: data.name
                    });
                } else {
                    console.error('获取子图信息失败:', data.message);
                    updateStats({
                        node_count: '?',
                        relation_count: '?',
                        node_types: [],
                        created_time: '加载失败'
                    });
                }
            })
            .catch(error => {
                console.error('获取子图信息请求失败:', error);
                updateStats({
                    node_count: '?',
                    relation_count: '?',
                    node_types: [],
                    created_time: '加载失败'
                });
            });
    }
}

// 设置控制按钮事件
function setupControlButtons() {
    // 放大按钮
    const zoomInBtn = document.getElementById('zoom-in-btn');
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', function() {
            if (window.currentViz && window.currentViz.network) {
                const scale = window.currentViz.network.getScale();
                window.currentViz.network.moveTo({scale: scale * 1.2});
            }
        });
    }
    
    // 缩小按钮
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', function() {
            if (window.currentViz && window.currentViz.network) {
                const scale = window.currentViz.network.getScale();
                window.currentViz.network.moveTo({scale: scale * 0.8});
            }
        });
    }
    
    // 适应视图按钮
    const zoomFitBtn = document.getElementById('zoom-fit-btn');
    if (zoomFitBtn) {
        zoomFitBtn.addEventListener('click', function() {
            if (window.currentViz && window.currentViz.network) {
                window.currentViz.network.fit();
            }
        });
    }
    
    // 物理布局切换按钮
    const physicsBtn = document.getElementById('physics-btn');
    if (physicsBtn) {
        physicsBtn.addEventListener('click', function() {
            if (window.currentViz && window.currentViz.network) {
                const options = window.currentViz.network.getOptionsFromConfigurator();
                const currentPhysics = options.physics.enabled;
                window.currentViz.network.setOptions({physics: {enabled: !currentPhysics}});
                
                // 更新按钮状态
                physicsBtn.classList.toggle('active', !currentPhysics);
            }
        });
    }
}

// 设置查询处理器
function setupQueryHandlers() {
    const queryForm = document.getElementById('query-form');
    if (queryForm) {
        queryForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitQuery();
        });
    }
    
    const queryInput = document.getElementById('query-input');
    if (queryInput) {
        queryInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                submitQuery();
            }
        });
    }
}

// 添加缺失的工具函数
function getStatusBadge(status) {
    switch(status) {
        case 'active':
            return '<span class="badge badge-success">正常</span>';
        case 'processing':
            return '<span class="badge badge-info">处理中</span>';
        case 'failed':
            return '<span class="badge badge-danger">失败</span>';
        default:
            return '<span class="badge badge-secondary">未知</span>';
    }
}

// 添加查看图谱函数
function viewKnowledgeGraph(kgId) {
    // 切换到探索标签页
    const exploreTab = document.getElementById('explore-tab');
    if (exploreTab) {
        exploreTab.click();
    }
    
    // 设置选择器并触发变化
    setTimeout(() => {
        const selector = document.getElementById('kg-selector');
        if (selector) {
            selector.value = kgId;
            selector.dispatchEvent(new Event('change'));
        }
    }, 300);
}

// 添加编辑图谱函数
function editKnowledgeGraph(kgId) {
    showMessage('编辑功能开发中，当前重定向到查看模式', 'info');
    viewKnowledgeGraph(kgId);
}

// 添加切换到上传标签页的函数
function switchToUploadTab() {
    const uploadTab = document.getElementById('upload-tab');
    if (uploadTab) {
        uploadTab.click();
    }
}

// 更新全局暴露部分，添加缺失的函数
(function() {
    // 将关键函数暴露到全局作用域
    window.visualizeKG = visualizeKG;
    window.loadKGInfo = loadKGInfo;
    window.submitQuery = submitQuery;
    window.setupControlButtons = setupControlButtons;
    window.setupQueryHandlers = setupQueryHandlers;
    window.initializeKG = initializeKG;
    window.checkNeo4jConnection = checkNeo4jConnection;
    window.loadTempKGList = loadTempKGList;
    window.showDeleteConfirm = showDeleteConfirm;
    window.deleteKG = deleteKG;
    window.showMessage = showMessage;
    window.loadUserKgList = loadUserKgList;
    window.getStatusBadge = getStatusBadge;
    window.viewKnowledgeGraph = viewKnowledgeGraph;
    window.editKnowledgeGraph = editKnowledgeGraph;
    window.switchToUploadTab = switchToUploadTab;
})();