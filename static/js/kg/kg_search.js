// 在 kg_search.js 开头添加冲突检测：

function checkLibraryConflicts() {
    console.log('🔍 检查库冲突...');
    
    // 检查可能冲突的库
    const conflicts = {
        'markdown-it': typeof markdownit !== 'undefined',
        'NeoVis': typeof NeoVis !== 'undefined',
        'vis': typeof vis !== 'undefined'
    };
    
    console.log('📚 已加载的库:', conflicts);
    
    // 检查字体相关的 CSS
    const computedStyle = window.getComputedStyle(document.body);
    console.log('🎨 页面字体设置:', {
        fontFamily: computedStyle.fontFamily,
        fontSize: computedStyle.fontSize
    });
    
    // 检查是否有 CSS 重写了字体
    const graphContainer = document.getElementById('neo4j-graph');
    if (graphContainer) {
        const graphStyle = window.getComputedStyle(graphContainer);
        console.log('📊 图谱容器字体设置:', {
            fontFamily: graphStyle.fontFamily,
            fontSize: graphStyle.fontSize
        });
    }
}

// 在页面加载时调用
document.addEventListener('DOMContentLoaded', checkLibraryConflicts);

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
            // ✅ 添加原始数据检查
            console.log('🔍 获取到的原始可视化数据:', data);
            
            if (data.success && data.data) {
                console.log('📊 原始节点数据示例:', data.data.nodes?.slice(0, 3));
                
                // 检查节点ID类型和属性
                if (data.data.nodes && data.data.nodes.length > 0) {
                    const nodeTypes = {
                        stringIds: data.data.nodes.filter(n => typeof n.id === 'string').length,
                        numberIds: data.data.nodes.filter(n => typeof n.id === 'number').length,
                        withName: data.data.nodes.filter(n => n.properties && n.properties.name).length,
                        total: data.data.nodes.length
                    };
                    console.log('📝 节点ID和属性统计:', nodeTypes);
                }
            }
            
            // 原有代码...
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
// 修复 renderVisualization 函数，使用您可行代码的配置模式：

