/**
 * 知识图谱可视化系统
 * 重构版本：简化设计，解决标签和关系显示问题
 */

// ===== 全局变量 =====
const KGSystem = {
  initialized: false,
  currentViz: null,
  queryUrl: '/kg/kg_search',
  defaultOptions: {
    nodes: {
      shape: 'circle',
      size: 50,
      font: {
        size: 18,
        color: '#000000',
        face: 'Arial',
        strokeWidth: 3,
        strokeColor: '#ffffff'
      },
      borderWidth: 3
    },
    edges: {
      arrows: { to: { enabled: true } },
      font: {
        size: 14,
        color: '#000000',
        face: 'Arial',
        strokeWidth: 2,
        strokeColor: '#ffffff',
        background: 'white',
        align: 'middle'
      },
      width: 3,
      smooth: {
        enabled: true,
        type: 'curvedCW',
        roundness: 0.2
      },
      length: 200
    },
    physics: {
      enabled: true,
      stabilization: { enabled: true, iterations: 100 }
    }
  }
};

// ===== 工具函数 =====
/**
 * 显示消息通知
 * @param {string} message 消息内容
 * @param {string} type 消息类型: info, success, error, warning
 */
function showMessage(message, type = 'info') {
  let messageContainer = document.getElementById('message-container');
  
  if (!messageContainer) {
    messageContainer = document.createElement('div');
    messageContainer.id = 'message-container';
    messageContainer.style.position = 'fixed';
    messageContainer.style.top = '20px';
    messageContainer.style.right = '20px';
    messageContainer.style.zIndex = '9999';
    document.body.appendChild(messageContainer);
  }
  
  const messageElement = document.createElement('div');
  
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
  
  messageContainer.appendChild(messageElement);
  
  setTimeout(() => {
    messageElement.classList.remove('show');
    setTimeout(() => {
      if (messageElement.parentNode === messageContainer) {
        messageContainer.removeChild(messageElement);
      }
    }, 300);
  }, 5000);
}

/**
 * 格式化日期时间
 * @param {string} dateString 日期字符串
 * @returns {string} 格式化的日期
 */
