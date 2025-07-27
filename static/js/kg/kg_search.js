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
// 修复 renderVisualization 函数，移除不支持的事件监听：

function renderVisualization(data, kgId) {
    const graphContainer = document.getElementById('neo4j-graph');
    
    console.log('🎨 开始渲染可视化数据:', data);
    console.log('📊 数据统计:', {
        nodes: data?.nodes?.length || 0,
        edges: data?.edges?.length || 0,
        hasData: !!(data && data.nodes && data.nodes.length > 0)
    });
    
    // ✅ 添加详细的数据检查
    if (data && data.nodes) {
        console.log('🔍 检查前5个节点的数据结构:');
        data.nodes.slice(0, 5).forEach((node, index) => {
            console.log(`节点 ${index + 1}:`, {
                id: node.id,
                label: node.label,
                type: node.type,
                properties: node.properties,
                hasName: !!(node.properties && node.properties.name),
                hasSource: !!(node.properties && node.properties.source),
                nameValue: node.properties?.name,
                sourceValue: node.properties?.source,
                allProps: Object.keys(node.properties || {})
            });
        });
        
        // ✅ 检查哪些属性可以用作显示文字
        const availableProps = new Set();
        data.nodes.forEach(node => {
            if (node.properties) {
                Object.keys(node.properties).forEach(key => {
                    if (node.properties[key] && typeof node.properties[key] === 'string') {
                        availableProps.add(key);
                    }
                });
            }
        });
        console.log('🏷️ 可用的文字属性:', Array.from(availableProps));
    }
    
    if (data && data.edges) {
        console.log('🔍 检查前3个关系的数据结构:');
        data.edges.slice(0, 3).forEach((edge, index) => {
            console.log(`关系 ${index + 1}:`, {
                from: edge.from,
                to: edge.to,
                label: edge.label,
                type: edge.type,
                properties: edge.properties,
                hasType: !!edge.type,
                hasLabel: !!edge.label
            });
        });
    }
    
    if (!data || !data.nodes || data.nodes.length === 0) {
        console.log('⚠️ 无数据或空节点数组');
        graphContainer.innerHTML = `
            <div style="text-align:center;padding:50px;">
                <i class="fas fa-info-circle" style="font-size:48px;color:#6c757d;margin-bottom:15px;"></i>
                <h4>暂无数据</h4>
                <p class="text-muted">该知识图谱中暂无节点数据</p>
                ${kgId !== 'default' ? `
                    <button class="btn btn-outline-primary mt-2" onclick="switchToUploadTab()">
                        上传文档创建图谱
                    </button>
                ` : `
                    <p class="text-muted">请检查Neo4j数据库连接状态</p>
                    <button class="btn btn-outline-primary mt-2" onclick="checkNeo4jConnection()">
                        检查连接
                    </button>
                `}
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
                <p>NeoVis库未正确加载，请刷新页面重试</p>
                <button class="btn btn-primary mt-3" onclick="window.location.reload()">
                    <i class="fas fa-redo mr-1"></i> 刷新页面
                </button>
            </div>
        `;
        return;
    }
    
    console.log('✅ NeoVis库已加载，开始配置...');
    
    // ✅ 修复：简化Cypher查询
    let cypher;
    if (kgId === 'default') {
        cypher = `
            MATCH (n)-[r]->(m)
            WHERE NOT any(label IN labels(n) WHERE label STARTS WITH 'UserKG_') 
            AND NOT any(label IN labels(m) WHERE label STARTS WITH 'UserKG_')
            AND n.name IS NOT NULL AND m.name IS NOT NULL
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
    
    console.log('🔍 生成的Cypher查询:', cypher);
    
    // ✅ 修复 NeoVis 配置，确保文字正确显示：

    const config = {
        containerId: 'neo4j-graph',
        neo4j: {
            serverUrl: "bolt://localhost:7687",
            serverUser: "neo4j",
            serverPassword: "3080neo4j"
        },
        labels: {
            // ✅ 修复：针对不同节点类型配置不同的显示属性
            "Document": {
                "caption": "source",     // Document 节点显示 source 属性
                "size": 40,
                "font": {
                    "size": 18,
                    "color": "#000000",  // 黑色字体
                    "strokeWidth": 3,
                    "strokeColor": "#FFFFFF"
                }
            },
            "__Entity__": {
                "caption": "name",       // Entity 节点显示 name 属性
                "size": 35,
                "font": {
                    "size": 16,
                    "color": "#000000",
                    "strokeWidth": 3,
                    "strokeColor": "#FFFFFF"
                }
            },
            "材质": {
                "caption": "name",
                "size": 35,
                "font": {
                    "size": 16,
                    "color": "#000000",
                    "strokeWidth": 3,
                    "strokeColor": "#FFFFFF"
                }
            },
            "故障类型": {
                "caption": "name",
                "size": 35,
                "font": {
                    "size": 16,
                    "color": "#000000",
                    "strokeWidth": 3,
                    "strokeColor": "#FFFFFF"
                }
            },
            "设备": {
                "caption": "name",
                "size": 35,
                "font": {
                    "size": 16,
                    "color": "#000000",
                    "strokeWidth": 3,
                    "strokeColor": "#FFFFFF"
                }
            },
            "离合器": {
                "caption": "name",
                "size": 35,
                "font": {
                    "size": 16,
                    "color": "#000000",
                    "strokeWidth": 3,
                    "strokeColor": "#FFFFFF"
                }
            },
            // ✅ 默认配置 - 尝试多个可能的属性
            "*": {
                "caption": function(node) {
                    // ✅ 动态选择显示属性
                    if (node.properties) {
                        return node.properties.name || 
                               node.properties.source || 
                               node.properties.title || 
                               node.properties.id || 
                               node.id;
                    }
                    return node.id;
                },
                "size": 40,
                "font": {
                    "size": 18,
                    "color": "#000000",
                    "strokeWidth": 3,
                    "strokeColor": "#FFFFFF"
                }
            }
        },
        relationships: {
            "*": {
                "caption": function(edge) {
                    // ✅ 动态选择关系显示文字
                    return edge.type || edge.label || '';
                },
                "thickness": 3,
                "font": {
                    "size": 14,
                    "color": "#000000",
                    "strokeWidth": 2,
                    "strokeColor": "#FFFFFF"
                }
            }
        },
        visConfig: {
            nodes: {
                shape: 'circle',
                size: 40,
                font: { 
                    size: 18,
                    color: '#000000',
                    strokeWidth: 3,
                    strokeColor: '#ffffff',
                    align: 'center'
                },
                borderWidth: 3,
                color: {
                    background: '#97C2FC',
                    border: '#2B7CE9',
                    highlight: {
                        background: '#7BE141',
                        border: '#66CD00'
                    },
                    hover: {
                        background: '#E6F3FF',
                        border: '#4A90E2'
                    }
                },
                shadow: {
                    enabled: true,
                    color: 'rgba(0,0,0,0.3)',
                    size: 10,
                    x: 2,
                    y: 2
                }
            },
            edges: {
                arrows: { 
                    to: { 
                        enabled: true, 
                        scaleFactor: 1.2,
                        type: 'arrow'
                    } 
                },
                font: { 
                    size: 14, 
                    color: '#000000',
                    strokeWidth: 2,
                    strokeColor: '#ffffff',
                    align: 'middle'
                },
                width: 3,
                color: {
                    color: '#848484',
                    highlight: '#4A90E2',
                    hover: '#4A90E2'
                },
                smooth: {
                    enabled: true,
                    type: 'dynamic'
                },
                shadow: {
                    enabled: true,
                    color: 'rgba(0,0,0,0.3)',
                    size: 8,
                    x: 2,
                    y: 2
                }
            },
            physics: {
                enabled: true,
                stabilization: { 
                    enabled: true, 
                    iterations: 100
                },
                barnesHut: {
                    gravitationalConstant: -8000,
                    centralGravity: 0.3,
                    springLength: 150,
                    springConstant: 0.04,
                    damping: 0.09,
                    avoidOverlap: 1
                }
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
        console.log('🔧 初始化NeoVis实例...');
        
        // 清空容器
        graphContainer.innerHTML = '';
        
        const viz = new NeoVis.default(config);
        window.currentViz = viz;
        
        // ✅ 修复：只注册支持的事件
        viz.registerOnEvent("completed", (e) => {
            console.log("✅ 图谱渲染完成", e);
            console.log("📊 渲染统计:", {
                recordCount: e.recordCount,
                hasNetwork: !!viz.network
            });
            
            // 隐藏加载元素
            const loadingElement = document.getElementById('kg-loading');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
            
            if (viz.network) {
                window.currentViz.network = viz.network;
                
                // ✅ 检查网络中的节点和边
                const nodes = viz.network.body.data.nodes;
                const edges = viz.network.body.data.edges;
                console.log("🔍 网络数据检查:", {
                    nodeCount: nodes ? nodes.length : 0,
                    edgeCount: edges ? edges.length : 0,
                    nodeIds: nodes ? nodes.getIds().slice(0, 5) : [],
                    edgeIds: edges ? edges.getIds().slice(0, 5) : []
                });
                
                // 自动适应视图
                setTimeout(() => {
                    try {
                        viz.network.fit({
                            animation: {
                                duration: 1000,
                                easingFunction: 'easeInOutCubic'
                            }
                        });
                        console.log('✅ 视图自动适应完成');
                    } catch (fitError) {
                        console.warn('⚠️ 自动适应视图失败:', fitError);
                    }
                }, 1000);
            }
        });
        
        viz.registerOnEvent("error", (error) => {
            console.error("❌ 可视化错误:", error);
            
            // 隐藏加载元素
            const loadingElement = document.getElementById('kg-loading');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
            
            graphContainer.innerHTML = `
                <div style="text-align:center;padding:50px;color:#d32f2f;">
                    <h4>渲染失败</h4>
                    <p>可视化渲染出现错误: ${error.message || error.toString()}</p>
                    <details style="margin-top:10px;">
                        <summary>错误详情</summary>
                        <pre style="text-align:left;background:#f5f5f5;padding:10px;margin-top:10px;">${JSON.stringify(error, null, 2)}</pre>
                    </details>
                    <button class="btn btn-primary mt-3" onclick="visualizeKG('${kgId}')">
                        重试
                    </button>
                </div>
            `;
        });
        
        console.log('🔍 执行Cypher查询:', cypher);
        viz.renderWithCypher(cypher);
        
    } catch (e) {
        console.error("❌ 初始化可视化失败:", e);
        
        // 隐藏加载元素
        const loadingElement = document.getElementById('kg-loading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        graphContainer.innerHTML = `
            <div style="text-align:center;padding:50px;color:#d32f2f;">
                <h4>初始化失败</h4>
                <p>可视化组件初始化失败: ${e.message}</p>
                <details style="margin-top:10px;">
                    <summary>错误详情</summary>
                    <pre style="text-align:left;background:#f5f5f5;padding:10px;margin-top:10px;">${e.stack}</pre>
                </details>
                <button class="btn btn-primary mt-3" onclick="visualizeKG('${kgId}')">
                    重试
                </button>
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
    
    // ✅ 修复：立即开始加载，不要过多延迟
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
    
    // 初始化查询组件
    if (queryForm) {
        setupQueryHandlers();
    }
    
    // 添加标签页切换监听
    setupTabSwitchListeners();
    
    // ✅ 修复：初始化可视化组件和自动加载
    if (graphContainer) {
        setupControlButtons();
        
        // 立即开始加载默认图谱
        console.log("🔍 立即开始加载默认图谱...");
        loadKGInfo('default');
        visualizeKG('default');
    }
    
    console.log("✅ 知识图谱系统初始化完成");
}

// ✅ 修复：添加页面完全加载后的自动触发
function ensureKGLoaded() {
    // 确保在页面完全加载后触发
    if (document.readyState === 'complete') {
        initializeKG();
    } else {
        window.addEventListener('load', initializeKG);
    }
    
    // 同时也监听 DOMContentLoaded 作为备选
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initializeKG, 500); // 给页面一些时间完成渲染
        });
    }
}