function renderVisualization(data, kgId) {
    const graphContainer = document.getElementById('neo4j-graph');
    
    // ✅ 添加这一行 - 在函数顶部定义 nodeNameMap
    const nodeNameMap = createNodeNameMap(data);
    
    // ✅ 添加辅助函数创建映射表
    function createNodeNameMap(data) {
        const map = {};
        
        if (data && data.nodes) {
            console.log('📊 创建节点名称映射表，节点数:', data.nodes.length);
            
            data.nodes.forEach(node => {
                // 创建多种可能的 ID 形式的映射
                const possibleIds = [
                    node.id,                 // 原始 ID (可能是字符串如 "石墨")
                    String(node.id),         // 字符串形式 
                    parseInt(node.id)        // 数字形式 (如果可转换)
                ];
                
                // 获取节点名称 (优先顺序: properties.name > id本身)
                let nodeName = null;
                if (node.properties && node.properties.name) {
                    nodeName = node.properties.name;
                } else if (typeof node.id === 'string' && isNaN(parseInt(node.id))) {
                    nodeName = node.id;
                }
                
                // 只有当找到了有效名称时才创建映射
                if (nodeName) {
                    // 为所有可能的 ID 形式创建映射
                    possibleIds.forEach(id => {
                        if (id !== undefined && id !== null) {
                            map[id] = nodeName;
                            console.log(`📌 映射创建: ${id} -> "${nodeName}"`);
                        }
                    });
                }
            });
            
            console.log('📊 节点映射表创建完成:', map);
        } else {
            console.warn('⚠️ 无法创建节点映射表：没有可用的原始节点数据');
        }
        
        return map;
    }
    
    // ✅ 强制重置图谱容器的字体设置
    console.log('🎨 重置图谱容器字体设置...');
    const fontResetStyle = document.createElement('style');
    fontResetStyle.id = 'kg-font-reset';
    fontResetStyle.textContent = `
        /* 重置知识图谱容器的字体 */
        #neo4j-graph {
            font-family: Arial, sans-serif !important;
            font-size: 14px !important;
        }
        
        #neo4j-graph * {
            font-family: Arial, sans-serif !important;
        }
        
        #neo4j-graph canvas {
            font-family: Arial, sans-serif !important;
        }
        
        /* 重置 vis.js 相关元素 */
        .vis-network {
            font-family: Arial, sans-serif !important;
        }
        
        .vis-text {
            font-family: Arial, sans-serif !important;
            font-size: 14px !important;
            fill: #000000 !important;
        }
        
        /* 确保 SVG 文字正确显示 */
        svg text {
            font-family: Arial, sans-serif !important;
            font-size: 14px !important;
            fill: #000000 !important;
        }
    `;
    
    // 移除旧的样式，添加新的
    const oldStyle = document.getElementById('kg-font-reset');
    if (oldStyle) {
        oldStyle.remove();
    }
    document.head.appendChild(fontResetStyle);
    
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
    
    // 显示容器
    graphContainer.style.display = 'block';
    
    // ✅ 生成 Cypher 查询
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
    
    // ✅ 修复：添加通配符配置
    const labelsConfig = {
        "Document": { 
            caption: "source",
            size: 50,
            color: "#C990C0"
        },
        "__Entity__": { 
            caption: "name",
            size: 45,
            color: "#F79767"
        },
        "材质": { 
            caption: "name",
            size: 45,
            color: "#57C7E3"
        },
        "故障类型": { 
            caption: "name",
            size: 45,
            color: "#F16667"
        },
        "设备": { 
            caption: "name",
            size: 45,
            color: "#D9C8AE"
        },
        "离合器": { 
            caption: "name",
            size: 45,
            color: "#8DCC93"
        },
        // ✅ 关键：添加通配符配置
        "*": { 
            caption: "name",
            size: 45,
            color: "#97C2FC"
        }
    };
    
    console.log('🏷️ 正确的 NeoVis 标签配置:', labelsConfig);
    
    // ✅ 更新现有的关系配置
    const relationshipsConfig = {
        "*": { 
            caption: true,  // ✅ 显示关系类型作为标签
            thickness: 3,
            color: "#848484",   // 添加默认颜色
            font: {            // 明确设置字体样式
                size: 14,
                color: '#000000',
                face: 'Arial',
                background: 'white',  // 添加背景色提高可见性
                strokeWidth: 2,
                strokeColor: '#ffffff',
                align: 'middle'       // 居中对齐
            }
        }
    };
    
    console.log('🔗 关系配置:', relationshipsConfig);
    
    // ✅ NeoVis 配置
    const config = {
        containerId: "neo4j-graph",
        neo4j: {
            serverUrl: "bolt://localhost:7687",
            serverUser: "neo4j",
            serverPassword: "3080neo4j"
        },
        labels: labelsConfig,
        relationships: relationshipsConfig,
        initialCypher: cypher,
        visConfig: {
            nodes: {
                shape: 'circle',
                size: 50,
                font: { 
                    size: 18,
                    color: '#000000',
                    strokeWidth: 3,
                    strokeColor: '#ffffff',
                    face: 'Arial'
                },
                borderWidth: 3
            },
            edges: {
                arrows: { 
                    to: { enabled: true } 
                },
                font: { 
                    size: 14,
                    color: '#000000',
                    strokeWidth: 2,
                    strokeColor: '#ffffff',
                    face: 'Arial',
                    background: 'white',  // 添加白色背景
                    align: 'middle'       // 居中对齐
                },
                width: 3,
                smooth: {      // 平滑曲线，给标签留出空间
                    enabled: true,
                    type: 'curvedCW',
                    roundness: 0.2
                },
                length: 200    // 适当增加边的长度，给标签腾出空间
            },
            physics: {
                enabled: true,
                stabilization: { 
                    enabled: true, 
                    iterations: 100
                }
            }
        }
    };
    
    try {
        console.log('🔧 初始化NeoVis实例...');
        console.log('📋 完整配置:', config);
        
        // 清空容器
        graphContainer.innerHTML = '';
        
        const viz = new NeoVis.default(config);
        window.currentViz = viz;
        
        // ✅ 事件处理
        viz.registerOnEvent("completed", (e) => {
            console.log("✅ 图谱渲染完成", e);
            
            // 隐藏加载元素
            const loadingElement = document.getElementById('kg-loading');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
            
            if (viz.network) {
                window.currentViz.network = viz.network;
                
                // ✅ 关键修复：手动检查并添加节点标签
                const network = viz.network;
                const nodes = network.body.data.nodes;
                
                // 获取所有节点数据
                const nodeData = nodes.get();
                console.log('📊 渲染完成的节点数据:', nodeData.slice(0, 3));
                
                // ✅ 修复：检查节点ID与原始数据ID的对应关系
                console.log('🔍 检查节点ID对应关系:');
                nodeData.slice(0, 5).forEach(node => {
                    console.log(`节点ID: ${node.id}, 原始ID映射: ${nodeNameMap[node.id] || '未找到'}`);
                });
                
                // 检查是否有缺少标签的节点
                const missingLabels = nodeData.filter(node => !node.label || node.label.trim() === '');
                console.log(`🏷️ 检测到 ${missingLabels.length} 个节点缺少标签`);
                
                if (missingLabels.length > 0) {
                    console.log('🔧 开始手动添加节点标签...');
                    
                    // 为每个缺少标签的节点添加标签
                    const updatedNodes = nodeData.map((node, index) => {
                        if (!node.label || node.label.trim() === '') {
                            // 尝试从不同属性获取标签文字
                            let newLabel;
                            
                            // ✅ 新方法：始终首先尝试索引位置匹配原始数据
                            if (index < data.nodes.length) {
                                const originalNode = data.nodes[index];
                                if (originalNode.properties && originalNode.properties.name) {
                                    newLabel = originalNode.properties.name;
                                    console.log(`为节点 ${node.id} 添加标签 (来源:索引匹配): ${newLabel}`);
                                }
                            }
                            // 其他匹配方法作为后备
                            else if (node.properties && node.properties.name) {
                                newLabel = node.properties.name;
                                console.log(`为节点 ${node.id} 添加标签 (来源:properties.name): ${newLabel}`);
                            }
                            else if (nodeNameMap[node.id]) {
                                newLabel = nodeNameMap[node.id];
                                console.log(`为节点 ${node.id} 添加标签 (来源:节点映射): ${newLabel}`);
                            }
                            else {
                                // 在原始节点数据中查找具有相同属性的节点
                                const matchNode = data.nodes.find(originalNode => {
                                    // 比较所有可能的属性
                                    if (node.properties && originalNode.properties) {
                                        // 检查是否有相同的属性值
                                        return Object.entries(node.properties).some(([key, value]) => 
                                            originalNode.properties[key] === value && value);
                                    }
                                    return false;
                                });
                                
                                if (matchNode) {
                                    newLabel = matchNode.properties.name;
                                    console.log(`为节点 ${node.id} 添加标签 (来源:属性匹配): ${newLabel}`);
                                } else {
                                    // ✅ 最后的后备方案：再次尝试找最接近的索引
                                    const estimatedIndex = Math.min(parseInt(node.id) - 1, data.nodes.length - 1);
                                    if (estimatedIndex >= 0 && 
                                        data.nodes[estimatedIndex] && 
                                        data.nodes[estimatedIndex].properties && 
                                        data.nodes[estimatedIndex].properties.name) {
                                        newLabel = data.nodes[estimatedIndex].properties.name;
                                        console.log(`为节点 ${node.id} 添加标签 (来源:估计索引): ${newLabel}`);
                                    } else {
                                        newLabel = `节点${node.id}`;
                                        console.log(`为节点 ${node.id} 添加标签 (来源:生成): ${newLabel}`);
                                    }
                                }
                            }
                            
                            // 创建更新对象
                            return {
                                ...node,
                                label: newLabel,
                                font: {
                                    size: 18,
                                    color: '#000000',
                                    face: 'Arial',
                                    strokeWidth: 3,
                                    strokeColor: '#ffffff'
                                }
                            };
                        }
                        return node;
                    });
                    
                    // 更新节点数据
                    try {
                        nodes.update(updatedNodes);
                        console.log('✅ 节点标签手动添加完成');
                        
                        // 重新绘制
                        setTimeout(() => {
                            viz.network.redraw();
                            console.log('✅ 网络重新绘制完成');
                        }, 200);
                    } catch (updateError) {
                        console.error('❌ 更新节点标签失败:', updateError);
                    }
                }
                
                // 修复关系标签
                setTimeout(() => {
                    if (viz.network) {
                        const network = viz.network;
                        const edges = network.body.data.edges;
                        const edgeData = edges.get();
                        
                        console.log('🔍 检查边数据:', edgeData.slice(0, 3));
                        
                        // 检查是否有缺少标签的边
                        const missingEdgeLabels = edgeData.filter(edge => !edge.label || edge.label.trim() === '');
                        console.log(`🏷️ 检测到 ${missingEdgeLabels.length} 个关系缺少标签`);
                        
                        if (missingEdgeLabels.length > 0) {
                            console.log('🔧 开始手动添加关系标签...');
                            
                            // 打印详细的诊断信息
                            console.log('原始边数据:', data.edges);
                            console.log('渲染后边数据:', edgeData);
                            
                            // ✅ 更可靠的方法：使用索引位置匹配
                            // 如果边数量相同，直接按索引位置匹配
                            if (data.edges.length === edgeData.length) {
                                console.log('✅ 边数量匹配，使用索引位置映射');
                                
                                const updatedEdges = edgeData.map((edge, index) => {
                                    const originalEdge = data.edges[index];
                                    let newLabel;
                                    
                                    if (originalEdge) {
                                        // 按优先级获取标签：type > label > relationship > '关系'
                                        if (originalEdge.type) {
                                            newLabel = originalEdge.type;
                                        } else if (originalEdge.label) {
                                            newLabel = originalEdge.label;
                                        } else if (originalEdge.relationship) {
                                            newLabel = originalEdge.relationship;
                                        } else {
                                            newLabel = '关系';
                                        }
                                        
                                        console.log(`为关系 ${edge.from} -> ${edge.to} 设置标签 (索引匹配): ${newLabel}`);
                                    } else {
                                        newLabel = '关系';
                                        console.log(`为关系 ${edge.from} -> ${edge.to} 设置默认标签: ${newLabel}`);
                                    }
                                    
                                    // 创建更新对象
                                    return {
                                        ...edge,
                                        label: newLabel,
                                        font: {
                                            size: 14,
                                            color: '#000000',
                                            face: 'Arial',
                                            strokeWidth: 2,
                                            strokeColor: '#ffffff',
                                            background: 'white',
                                            align: 'middle'
                                        }
                                    };
                                });
                                
                                // 更新边数据
                                try {
                                    edges.update(updatedEdges);
                                    console.log('✅ 关系标签手动添加完成');
                                    
                                    // 重新绘制
                                    setTimeout(() => {
                                        viz.network.redraw();
                                        console.log('✅ 网络重新绘制完成');
                                    }, 200);
                                } catch (updateError) {
                                    console.error('❌ 更新关系标签失败:', updateError);
                                }
                            } else {
                                // 边数量不匹配时，尝试更复杂的匹配方法
                                console.log('⚠️ 边数量不匹配，尝试通过端点节点匹配');
                                
                                // 首先构建节点ID映射
                                const nodeIdMap = {};
                                
                                if (data.nodes && data.nodes.length > 0) {
                                    // 获取渲染后的节点数据
                                    const renderedNodes = network.body.data.nodes.get();
                                    
                                    // 如果节点数量相同，假设它们按同样顺序
                                    if (data.nodes.length === renderedNodes.length) {
                                        data.nodes.forEach((originalNode, index) => {
                                            const renderedNode = renderedNodes[index];
                                            if (originalNode && renderedNode) {
                                                nodeIdMap[originalNode.id] = renderedNode.id;
                                        }
                                        });
                                        
                                        console.log('📊 创建节点ID映射:', nodeIdMap);
                                    }
                                }
                                
                                // 使用节点ID映射来匹配边
                                const updatedEdges = edgeData.map(edge => {
                                    let bestMatch = null;
                                    
                                    // 遍历原始边数据尝试找到匹配
                                    for (const originalEdge of data.edges) {
                                        // 检查是否有匹配的端点
                                        const mappedFrom = nodeIdMap[originalEdge.from];
                                        const mappedTo = nodeIdMap[originalEdge.to];
                                        
                                        if ((mappedFrom && mappedFrom === edge.from) && 
                                            (mappedTo && mappedTo === edge.to)) {
                                            bestMatch = originalEdge;
                                            break;
                                        }
                                    }
                                    
                                    let newLabel;
                                    if (bestMatch) {
                                        if (bestMatch.type) {
                                            newLabel = bestMatch.type;
                                        } else if (bestMatch.label) {
                                            newLabel = bestMatch.label;
                                        } else if (bestMatch.relationship) {
                                            newLabel = bestMatch.relationship;
                                        } else {
                                            newLabel = '关系';
                                        }
                                        
                                        console.log(`为关系 ${edge.from} -> ${edge.to} 设置标签 (端点匹配): ${newLabel}`);
                                    } else {
                                        newLabel = '关系';
                                        console.log(`为关系 ${edge.from} -> ${edge.to} 无法找到匹配，设置默认标签`);
                                    }
                                    
                                    return {
                                        ...edge,
                                        label: newLabel,
                                        font: {
                                            size: 14,
                                            color: '#000000',
                                            face: 'Arial',
                                            strokeWidth: 2,
                                            strokeColor: '#ffffff',
                                            background: 'white',
                                            align: 'middle'
                                        }
                                    };
                                });
                                
                                // 更新边数据
                                try {
                                    edges.update(updatedEdges);
                                    console.log('✅ 关系标签手动添加完成');
                                    
                                    // 重新绘制
                                    setTimeout(() => {
                                        viz.network.redraw();
                                        console.log('✅ 网络重新绘制完成');
                                    }, 200);
                                } catch (updateError) {
                                    console.error('❌ 更新关系标签失败:', updateError);
                                }
                            }
                        }
                    }
                }, 1000);
            }
        });
        
        viz.registerOnEvent("error", (error) => {
            console.error("❌ 可视化错误:", error);
            
            const loadingElement = document.getElementById('kg-loading');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
            
            graphContainer.innerHTML = `
                <div style="text-align:center;padding:50px;color:#d32f2f;">
                    <h4>渲染失败</h4>
                    <p>可视化渲染出现错误: ${error.message || error.toString()}</p>
                    <button class="btn btn-primary mt-3" onclick="visualizeKG('${kgId}')">
                        重试
                    </button>
                </div>
            `;
        });
        
        // ✅ 开始渲染
        console.log('🚀 开始渲染...');
        viz.render();
        
    } catch (e) {
        console.error("❌ 初始化可视化失败:", e);
        
        const loadingElement = document.getElementById('kg-loading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        graphContainer.innerHTML = `
            <div style="text-align:center;padding:50px;color:#d32f2f;">
                <h4>初始化失败</h4>
                <p>可视化组件初始化失败: ${e.message}</p>
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
        // ✅ 修复：使用正确的 API 跨径
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
    window.simpleNodeLabelFix = simpleNodeLabelFix;
    
    // ✅ 自动触发加载
    console.log("🚀 自动触发知识图谱初始化...");
    ensureKGLoaded();
})();

// 在控制台运行这个详细调试函数：
function debugNeoVisText() {
    console.log('🔍 详细调试 NeoVis 文字显示...');
    
    // 1. 检查容器
    const container = document.getElementById('neo4j-graph');
    console.log('📦 容器:', container);
    
    // 2. 检查当前配置
    if (window.currentViz) {
        console.log('🎯 当前 NeoVis 实例:', window.currentViz);
        
        // 3. 检查网络对象
        if (window.currentViz.network) {
            const network = window.currentViz.network;
            console.log('🕸️ Vis Network 对象:', network);
            
            // 4. 获取节点数据
            const nodes = network.getPositions();
            console.log('📍 节点位置:', nodes);
            
            // 5. 检查 DOM 中的文字元素
            const textElements = container.querySelectorAll('text, .vis-text, span');
            console.log(`📝 找到 ${textElements.length} 个可能的文字元素`);
            
            textElements.forEach((el, i) => {
                if (i < 10) {
                    const style = getComputedStyle(el);
                    console.log(`文字元素 ${i+1}:`, {
                        tag: el.tagName,
                        content: el.textContent,
                        visible: style.display !== 'none' && style.visibility !== 'hidden',
                        fontSize: style.fontSize,
                        color: style.color,
                        fontFamily: style.fontFamily,
                        opacity: style.opacity
                    });
                }
            });
        }
    }
    
    // 6. 检查数据结构
    fetch('/kg/visualization/default')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data.nodes) {
                console.log('📊 前3个节点的数据结构:');
                data.data.nodes.slice(0, 3).forEach((node, i) => {
                    console.log(`节点 ${i+1}:`, {
                        id: node.id,
                        label: node.label,
                        type: node.type,
                        properties: node.properties,
                        hasNameProp: !!(node.properties && node.properties.name)
                    });
                });
            }
        });
}