function formatDateTime(dateString) {
  if (!dateString) return '未知';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
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

// ===== 核心可视化功能 =====
/**
 * 渲染知识图谱
 * @param {Object} data 图谱数据
 * @param {string} kgId 图谱ID
 */
function renderVisualization(data, kgId) {
  const graphContainer = document.getElementById('neo4j-graph');
  if (!graphContainer) {
    console.error("❌ 找不到图谱容器");
    return;
  }
  
  console.log('🔍 开始渲染知识图谱:', data);
  
  // 检查数据有效性
  if (!data || !data.nodes || data.nodes.length === 0) {
    graphContainer.innerHTML = `
      <div style="text-align:center;padding:50px;">
        <h4>暂无数据</h4>
        <p class="text-muted">该知识图谱中暂无节点数据</p>
      </div>
    `;
    return;
  }
  
  // 检查NeoVis库
  if (typeof NeoVis === 'undefined') {
    console.error("❌ NeoVis库未加载");
    graphContainer.innerHTML = '<div class="alert alert-danger">可视化库未加载</div>';
    return;
  }
  
  // 创建cypher查询
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
  
  // 配置
  const config = {
    containerId: "neo4j-graph",
    neo4j: {
      serverUrl: "bolt://localhost:7687",
      serverUser: "neo4j",
      serverPassword: "3080neo4j"
    },
    labels: {
      "*": { 
        caption: "name",
        size: 45,
        color: "#97C2FC"
      }
    },
    relationships: {
      "*": { 
        caption: true,
        thickness: 3,
        color: "#848484",
        font: {
          size: 14,
          color: '#000000',
          face: 'Arial',
          background: 'white',
          strokeWidth: 2,
          strokeColor: '#ffffff',
          align: 'middle'
        }
      }
    },
    initialCypher: cypher,
    visConfig: KGSystem.defaultOptions
  };
  
  try {
    // 清空容器
    graphContainer.innerHTML = '';
    
    // 初始化NeoVis
    const viz = new NeoVis.default(config);
    KGSystem.currentViz = viz;
    
    // 注册事件
    viz.registerOnEvent("completed", (e) => {
      console.log("✅ 图谱渲染完成", e);
      
      // 隐藏加载元素
      const loadingElement = document.getElementById('kg-loading');
      if (loadingElement) loadingElement.style.display = 'none';
      
      // 如果网络对象已创建
      if (viz.network) {
        // 修复节点和关系标签
        setTimeout(() => {
          fixNodeLabels();
          fixRelationshipLabels(data);
        }, 300);
      }
    });
    
    viz.registerOnEvent("error", (error) => {
      console.error("❌ 可视化错误:", error);
      graphContainer.innerHTML = `<div class="alert alert-danger">渲染失败: ${error.message || error}</div>`;
    });
    
    // 开始渲染
    viz.render();
    
  } catch (e) {
    console.error("❌ 初始化可视化失败:", e);
    graphContainer.innerHTML = `<div class="alert alert-danger">初始化失败: ${e.message}</div>`;
  }
}

/**
 * 修复节点标签 - 直接使用节点本身的属性数据
 */
function fixNodeLabels() {
  if (!KGSystem.currentViz || !KGSystem.currentViz.network) return;
  
  const network = KGSystem.currentViz.network;
  const nodes = network.body.data.nodes;
  const nodeData = nodes.get();
  
  console.log(`📊 正在修复 ${nodeData.length} 个节点的标签...`);
  
  // 使用节点的raw属性
  const updatedNodes = nodeData.map(node => {
    let newLabel = null;
    
    // 优先使用raw.properties.name
    if (node.raw && node.raw.properties && node.raw.properties.name) {
      newLabel = node.raw.properties.name;
      console.log(`✅ 节点 ${node.id}: 使用raw.properties.name -> "${newLabel}"`);
    } 
    // 其次查看raw.labels中有意义的标签
    else if (node.raw && node.raw.labels && node.raw.labels.length > 0) {
      // 跳过通用标签如__Entity__，使用更具体的标签
      const meaningfulLabels = node.raw.labels.filter(label => 
        label !== '__Entity__' && !label.startsWith('UserKG_'));
      if (meaningfulLabels.length > 0) {
        newLabel = meaningfulLabels[0];
        console.log(`✅ 节点 ${node.id}: 使用raw.labels -> "${newLabel}"`);
      }
    }
    // 最后尝试使用raw.identity
    else if (node.raw && node.raw.identity) {
      newLabel = `节点${node.raw.identity}`;
      console.log(`⚠️ 节点 ${node.id}: 使用raw.identity -> "${newLabel}"`);
    }
    // 默认标签
    else {
      newLabel = `节点${node.id}`;
      console.log(`⚠️ 节点 ${node.id}: 使用默认标签 -> "${newLabel}"`);
    }
    
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
  });
  
  // 应用更新
  try {
    nodes.update(updatedNodes);
    setTimeout(() => network.redraw(), 100);
    console.log('✅ 节点标签修复完成');
  } catch (e) {
    console.error('❌ 节点标签更新失败:', e);
  }
}

/**
 * 修复关系标签 - 直接使用关系的type或label属性
 * @param {Object} originalData 原始图谱数据
 */
function fixRelationshipLabels(originalData) {
  if (!KGSystem.currentViz || !KGSystem.currentViz.network) return;
  
  const network = KGSystem.currentViz.network;
  const edges = network.body.data.edges;
  const edgeData = edges.get();
  
  console.log(`🔗 正在修复 ${edgeData.length} 个关系的标签...`);
  
  // 获取原始边数据用于索引匹配
  const originalEdges = originalData?.edges || [];
  
  const updatedEdges = edgeData.map((edge, index) => {
    // 默认标签
    let newLabel = null;
    
    // 1. 首先尝试直接使用边的属性
    if (edge.type) {
      newLabel = edge.type;
      console.log(`✅ 关系 ${edge.from}->${edge.to}: 使用type属性 -> "${newLabel}"`);
    }
    else if (edge.label && edge.label !== '') {
      newLabel = edge.label;
      console.log(`✅ 关系 ${edge.from}->${edge.to}: 使用现有label -> "${newLabel}"`);
    }
    // 2. 尝试通过索引匹配原始数据
    else if (index < originalEdges.length) {
      const originalEdge = originalEdges[index];
      if (originalEdge.type) {
        newLabel = originalEdge.type;
        console.log(`✅ 关系 ${edge.from}->${edge.to}: 通过索引匹配使用type -> "${newLabel}"`);
      } 
      else if (originalEdge.label) {
        newLabel = originalEdge.label;
        console.log(`✅ 关系 ${edge.from}->${edge.to}: 通过索引匹配使用label -> "${newLabel}"`);
      }
      else if (originalEdge.relationship) {
        newLabel = originalEdge.relationship;
        console.log(`✅ 关系 ${edge.from}->${edge.to}: 通过索引匹配使用relationship -> "${newLabel}"`);
      }
      else {
        newLabel = '关系';
        console.log(`⚠️ 关系 ${edge.from}->${edge.to}: 无法找到标签，使用默认值 -> "${newLabel}"`);
      }
    }
    // 3. 默认标签
    else {
      newLabel = '关系';
      console.log(`⚠️ 关系 ${edge.from}->${edge.to}: 无匹配数据，使用默认值 -> "${newLabel}"`);
    }
    
    // 更新关系对象
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
  
  // 应用更新
  try {
    edges.update(updatedEdges);
    setTimeout(() => network.redraw(), 100);
    console.log('✅ 关系标签修复完成');
  } catch (e) {
    console.error('❌ 关系标签更新失败:', e);
  }
}

/**
 * 可视化知识图谱
 * @param {string} kgId 图谱ID
 */
function visualizeKG(kgId = 'default') {
  console.log(`开始加载知识图谱: ${kgId}`);
  
  const graphContainer = document.getElementById('neo4j-graph');
  const loadingElement = document.getElementById('kg-loading');
  
  if (!graphContainer) {
    console.error("❌ 找不到图谱容器");
    return;
  }
  
  // 显示加载状态
  graphContainer.innerHTML = '';
  if (loadingElement) loadingElement.style.display = 'flex';
  
  // 获取图谱数据
  fetch(`/kg/visualization/${kgId}`)
    .then(response => response.json())
    .then(data => {
      if (loadingElement) loadingElement.style.display = 'none';
      
      if (data.success) {
        console.log('✅ 获取图谱数据成功:', data.data);
        renderVisualization(data.data, kgId);
        updateGraphStats(data.data);
      } else {
        console.error('❌ 获取图谱数据失败:', data.message);
        graphContainer.innerHTML = `<div class="alert alert-danger">加载失败: ${data.message}</div>`;
      }
    })
    .catch(error => {
      console.error('❌ 网络请求失败:', error);
      if (loadingElement) loadingElement.style.display = 'none';
      graphContainer.innerHTML = '<div class="alert alert-danger">网络错误，请检查连接</div>';
    });
}

/**
 * 更新图谱统计信息
 * @param {Object} data 图谱数据
 */
function updateGraphStats(data) {
  const nodeCount = data?.nodes?.length || 0;
  const relationCount = data?.edges?.length || 0;
  
  // 获取节点类型
  const nodeTypes = new Set();
  if (data && data.nodes) {
    data.nodes.forEach(node => {
      if (node.type) nodeTypes.add(node.type);
    });
  }
  
  // 更新DOM元素
  const nodeCountEl = document.getElementById('node-count');
  const relationCountEl = document.getElementById('relation-count');
  const entityTypesCountEl = document.getElementById('entity-types-count');
  
  if (nodeCountEl) nodeCountEl.textContent = nodeCount;
  if (relationCountEl) relationCountEl.textContent = relationCount;
  if (entityTypesCountEl) entityTypesCountEl.textContent = nodeTypes.size;
  
  console.log(`✅ 统计信息已更新: ${nodeCount}节点, ${relationCount}关系, ${nodeTypes.size}类型`);
}

/**
 * 加载用户知识图谱列表
 */
function loadUserKgList() {
  const kgSelector = document.getElementById('kg-selector');
  if (!kgSelector) return;
  
  console.log("加载用户知识图谱列表...");
  
  fetch('/kg/list')
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // 清除现有选项（保留默认选项）
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
        
        console.log(`✅ 已加载 ${data.kgs.length} 个用户图谱`);
      } else {
        console.error('❌ 加载用户图谱列表失败:', data.message);
      }
    })
    .catch(error => {
      console.error('❌ 获取用户图谱列表失败:', error);
    });
}