// ✅ 修复：改进 loadKGInfo 函数，移除不必要的延迟
function loadKGInfo(kgId = 'default') {
    console.log(`🔍 加载知识图谱信息: ${kgId}`);
    
    // 更新统计信息的函数
    function updateStats(stats) {
        console.log('📊 更新统计信息:', stats);
        
        const nodeCountEl = document.getElementById('node-count');
        const relationCountEl = document.getElementById('relation-count');
        const entityTypesCountEl = document.getElementById('entity-types-count');
        const createdTimeEl = document.getElementById('kg-created-time');
        
        if (nodeCountEl) {
            nodeCountEl.textContent = stats.node_count || 0;
            console.log(`✅ 更新节点数: ${stats.node_count}`);
        }
        
        if (relationCountEl) {
            relationCountEl.textContent = stats.relation_count || 0;
            console.log(`✅ 更新关系数: ${stats.relation_count}`);
        }
        
        if (entityTypesCountEl) {
            const typesCount = (stats.node_types || []).length;
            entityTypesCountEl.textContent = typesCount;
            console.log(`✅ 更新实体类型数: ${typesCount}`);
        }
        
        if (createdTimeEl) {
            createdTimeEl.textContent = stats.created_time || '未知时间';
            console.log(`✅ 更新创建时间: ${stats.created_time}`);
        }
    }
    
    // ✅ 对于默认图谱获取实际统计数据
    if (kgId === 'default') {
        // 显示加载状态
        updateStats({
            node_count: '加载中...',
            relation_count: '加载中...',
            node_types: [],
            created_time: '系统预置'
        });
        
        // 获取统计数据
        fetch('/kg/visualization/default')
            .then(response => response.json())
            .then(data => {
                console.log('🎯 获取默认图谱数据用于统计:', data);
                
                if (data.success && data.data) {
                    // 从可视化数据中提取统计信息
                    const nodeTypes = new Set();
                    if (data.data.nodes) {
                        data.data.nodes.forEach(node => {
                            if (node.type) nodeTypes.add(node.type);
                        });
                    }
                    
                    const stats = {
                        node_count: data.data.stats?.nodeCount || (data.data.nodes ? data.data.nodes.length : 0),
                        relation_count: data.data.stats?.edgeCount || (data.data.edges ? data.data.edges.length : 0),
                        node_types: Array.from(nodeTypes),
                        created_time: '系统预置'
                    };
                    
                    updateStats(stats);
                    console.log(`✅ 默认图谱统计更新完成: ${stats.node_count}节点, ${stats.relation_count}关系, ${stats.node_types.length}类型`);
                } else {
                    console.warn('⚠️ 获取默认图谱数据失败:', data.message);
                    updateStats({
                        node_count: 0,
                        relation_count: 0,
                        node_types: [],
                        created_time: '系统预置'
                    });
                }
            })
            .catch(error => {
                console.error('❌ 获取默认图谱数据请求失败:', error);
                updateStats({
                    node_count: 0,
                    relation_count: 0,
                    node_types: [],
                    created_time: '系统预置'
                });
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
                        node_count: 0,
                        relation_count: 0,
                        node_types: [],
                        created_time: '加载失败'
                    });
                }
            })
            .catch(error => {
                console.error('获取子图信息请求失败:', error);
                updateStats({
                    node_count: 0,
                    relation_count: 0,
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

// ✅ 在这里添加三个调试函数
function debugStatsUpdate() {
    console.log('🔍 调试统计信息更新...');
    
    // 检查DOM元素
    const elements = {
        nodeCount: document.getElementById('node-count'),
        relationCount: document.getElementById('relation-count'),
        entityTypesCount: document.getElementById('entity-types-count'),
        createdTime: document.getElementById('kg-created-time')
    };
    
    console.log('📍 DOM元素检查:', elements);
    
    // 手动更新测试
    if (elements.nodeCount) {
        elements.nodeCount.textContent = '13';
        console.log('✅ 手动设置节点数为13');
    }
    
    if (elements.relationCount) {
        elements.relationCount.textContent = '12';
        console.log('✅ 手动设置关系数为12');
    }
    
    if (elements.entityTypesCount) {
        elements.entityTypesCount.textContent = '5';
        console.log('✅ 手动设置实体类型数为5');
    }
    
    return elements;
}

function debugVisualization() {
    console.log('🔍 调试可视化渲染...');
    
    // 检查容器
    const container = document.getElementById('neo4j-graph');
    console.log('📦 可视化容器:', container);
    
    // 检查NeoVis
    console.log('🔧 NeoVis可用性:', typeof NeoVis !== 'undefined');
    
    // 检查当前可视化实例
    console.log('🎯 当前可视化实例:', window.currentViz);
    
    // 重新触发可视化
    console.log('🚀 重新触发可视化...');
    visualizeKG('default');
}

function debugNeo4jData() {
    console.log("🔍 开始调试Neo4j数据...");
    
    // 检查连接
    fetch('/kg/check_connection')
        .then(response => response.json())
        .then(data => {
            console.log("🔗 Neo4j连接状态:", data);
            
            if (data.success) {
                // 检查默认图谱数据
                return fetch('/kg/visualization/default');
            } else {
                throw new Error(`Neo4j连接失败: ${data.message}`);
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log("📊 默认图谱数据:", data);
            
            if (data.success && data.data) {
                console.log(`✅ 默认图谱包含 ${data.data.nodes?.length || 0} 个节点和 ${data.data.edges?.length || 0} 个关系`);
                
                if (data.data.nodes && data.data.nodes.length > 0) {
                    console.log("📝 前5个节点:", data.data.nodes.slice(0, 5));
                }
                
                if (data.data.edges && data.data.edges.length > 0) {
                    console.log("🔗 前3个关系:", data.data.edges.slice(0, 3));
                }
            } else {
                console.log("⚠️ 默认图谱无数据或获取失败");
            }
        })
        .catch(error => {
            console.error("❌ 调试失败:", error);
        });
}

// ✅ 在这里添加所有缺失的函数
function checkNeo4jConnection() {
    console.log("🔍 检查 Neo4j 连接状态...");
    
    const statusIndicator = document.getElementById('connection-status');
    const statusText = document.getElementById('connection-text');
    
    // 更新状态为检查中
    if (statusIndicator) {
        statusIndicator.className = 'status-indicator status-checking';
    }
    if (statusText) {
        statusText.textContent = '检查连接中...';
    }
    
    fetch('/kg/check_connection')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log("✅ Neo4j 连接正常");
                if (statusIndicator) {
                    statusIndicator.className = 'status-indicator status-connected';
                }
                if (statusText) {
                    statusText.textContent = 'Neo4j 已连接';
                }
                showMessage('Neo4j 连接正常', 'success');
            } else {
                console.error("❌ Neo4j 连接失败:", data.message);
                if (statusIndicator) {
                    statusIndicator.className = 'status-indicator status-disconnected';
                }
                if (statusText) {
                    statusText.textContent = 'Neo4j 连接失败';
                }
                showMessage(`Neo4j 连接失败: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error("❌ 检查 Neo4j 连接请求失败:", error);
            if (statusIndicator) {
                statusIndicator.className = 'status-indicator status-disconnected';
            }
            if (statusText) {
                statusText.textContent = '连接检查失败';
            }
            showMessage('无法检查 Neo4j 连接状态', 'error');
        });
}

function loadTempKGList() {
    console.log("📋 加载临时知识图谱列表...");
    
    const listContainer = document.getElementById('temp-kg-list');
    if (!listContainer) {
        console.log("找不到临时图谱列表容器");
        return;
    }
    
    // 显示加载状态
    listContainer.innerHTML = `
        <div class="text-center p-4">
            <div class="spinner-border text-primary" role="status">
                <span class="sr-only">加载中...</span>
            </div>
            <p class="mt-2">正在加载知识图谱列表...</p>
        </div>
    `;
    
    fetch('/kg/list')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayTempKGList(data.kgs);
            } else {
                listContainer.innerHTML = `
                    <div class="alert alert-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        加载失败: ${data.message}
                    </div>
                `;
            }
        })
        .catch(error => {
            console.error('加载知识图谱列表失败:', error);
            listContainer.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-times-circle"></i>
                    网络错误，无法加载知识图谱列表
                </div>
            `;
        });
}

function displayTempKGList(kgs) {
    const listContainer = document.getElementById('temp-kg-list');
    if (!listContainer) return;
    
    if (!kgs || kgs.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center p-4">
                <i class="fas fa-folder-open fa-3x text-muted mb-3"></i>
                <h5>暂无知识图谱</h5>
                <p class="text-muted">您还没有创建任何知识图谱</p>
                <button class="btn btn-primary mt-2" onclick="switchToUploadTab()">
                    <i class="fas fa-upload mr-1"></i> 上传文档创建图谱
                </button>
            </div>
        `;
        return;
    }
    
    let html = '<div class="kg-list">';
    
    kgs.forEach(kg => {
        html += `
            <div class="card mb-3">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-md-8">
                            <h5 class="card-title mb-1">
                                <i class="fas fa-project-diagram text-primary mr-2"></i>
                                ${kg.name}
                            </h5>
                            <div class="kg-stats">
                                <span class="badge badge-info mr-2">
                                    <i class="fas fa-circle"></i> ${kg.nodeCount || 0} 节点
                                </span>
                                <span class="badge badge-success mr-2">
                                    <i class="fas fa-arrow-right"></i> ${kg.relationCount || 0} 关系
                                </span>
                                ${getStatusBadge(kg.status)}
                            </div>
                            <small class="text-muted">
                                <i class="fas fa-clock mr-1"></i>
                                创建时间: ${formatDateTime(kg.createdAt)}
                            </small>
                        </div>
                        <div class="col-md-4 text-right">
                            <div class="btn-group" role="group">
                                <button class="btn btn-outline-primary btn-sm" 
                                        onclick="viewKnowledgeGraph('${kg.kgId}')"
                                        title="查看图谱">
                                    <i class="fas fa-eye"></i> 查看
                                </button>
                                <button class="btn btn-outline-secondary btn-sm" 
                                        onclick="editKnowledgeGraph('${kg.kgId}')"
                                        title="编辑图谱">
                                    <i class="fas fa-edit"></i> 编辑
                                </button>
                                <button class="btn btn-outline-danger btn-sm" 
                                        onclick="showDeleteConfirm('${kg.kgId}', '${kg.name}')"
                                        title="删除图谱">
                                    <i class="fas fa-trash"></i> 删除
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    listContainer.innerHTML = html;
}

function showDeleteConfirm(kgId, kgName) {
    if (confirm(`确定要删除知识图谱 "${kgName}" 吗？\n\n此操作不可撤销，将永久删除所有相关数据。`)) {
        deleteKG(kgId);
    }
}

function deleteKG(kgId) {
    console.log(`🗑️ 删除知识图谱: ${kgId}`);
    
    showMessage('正在删除知识图谱...', 'info');
    
    fetch(`/kg/delete/${kgId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('知识图谱删除成功', 'success');
            // 重新加载列表
            loadTempKGList();
            // 重新加载选择器
            loadUserKgList();
        } else {
            showMessage(`删除失败: ${data.message}`, 'error');
        }
    })
    .catch(error => {
        console.error('删除知识图谱失败:', error);
        showMessage('删除操作失败，请重试', 'error');
    });
}

function getStatusBadge(status) {
    switch(status) {
        case 'active':
            return '<span class="badge badge-success">活跃</span>';
        case 'processing':
            return '<span class="badge badge-warning">处理中</span>';
        case 'failed':
            return '<span class="badge badge-danger">失败</span>';
        default:
            return '<span class="badge badge-secondary">未知</span>';
    }
}

function viewKnowledgeGraph(kgId) {
    console.log(`查看知识图谱: ${kgId}`);
    // 切换到探索标签页
    const exploreTab = document.getElementById('explore-tab');
    if (exploreTab) {
        exploreTab.click();
    }
    
    // 设置选择器
    const kgSelector = document.getElementById('kg-selector');
    if (kgSelector) {
        kgSelector.value = kgId;
    }
    
    // 加载图谱
    setTimeout(() => {
        visualizeKG(kgId);
        loadKGInfo(kgId);
    }, 500);
}

function editKnowledgeGraph(kgId) {
    console.log(`编辑知识图谱: ${kgId}`);
    showMessage('编辑功能暂未实现', 'info');
}

function switchToUploadTab() {
    const uploadTab = document.getElementById('upload-tab');
    if (uploadTab) {
        uploadTab.click();
    }
}

// ✅ 在这里添加时间格式化函数
function formatDateTime(dateString) {
    if (!dateString) return '未知';
    
    try {
        const date = new Date(dateString);
        
        // 检查日期是否有效
        if (isNaN(date.getTime())) {
            return dateString; // 如果无法解析，返回原字符串
        }
        
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        console.warn('日期格式化失败:', e);
        return dateString || '未知时间';
    }
}

function formatRelativeTime(dateString) {
    if (!dateString) return '未知';
    
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        
        // 转换为不同的时间单位
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        const diffMonths = Math.floor(diffDays / 30);
        const diffYears = Math.floor(diffDays / 365);
        
        if (diffSeconds < 60) {
            return '刚刚';
        } else if (diffMinutes < 60) {
            return `${diffMinutes}分钟前`;
        } else if (diffHours < 24) {
            return `${diffHours}小时前`;
        } else if (diffDays < 30) {
            return `${diffDays}天前`;
        } else if (diffMonths < 12) {
            return `${diffMonths}个月前`;
        } else {
            return `${diffYears}年前`;
        }
    } catch (e) {
        console.warn('相对时间格式化失败:', e);
        return formatDateTime(dateString);
    }
}

function isValidDate(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime());
}

// 备用简化配置 - 如果动态函数不支持：

const config = {
    containerId: 'neo4j-graph',
    neo4j: {
        serverUrl: "bolt://localhost:7687",
        serverUser: "neo4j",
        serverPassword: "3080neo4j"
    },
    labels: {
        "Document": {
            "caption": "source",
            "size": 40
        },
        "__Entity__": {
            "caption": "name", 
            "size": 35
        },
        "材质": {
            "caption": "name",
            "size": 35
        },
        "故障类型": {
            "caption": "name",
            "size": 35
        },
        "设备": {
            "caption": "name", 
            "size": 35
        },
        "离合器": {
            "caption": "name",
            "size": 35
        },
        "*": {
            "caption": "name",  // 先尝试 name
            "size": 40
        }
    },
    relationships: {
        "*": {
            "caption": true,  // 显示关系类型
            "thickness": 3
        }
    },
    visConfig: {
        nodes: {
            shape: 'circle',
            size: 40,
            font: { 
                size: 20,           // ✅ 更大的字体
                color: '#000000',   // ✅ 黑色字体
                strokeWidth: 4,     // ✅ 更粗的描边
                strokeColor: '#ffffff',
                align: 'center'
            },
            borderWidth: 3,
            color: {
                background: '#97C2FC',
                border: '#2B7CE9'
            }
        },
        edges: {
            arrows: { to: { enabled: true } },
            font: { 
                size: 16,           // ✅ 更大的关系文字
                color: '#000000',
                strokeWidth: 3,
                strokeColor: '#ffffff'
            },
            width: 3
        },
        physics: {
            enabled: true
        }
    }
};

// 修改全局暴露部分，确保包含所有必要的函数：
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
    window.displayTempKGList = displayTempKGList;
    window.showDeleteConfirm = showDeleteConfirm;
    window.deleteKG = deleteKG;
    window.showMessage = showMessage;
    window.loadUserKgList = loadUserKgList;
    window.getStatusBadge = getStatusBadge;
    window.viewKnowledgeGraph = viewKnowledgeGraph;
    window.editKnowledgeGraph = editKnowledgeGraph;
    window.switchToUploadTab = switchToUploadTab;
    window.formatDateTime = formatDateTime;              // ✅ 现在函数已定义
    window.formatRelativeTime = formatRelativeTime;      // ✅ 新增相对时间格式化
    window.isValidDate = isValidDate;                    // ✅ 新增日期验证
    window.debugStatsUpdate = debugStatsUpdate;
    window.debugVisualization = debugVisualization;
    window.debugNeo4jData = debugNeo4jData;
    window.ensureKGLoaded = ensureKGLoaded;
    
    // ✅ 自动触发加载
    console.log("🚀 自动触发知识图谱初始化...");
    ensureKGLoaded();
})();