// 运行调试
debugNeoVisText();

// 创建一个确保有标签的新测试：
function testWithExplicitLabels() {
    const container = document.getElementById('neo4j-graph');
    container.innerHTML = '';
    
    // 创建明确包含 label 的测试数据
    const nodes = new vis.DataSet([
        {
            id: 1, 
            label: '铜材质',        // ✅ 明确设置 label
            color: '#97C2FC',
            size: 50,
            font: { size: 20, color: '#000000' }
        },
        {
            id: 2, 
            label: '橡胶材质',      // ✅ 明确设置 label
            color: '#F79767',
            size: 50,
            font: { size: 20, color: '#000000' }
        },
        {
            id: 3, 
            label: '离合器设备',    // ✅ 明确设置 label
            color: '#8DCC93',
            size: 50,
            font: { size: 20, color: '#000000' }
        }
    ]);
    
    const edges = new vis.DataSet([
        {
            from: 1, 
            to: 3, 
            label: '材质组成',      // ✅ 关系也有标签
            font: { size: 16, color: '#000000' }
        },
        {
            from: 2, 
            to: 3, 
            label: '密封材料',      // ✅ 关系也有标签
            font: { size: 16, color: '#000000' }
        }
    ]);
    
    const data = { nodes: nodes, edges: edges };
    
    const options = {
        nodes: {
            shape: 'circle',
            size: 50,
            font: {
                size: 20,
                color: '#000000',
                face: 'Arial',
                strokeWidth: 2,
                strokeColor: '#ffffff'
            },
            borderWidth: 3
        },
        edges: {
            arrows: { to: { enabled: true } },
            font: {
                size: 16,
                color: '#000000',
                face: 'Arial',
                strokeWidth: 1,
                strokeColor: '#ffffff'
            },
            width: 2
        },
        physics: {
            enabled: true,
            stabilization: { enabled: true, iterations: 100 }
        }
    };
    
    console.log('🧪 测试明确标签配置...');
    console.log('节点数据:', nodes.get());
    console.log('边数据:', edges.get());
    console.log('配置:', options);
    
    const network = new vis.Network(container, data, options);
    
    network.on('afterDrawing', function() {
        console.log('🎨 明确标签测试绘制完成');
        
        setTimeout(() => {
            // 检查Canvas上是否有文字
            const canvas = container.querySelector('canvas');
            if (canvas) {
                console.log('🎨 Canvas 元素:', canvas);
                console.log('Canvas 尺寸:', canvas.width, 'x', canvas.height);
                
                // 尝试从Canvas中读取像素数据来检测是否有内容
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imageData.data;
                
                let hasContent = false;
                for (let i = 0; i < pixels.length; i += 4) {
                    // 检查是否有非透明像素
                    if (pixels[i + 3] > 0) {
                        hasContent = true;
                        break;
                    }
                }
                
                console.log('Canvas 内容检测:', hasContent ? '有内容' : '无内容');
            }
            
            // 检查是否能通过 vis.js API 获取标签信息
            const nodePositions = network.getPositions();
            console.log('节点位置:', nodePositions);
            
            // 手动测试文字渲染
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.font = '20px Arial';
                ctx.fillStyle = '#FF0000';
                ctx.fillText('测试文字渲染', 50, 50);
                console.log('✅ 手动在Canvas上绘制了红色测试文字');
            }
            
        }, 2000);
    });
    
    window.explicitTestNetwork = network;
    
    return network;
}