/**
 * 设置控制按钮事件
 */
function setupControlButtons() {
  // 放大按钮
  const zoomInBtn = document.getElementById('zoom-in-btn');
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      if (KGSystem.currentViz && KGSystem.currentViz.network) {
        const scale = KGSystem.currentViz.network.getScale();
        KGSystem.currentViz.network.moveTo({scale: scale * 1.2});
      }
    });
  }
  
  // 缩小按钮
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      if (KGSystem.currentViz && KGSystem.currentViz.network) {
        const scale = KGSystem.currentViz.network.getScale();
        KGSystem.currentViz.network.moveTo({scale: scale * 0.8});
      }
    });
  }
  
  // 适应视图按钮
  const zoomFitBtn = document.getElementById('zoom-fit-btn');
  if (zoomFitBtn) {
    zoomFitBtn.addEventListener('click', () => {
      if (KGSystem.currentViz && KGSystem.currentViz.network) {
        KGSystem.currentViz.network.fit();
      }
    });
  }
  
  // 物理布局切换按钮
  const physicsBtn = document.getElementById('physics-btn');
  if (physicsBtn) {
    physicsBtn.addEventListener('click', () => {
      if (KGSystem.currentViz && KGSystem.currentViz.network) {
        const options = KGSystem.currentViz.network.getOptionsFromConfigurator();
        const currentPhysics = options.physics.enabled;
        KGSystem.currentViz.network.setOptions({physics: {enabled: !currentPhysics}});
        physicsBtn.classList.toggle('active', !currentPhysics);
      }
    });
  }
}

