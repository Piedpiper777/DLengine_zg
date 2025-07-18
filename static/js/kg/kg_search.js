document.addEventListener('DOMContentLoaded', function () {
    async function sendQueryRequest(queryText) {
        const formData = new FormData();
        formData.append('query_text', queryText);

        try {
            const response = await fetch(queryUrl, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('查询请求出现错误:', error);
            alert('查询请求失败，请稍后再试');
            return null;
        }
    }

    // 使用 Neovis.js 渲染图形
    function renderGraph(cypherQuery, queryResults) {
        const graphContainer = document.getElementById('neo4j-graph');
        graphContainer.style.display = 'block'; // 显示图形容器
    
        // 动态生成 labels 配置
        const labelsConfig = {};
        queryResults.nodes.forEach(node => {
            if (!labelsConfig[node.label]) {
                labelsConfig[node.label] = { label: "name" }; // 假设所有节点都有 'name' 属性
            }
        });
    
        // 动态生成 relationships 配置
        const relationshipsConfig = {};
        queryResults.relationships.forEach(rel => {
            if (!relationshipsConfig[rel.type]) {
                relationshipsConfig[rel.type] = { label: false }; // 不显示关系文本
            }
        });
    
        const config = {
            containerId: "neo4j-graph",
            neo4j: {
                serverUrl: "bolt://localhost:7687",
                serverUser: "neo4j",
                serverPassword: "3080neo4j"
            },
            labels: labelsConfig,
            relationships: relationshipsConfig,
            initialCypher: cypherQuery // 动态 Cypher 查询
        };
    
        const viz = new NeoVis.default(config);
        viz.render();
    }
    

    function submitQuery(event) {
        event.preventDefault();
        const queryText = document.getElementById('query-input').value;

        if (queryText) {
            const queryButton = document.getElementById('query-button');
            queryButton.disabled = true;
            queryButton.textContent = '查询中...';

            sendQueryRequest(queryText)
                .then(data => {
                    queryButton.disabled = false;
                    queryButton.textContent = '查询';

                    const resultContainer = document.getElementById('query-result');
                    resultContainer.innerHTML = ''; // 清空文本结果

                    const graphContainer = document.getElementById('neo4j-graph');
                    graphContainer.style.display = 'none'; // 隐藏图形容器

                    if (data.message) {
                        document.getElementById('message-container').textContent = data.message;
                    }

                    if (data.results && data.results.length > 0) {
                        // 假设每个 result 结构为 {m: {...}, n: {...}, ...}
                        const results = data.results.map(item => {
                            // 你可以根据实际结构调整
                            // 例如只显示 m 节点的 name
                            if (item.m && item.m.name) {
                                return item.m.name;
                            }
                            // 或者显示所有 key-value
                            return Object.entries(item).map(([k, v]) => {
                                if (v && typeof v === 'object' && v.name) {
                                    return `${k}: ${v.name}`;
                                }
                                return `${k}: ${JSON.stringify(v)}`;
                            }).join(', ');
                        }).join('<br>');

                        const queryElement = document.createElement('p');
                        queryElement.innerHTML = `<span class="query-text">${data.query}</span>: ${results}`;
                        resultContainer.appendChild(queryElement);
                    } else {
                        resultContainer.innerHTML = '未查询到结果';
                    }
                    

                    if (data.cypher_query_vs) {
                        renderGraph(data.cypher_query_vs,data.queryResults); // 渲染图形
                    }
                })
                .catch(error => {
                    queryButton.disabled = false;
                    queryButton.textContent = '查询';
                    console.error('查询处理错误:', error);
                });
        } else {
            alert('请输入有效的查询内容');
        }
    }

    const queryForm = document.getElementById('query-form');
    queryForm.addEventListener('submit', submitQuery);
});






function showMessage(message) {
  const messageContainer = document.getElementById('message-container');
  messageContainer.textContent = message;
  messageContainer.style.display = 'block';
    }

function hideMessage() {
  const messageContainer = document.getElementById('message-container');
  messageContainer.style.display = 'none';
}