// 运行明确标签测试
testWithExplicitLabels();




// 应用简单标签修复方案
function simpleNodeLabelFix(kgId = 'default') {
    console.log('🔧 应用增强版标签修复方案...');
    
    // 获取原始数据
    fetch('/kg/visualization/' + kgId)
        .then(response => response.json())
        .then(data => {
            if (!data.success || !data.data) {
                console.error('❌ 获取原始数据失败');
                return;
            }
            
            const originalNodes = data.data.nodes || [];
            console.log(`📊 获取到 ${originalNodes.length} 个原始节点`);
            
            if (!window.currentViz || !window.currentViz.network) {
                console.error('❌ 找不到当前可视化实例');
                return;
            }
            
            const network = window.currentViz.network;
            const renderedNodes = network.body.data.nodes;
            const nodeData = renderedNodes.get();
            
            console.log(`🔄 渲染节点数: ${nodeData.length}, 原始节点数: ${originalNodes.length}`);
            
            // ✅ 创建映射表 - 不再依赖节点数量相等
            const nodeNameMap = {};
            
            // 尝试为每个原始节点创建多种可能的ID映射
            originalNodes.forEach((originalNode, index) => {
                const name = originalNode.properties?.name || `节点${index + 1}`;
                
                // 使用多种可能的ID形式作为键
                const possibleKeys = [
                    originalNode.id,                // 原始ID
                    String(originalNode.id),        // 字符串形式
                    parseInt(originalNode.id),      // 数字形式
                    index + 1,                      // 索引位置(+1)
                    `${index + 1}`,                 // 索引字符串
                    name                            // 名称本身
                ];
                
                possibleKeys.forEach(key => {
                    if (key !== undefined && key !== null && !isNaN(key)) {
                        nodeNameMap[key] = name;
                    }
                });
            });
            
            console.log('📊 创建的节点名称映射表:', nodeNameMap);
            
            // 更新所有渲染节点的标签
            const updatedNodes = nodeData.map((node, index) => {
                // 尝试多种方式找到标签
                let label;
                
                // 方法1: 使用节点ID直接匹配
                if (nodeNameMap[node.id]) {
                    label = nodeNameMap[node.id];
                    console.log(`✅ ID匹配: 为节点 ${node.id} 设置标签 "${label}"`);
                }
                // 方法2: 使用节点索引匹配
                else if (index < originalNodes.length) {
                    const originalNode = originalNodes[index];
                    if (originalNode.properties && originalNode.properties.name) {
                        label = originalNode.properties.name;
                        console.log(`✅ 索引匹配: 为节点 ${node.id} 设置标签 "${label}"`);
                    }
                }
                // 方法3: 尝试使用id字符串匹配
                else if (nodeNameMap[String(node.id)]) {
                    label = nodeNameMap[String(node.id)];
                    console.log(`✅ ID字符串匹配: 为节点 ${node.id} 设置标签 "${label}"`);
                }
                // 方法4: 后备方案
                else {
                    // 尝试从原始数据中找出最可能匹配的节点
                    let bestMatch = null;
                    let maxScore = -1;
                    
                    originalNodes.forEach(originalNode => {
                        let score = 0;
                        
                        // 如果ID完全匹配，高分
                        if (originalNode.id == node.id) {
                            score += 10;
                        }
                        
                        // 如果类型匹配，加分
                        if (originalNode.type === node.type) {
                            score += 5;
                        }
                        
                        // 如果比当前最佳匹配更好，更新
                        if (score > maxScore) {
                            maxScore = score;
                            bestMatch = originalNode;
                        }
                    });
                    
                    if (bestMatch && bestMatch.properties && bestMatch.properties.name) {
                        label = bestMatch.properties.name;
                        console.log(`✅ 启发式匹配: 为节点 ${node.id} 设置标签 "${label}"`);
                    } else {
                        label = `节点${node.id}`;
                        console.log(`⚠️ 使用默认标签: 为节点 ${node.id} 设置标签 "${label}"`);
                    }
                }
                
                // 创建更新对象
                return {
                    ...node,
                    label: label,
                    font: {
                        size: 18,
                        color: '#000000',
                        face: 'Arial',
                        strokeWidth: 3,
                        strokeColor: '#ffffff'
                    }
                };
            });
            
            // 更新节点
            renderedNodes.update(updatedNodes);
            
            // 强制重绘
            setTimeout(() => {
                try {
                    network.redraw();
                    console.log('✅ 增强版标签修复完成');
                    
                    // 额外检查文本元素是否可见
                    setTimeout(checkTextElements, 500);
                } catch(e) {
                    console.error('❌ 重绘失败:', e);
                }
            }, 300);
        })
        .catch(error => {
            console.error('❌ 获取原始数据失败:', error);
        });
}