/**
 * 设置查询处理器
 */
function setupQueryHandlers() {
  const queryForm = document.getElementById('query-form');
  if (queryForm) {
    queryForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitQuery();
    });
  }
}

/**
 * 提交查询
 */
async function submitQuery() {
  const queryInput = document.getElementById('query-input');
  const resultContainer = document.getElementById('query-result');
  const kgSelector = document.getElementById('kg-selector');
  const queryButton = document.getElementById('query-button');
  
  if (!queryInput || !resultContainer) return;
  
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
    const response = await fetch('/kg/search', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ question, kgId })
    });
    
    const data = await response.json();
    
    // 恢复按钮状态
    if (queryButton) {
      queryButton.disabled = false;
      queryButton.textContent = '查询';
    }
    
    if (data.success) {
      displayQueryResults(data);
    } else {
      resultContainer.innerHTML = `<div class="alert alert-danger">查询失败: ${data.message}</div>`;
    }
  } catch (error) {
    console.error('❌ 查询请求失败:', error);
    resultContainer.innerHTML = '<div class="alert alert-danger">查询请求失败</div>';
    
    if (queryButton) {
      queryButton.disabled = false;
      queryButton.textContent = '查询';
    }
  }
}

/**
 * 显示查询结果
 * @param {Object} data 查询结果数据
 */
function displayQueryResults(data) {
  const resultContainer = document.getElementById('query-result');
  
  let resultHTML = `
    <div class="result-section">
      <div class="result-query">
        <h4>生成的查询语句:</h4>
        <pre><code>${data.query}</code></pre>
      </div>
      <div class="result-data">
        <h4>查询结果:</h4>
  `;
  
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

/**
 * 检查Neo4j连接状态
 */
function checkNeo4jConnection() {
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
        if (statusIndicator) {
          statusIndicator.className = 'status-indicator status-connected';
        }
        if (statusText) {
          statusText.textContent = 'Neo4j 已连接';
        }
        showMessage('Neo4j 连接正常', 'success');
      } else {
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
      console.error('❌ 检查连接失败:', error);
      if (statusIndicator) {
        statusIndicator.className = 'status-indicator status-disconnected';
      }
      if (statusText) {
        statusText.textContent = '连接检查失败';
      }
      showMessage('无法检查 Neo4j 连接状态', 'error');
    });
}

/**
 * 添加标签页切换监听
 */
function setupTabSwitchListeners() {
  // 管理标签页
  const manageTab = document.getElementById('manage-tab');
  if (manageTab) {
    manageTab.addEventListener('shown.bs.tab', () => {
      console.log("切换到管理标签页");
      setTimeout(loadTempKGList, 200);
    });
  }
  
  // 探索标签页
  const exploreTab = document.getElementById('explore-tab');
  if (exploreTab) {
    exploreTab.addEventListener('shown.bs.tab', () => {
      console.log("切换到探索标签页");
      setTimeout(() => {
        const currentKgId = document.getElementById('kg-selector')?.value || 'default';
        visualizeKG(currentKgId);
      }, 200);
    });
  }
}