// 辅助函数：检查文本元素是否可见
function checkTextElements() {
    const container = document.getElementById('neo4j-graph');
    if (!container) return;
    
    const canvas = container.querySelector('canvas');
    if (!canvas) return;
    
    // 尝试添加一个自定义SVG层来显示标签
    if (!document.getElementById('kg-labels-layer')) {
        const network = window.currentViz?.network;
        if (!network) return;
        
        // 获取所有节点数据
        const nodeData = network.body.data.nodes.get();
        
        // 创建SVG覆盖层
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = 'kg-labels-layer';
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.setAttribute('width', canvas.width);
        svg.setAttribute('height', canvas.height);
        
        // 为每个节点添加文本标签
        nodeData.forEach(node => {
            if (!node.label) return;
            
            // 获取节点位置
            const position = network.getPositions([node.id])[node.id];
            if (!position) return;
            
            // 创建文本元素
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute('x', position.x);
            text.setAttribute('y', position.y);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', '#000000');
            text.setAttribute('stroke', '#ffffff');
            text.setAttribute('stroke-width', '0.5px');
            text.setAttribute('font-family', 'Arial');
            text.setAttribute('font-size', '14px');
            text.textContent = node.label;
            
            svg.appendChild(text);
        });
        
        container.appendChild(svg);
        console.log('✅ 添加了SVG标签层');
        
        // 当网络移动时更新标签位置

        network.on("afterDrawing", function() {
            if (!document.getElementById('kg-labels-layer')) return;
            
            // 更新每个节点的标签位置
            nodeData.forEach(node => {
                const textElement = svg.querySelector(`text[data-node-id="${node.id}"]`);
                if (!textElement) return;
                
                const position = network.getPositions([node.id])[node.id];
                if (!position) return;
                
                textElement.setAttribute('x', position.x);
                textElement.setAttribute('y', position.y);
            });
        });
    }
}