/**
 * 加载临时知识图谱列表
 */
function loadTempKGList() {
  const listContainer = document.getElementById('temp-kg-list');
  if (!listContainer) return;
  
  // 显示加载状态
  listContainer.innerHTML = `
    <div class="text-center p-4">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="mt-2">正在加载知识图谱列表...</p>
    </div>
  `;
  
  fetch('/kg/list')
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        displayTempKGList(data.kgs, listContainer);
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
      console.error('❌ 加载知识图谱列表失败:', error);
      listContainer.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-times-circle"></i>
          网络错误，无法加载知识图谱列表
        </div>
      `;
    });
}

/**
 * 显示临时知识图谱列表
 * @param {Array} kgs 知识图谱列表
 * @param {HTMLElement} container 容器元素
 */
function displayTempKGList(kgs, container) {
  if (!kgs || kgs.length === 0) {
    container.innerHTML = `
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
  container.innerHTML = html;
}

/**
 * 获取状态徽章
 * @param {string} status 状态值
 * @returns {string} HTML字符串
 */
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

/**
 * 显示删除确认
 * @param {string} kgId 图谱ID
 * @param {string} kgName 图谱名称
 */
function showDeleteConfirm(kgId, kgName) {
  if (confirm(`确定要删除知识图谱 "${kgName}" 吗？\n\n此操作不可撤销，将永久删除所有相关数据。`)) {
    deleteKG(kgId);
  }
}

/**
 * 删除知识图谱
 * @param {string} kgId 图谱ID
 */
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
      loadTempKGList();
      loadUserKgList();
    } else {
      showMessage(`删除失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    console.error('❌ 删除知识图谱失败:', error);
    showMessage('删除操作失败，请重试', 'error');
  });
}

/**
 * 查看知识图谱
 * @param {string} kgId 图谱ID
 */
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
  setTimeout(() => visualizeKG(kgId), 300);
}

/**
 * 切换到上传标签页
 */
function switchToUploadTab() {
  const uploadTab = document.getElementById('upload-tab');
  if (uploadTab) {
    uploadTab.click();
  }
}

/**
 * 系统初始化
 */
function initializeKG() {
  if (KGSystem.initialized) {
    console.log("知识图谱系统已初始化，跳过重复初始化");
    return;
  }
  
  console.log("🚀 初始化知识图谱系统...");
  
  // 检查当前页面是否是知识图谱页面
  const graphContainer = document.getElementById('neo4j-graph');
  const queryForm = document.getElementById('query-form');
  
  if (!graphContainer && !queryForm) {
    console.log("当前页面不是知识图谱页面，跳过初始化");
    return;
  }
  
  KGSystem.initialized = true;
  
  // 初始化下拉框和事件监听
  const kgSelector = document.getElementById('kg-selector');
  if (kgSelector) {
    loadUserKgList();
    
    // 监听下拉框变化
    kgSelector.addEventListener('change', function() {
      const selectedKgId = this.value;
      console.log(`切换到图谱: ${selectedKgId}`);
      visualizeKG(selectedKgId);
    });
  }
  
  // 初始化查询组件
  if (queryForm) {
    setupQueryHandlers();
  }
  
  // 添加标签页切换监听
  setupTabSwitchListeners();
  
  // 初始化可视化组件
  if (graphContainer) {
    setupControlButtons();
    
    // 立即加载默认图谱
    visualizeKG('default');
  }
  
  console.log("✅ 知识图谱系统初始化完成");
}

// 页面加载完成后自动初始化
if (document.readyState === 'complete') {
  initializeKG();
} else {
  window.addEventListener('load', initializeKG);
  document.addEventListener('DOMContentLoaded', () => setTimeout(initializeKG, 500));
}

// 将关键函数暴露到全局作用域
window.visualizeKG = visualizeKG;
window.submitQuery = submitQuery;
window.checkNeo4jConnection = checkNeo4jConnection;
window.loadTempKGList = loadTempKGList;
window.showDeleteConfirm = showDeleteConfirm;
window.deleteKG = deleteKG;
window.viewKnowledgeGraph = viewKnowledgeGraph;
window.switchToUploadTab = switchToUploadTab;
window.fixNodeLabels = fixNodeLabels;
window.fixRelationshipLabels = fixRelationshipLabels;
window.showMessage = showMessage;