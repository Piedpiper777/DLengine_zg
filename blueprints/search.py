from py2neo import Graph, NodeMatcher
from flask import Blueprint, render_template, request, jsonify, session, Response
from apps.neo4j_helper import start_neo4j, perform_query
from utils.kg.nlp_utils import process_question_for_both
from utils.llm.llm_client import llm_client
from utils.kg.graph_builder import build_knowledge_graph_from_document
from py2neo import Graph
import uuid
import sqlite3
import json
import os
from datetime import datetime
import time
from werkzeug.utils import secure_filename
import docx
import re

# 创建蓝图
bp = Blueprint('search', __name__)

# 数据库文件路径
DB_PATH = os.path.join(os.getcwd(), 'chat_data.db')
KG_DB_PATH = os.path.join(os.getcwd(), 'kg_data.db')

def init_db():
    """初始化数据库"""
    conn = sqlite3.connect(DB_PATH)
    
    # 添加时区支持
    conn.execute("PRAGMA timezone='Asia/Shanghai'")
    cursor = conn.cursor()
    
    # 创建用户表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
        )
    ''')
    
    # 创建对话表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            chat_id TEXT PRIMARY KEY,
            user_id TEXT,
            title TEXT,
            created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            updated_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
    ''')
    
    # 创建消息表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            message_id TEXT PRIMARY KEY,
            chat_id TEXT,
            role TEXT,
            content TEXT,
            created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (chat_id) REFERENCES conversations (chat_id)
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ 数据库初始化完成")

# 初始化数据库
init_db()

def init_kg_db():
    """初始化知识图谱数据库"""
    conn = sqlite3.connect(KG_DB_PATH)
    cursor = conn.cursor()
    
    # 创建文档表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            document_id TEXT PRIMARY KEY,
            user_id TEXT,
            file_name TEXT,
            file_path TEXT,
            upload_time TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            status TEXT DEFAULT 'uploaded'
        )
    ''')
    
    # 创建用户知识图谱表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_kgs (
            kg_id TEXT PRIMARY KEY,
            user_id TEXT,
            name TEXT,
            document_id TEXT,
            created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            node_count INTEGER DEFAULT 0,
            relation_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            metadata TEXT,
            FOREIGN KEY (document_id) REFERENCES documents (document_id)
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ 知识图谱数据库初始化完成")

# 确保应用启动时初始化数据库
init_kg_db()

def get_user_id():
    """获取或创建用户ID"""
    if 'user_id' not in session:
        user_id = str(uuid.uuid4())
        session['user_id'] = user_id
        session.permanent = True
        
        # 保存到数据库
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('INSERT OR IGNORE INTO users (user_id) VALUES (?)', (user_id,))
            conn.commit()
            conn.close()
            print(f"✅ 新用户创建: {user_id}")
        except Exception as e:
            print(f"❌ 用户创建失败: {e}")
    
    return session['user_id']

def create_conversation(user_id, title="新对话"):
    """创建新对话"""
    chat_id = str(uuid.uuid4())
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO conversations (chat_id, user_id, title) 
            VALUES (?, ?, ?)
        ''', (chat_id, user_id, title))
        conn.commit()
        conn.close()
        print(f"✅ 对话创建成功: {chat_id}")
        return chat_id
    except Exception as e:
        print(f"❌ 对话创建失败: {e}")
        raise e

def get_conversations(user_id):
    """获取用户的所有对话"""
    try:
        conn = sqlite3.connect(DB_PATH)
        # 启用日期时间支持
        conn.execute('PRAGMA foreign_keys = ON')
        
        cursor = conn.cursor()
        cursor.execute('''
            SELECT c.chat_id, c.title, c.created_at, c.updated_at,
                   (SELECT content FROM messages WHERE chat_id = c.chat_id 
                    AND role = 'assistant' ORDER BY created_at DESC LIMIT 1) as last_message,
                   (SELECT COUNT(*) FROM messages WHERE chat_id = c.chat_id) as message_count
            FROM conversations c 
            WHERE user_id = ? 
            ORDER BY updated_at DESC
        ''', (user_id,))
        
        conversations = []
        for row in cursor.fetchall():
            last_msg = row[4]
            if last_msg and len(last_msg) > 50:
                last_msg = last_msg[:47] + '...'
            elif not last_msg:
                last_msg = '暂无消息'
                
            conversations.append({
                'chat_id': row[0],
                'title': row[1] or '新对话',
                'created_at': row[2],
                'updated_at': row[3],
                'last_message': last_msg,
                'message_count': (row[5] or 0) // 2  # 只计算对话轮数
            })
        
        conn.close()
        print(f"📋 获取到 {len(conversations)} 个对话")
        return conversations
    except Exception as e:
        print(f"❌ 获取对话列表失败: {e}")
        return []

def get_messages(chat_id):
    """获取对话的所有消息"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT role, content, created_at FROM messages 
            WHERE chat_id = ? 
            ORDER BY created_at ASC
        ''', (chat_id,))
        
        messages = []
        for row in cursor.fetchall():
            messages.append({
                'role': row[0],
                'content': row[1],
                'created_at': row[2]  # 添加创建时间
            })
        
        conn.close()
        print(f"💬 获取到 {len(messages)} 条消息")
        return messages
    except Exception as e:
        print(f"❌ 获取消息失败: {e}")
        return []

def add_message(chat_id, role, content):
    """添加消息"""
    try:
        message_id = str(uuid.uuid4())
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO messages (message_id, chat_id, role, content, created_at) 
            VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
        ''', (message_id, chat_id, role, content))
        
        # 更新对话的更新时间
        cursor.execute('''
            UPDATE conversations SET updated_at = datetime('now', 'localtime')
            WHERE chat_id = ?
        ''', (chat_id,))
        
        conn.commit()
        conn.close()
        print(f"✅ 消息添加成功: {role}")
    except Exception as e:
        print(f"❌ 消息添加失败: {e}")
        raise e

def update_conversation_title(chat_id, title):
    """更新对话标题"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE chat_id = ?
        ''', (title, chat_id))
        conn.commit()
        conn.close()
        print(f"✅ 对话标题更新: {title}")
    except Exception as e:
        print(f"❌ 标题更新失败: {e}")

def delete_conversation(chat_id):
    """删除对话"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM messages WHERE chat_id = ?', (chat_id,))
        cursor.execute('DELETE FROM conversations WHERE chat_id = ?', (chat_id,))
        conn.commit()
        conn.close()
        print(f"✅ 对话删除成功: {chat_id}")
    except Exception as e:
        print(f"❌ 对话删除失败: {e}")
        raise e

def clean_content_for_json(content):
    """清理内容以确保JSON安全"""
    if not content:
        return ""
    
    try:
        content = str(content)
        
        # 移除控制字符
        content = re.sub(r'[\x00-\x1F\x7F]', '', content)
        
        # 确保UTF-8编码
        content = content.encode('utf-8', 'ignore').decode('utf-8')
        
        return content
    except Exception as e:
        print(f"❌ 内容清理失败: {e}")
        return "内容处理错误"

# ==================== 路由定义 ====================

# KG 相关路由
@bp.route('/kg/query_page')
def kg_query_page():
    start_neo4j()
    return render_template('templates_lk/kg.html')

# 原始的知识图谱查询路由
@bp.route('/kg/kg_search', methods=['POST'], endpoint='kg_search_original')
def kg_search_original():
    try:
        query_text = request.form.get('query_text')
        if not query_text:
            return jsonify({'message': '请输入查询内容'}), 400

        cypher_query, cypher_query_vs = process_question_for_both(query_text)
        
        if not cypher_query:
            return jsonify({'message': '未能生成有效的Cypher语句'}), 500

        graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"))
        
        results = graph.run(cypher_query)
        text_results = []
        
        for record in results:
            text_results.append(dict(record))

        viz_results = graph.run(cypher_query_vs)
        nodes = []
        relationships = []
        
        for record in viz_results:
            for key in ['m', 'n']:
                node = record.get(key)
                if node:
                    node_info = {
                        'label': list(node.labels)[0] if node.labels else 'Unknown',
                        'name': node.get('name', '未知')
                    }
                    if node_info not in nodes:
                        nodes.append(node_info)
            
            relationship = record.get('r')
            if relationship:
                rel_info = {
                    'type': type(relationship).__name__
                }
                if rel_info not in relationships:
                    relationships.append(rel_info)

        return jsonify({
            'results': text_results,
            'query': query_text,
            'cypher_query': cypher_query,
            'cypher_query_vs': cypher_query_vs,
            'queryResults': {
                'nodes': nodes,
                'relationships': relationships
            }
        })
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'message': f'后端异常: {str(e)}'}), 500

# 新的知识图谱查询API，支持子图查询
@bp.route('/kg/search', methods=['POST'], endpoint='kg_search_new')
def kg_search():
    """知识图谱搜索API（子图模式）"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': '无效的请求数据'}), 400
            
        question = data.get('question')
        kg_id = data.get('kgId', 'default')
        
        if not question:
            return jsonify({'success': False, 'message': '问题不能为空'}), 400
            
        # 连接到Neo4j
        graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"))
        
        # 如果是默认图谱，使用原有的查询流程
        if kg_id == 'default':
            # 确保Neo4j服务已启动
            start_neo4j()
            
            # 调用NLP处理函数生成Cypher查询
            cypher_query = process_question_for_both(question)
            
            # 如果生成了有效的Cypher查询，执行它
            if cypher_query:
                result = perform_query(cypher_query)
                return jsonify({
                    'success': True,
                    'query': cypher_query,
                    'result': result,
                    'message': '查询成功',
                    'graph_type': '系统默认图谱'
                })
            else:
                return jsonify({
                    'success': False,
                    'message': '无法生成有效的查询语句，请尝试其他问题'
                }), 400
        else:
            # 对于用户图谱，查询指定的子图
            safe_kg_id = kg_id.replace('-', '_')
            subgraph_label = f"UserKG_{safe_kg_id}"
            
            # 生成针对子图的查询提示
            modified_prompt = f"""
你是一个知识图谱查询专家，请帮我将以下问题转化为Neo4j的Cypher查询语句。

这是一个用户创建的知识图谱子图，包含工业领域的数据。
- 所有节点都有标签 '{subgraph_label}' 
- 节点还有具体的实体类型标签，如：设备、部件、技术、材料等
- 所有节点都有属性 kg_id = '{kg_id}'
- 节点的name属性包含实体名称

用户问题: {question}

请直接输出Cypher查询语句，无需额外说明。

查询规则：
1. 必须使用标签 '{subgraph_label}' 来限定查询范围
2. 可以结合实体类型标签进行更精确的查询
3. 查询应该返回节点的名称和其他相关属性
4. 如果需要查找关系，确保关系的 kg_id = '{kg_id}'

示例格式：
MATCH (n:{subgraph_label}) WHERE n.name CONTAINS "发动机" AND n.kg_id = "{kg_id}" RETURN n.name, n.node_type, n

只返回Cypher查询语句：
"""
            
            # 调用LLM生成查询
            response, _ = llm_client.chat_completion_with_history(modified_prompt)
            
            # 提取查询语句
            cypher_query = response.strip()
            if '```' in cypher_query:
                match = re.search(r'```(?:cypher)?(.*?)```', cypher_query, re.DOTALL)
                if match:
                    cypher_query = match.group(1).strip()
            
            # 确保查询包含子图限制
            if subgraph_label not in cypher_query:
                # 降级查询：简单列出子图中的所有节点
                cypher_query = f"""
                MATCH (n:{subgraph_label})
                WHERE n.kg_id = "{kg_id}"
                RETURN n.name, n.node_type, n
                LIMIT 20
                """
            
            # 执行查询
            if cypher_query:
                try:
                    print(f"🔍 执行子图查询: {cypher_query}")
                    result = graph.run(cypher_query).data()
                    
                    return jsonify({
                        'success': True,
                        'query': cypher_query,
                        'result': result,
                        'message': '查询成功',
                        'graph_type': f'用户子图: {subgraph_label}',
                        'kg_id': kg_id
                    })
                except Exception as e:
                    print(f"❌ 查询执行失败: {e}")
                    return jsonify({
                        'success': False,
                        'query': cypher_query,
                        'message': f'查询执行失败: {str(e)}'
                    }), 400
            else:
                return jsonify({
                    'success': False,
                    'message': '无法生成有效的查询语句，请尝试其他问题'
                }), 400
            
    except Exception as e:
        import traceback
        print("❌ 知识图谱查询失败:", traceback.format_exc())
        return jsonify({'success': False, 'message': f'查询失败: {str(e)}'}), 500

# 获取子图可视化数据
@bp.route('/kg/visualization/<kg_id>', methods=['GET'])
def get_kg_visualization(kg_id):
    """获取知识图谱可视化数据"""
    try:
        user_id = session.get('user_id', 'anonymous')
        
        if kg_id == 'default':
            # 返回默认图谱的可视化数据
            graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"))
            
            # ✅ 修复：简化查询语句，避免语法错误
            nodes_query = """
            MATCH (n) 
            WHERE NOT any(label IN labels(n) WHERE label STARTS WITH 'UserKG_')
            AND n.name IS NOT NULL
            RETURN n.name as name, labels(n) as labels, properties(n) as props 
            LIMIT 100
            """
            
            rels_query = """
            MATCH (s)-[r]->(t) 
            WHERE NOT any(label IN labels(s) WHERE label STARTS WITH 'UserKG_')
            AND NOT any(label IN labels(t) WHERE label STARTS WITH 'UserKG_')
            AND s.name IS NOT NULL AND t.name IS NOT NULL
            AND NOT r.kg_id IS NOT NULL
            RETURN s.name as source, t.name as target, type(r) as type, properties(r) as props
            LIMIT 200
            """
            
            print(f"🔍 执行默认图谱节点查询...")
            try:
                nodes_result = graph.run(nodes_query).data()
                print(f"📊 获取到 {len(nodes_result)} 个节点")
            except Exception as e:
                print(f"❌ 节点查询失败: {e}")
                # 降级查询：获取所有节点
                nodes_query_fallback = """
                MATCH (n) 
                WHERE n.name IS NOT NULL
                AND NOT any(label IN labels(n) WHERE label STARTS WITH 'UserKG_')
                RETURN n.name as name, labels(n) as labels, properties(n) as props 
                LIMIT 50
                """
                nodes_result = graph.run(nodes_query_fallback).data()
                print(f"📊 降级查询获取到 {len(nodes_result)} 个节点")
            
            print(f"🔍 执行默认图谱关系查询...")
            try:
                rels_result = graph.run(rels_query).data()
                print(f"🔗 获取到 {len(rels_result)} 个关系")
            except Exception as e:
                print(f"❌ 关系查询失败: {e}")
                # 降级查询：获取所有关系
                rels_query_fallback = """
                MATCH (s)-[r]->(t) 
                WHERE s.name IS NOT NULL AND t.name IS NOT NULL
                AND NOT any(label IN labels(s) WHERE label STARTS WITH 'UserKG_')
                AND NOT any(label IN labels(t) WHERE label STARTS WITH 'UserKG_')
                RETURN s.name as source, t.name as target, type(r) as type, properties(r) as props
                LIMIT 100
                """
                rels_result = graph.run(rels_query_fallback).data()
                print(f"🔗 降级查询获取到 {len(rels_result)} 个关系")
            
            # 格式化数据
            vis_nodes = []
            for node in nodes_result:
                if node['name']:  # 确保节点有名称
                    # 获取非UserKG标签作为类型
                    node_labels = [label for label in node['labels'] if not label.startswith('UserKG_')]
                    node_type = node_labels[0] if node_labels else 'Entity'
                    
                    vis_nodes.append({
                        'id': node['name'],
                        'label': node['name'],
                        'type': node_type,
                        'properties': node['props']
                    })
            
            vis_edges = []
            for rel in rels_result:
                if rel['source'] and rel['target']:  # 确保关系有效
                    vis_edges.append({
                        'from': rel['source'],
                        'to': rel['target'],
                        'label': rel['type'],
                        'type': rel['type'],
                        'properties': rel.get('props', {})
                    })
            
            print(f"✅ 默认图谱数据处理完成: {len(vis_nodes)} 节点, {len(vis_edges)} 关系")
            
            return jsonify({
                'success': True,
                'data': {
                    'nodes': vis_nodes,
                    'edges': vis_edges,
                    'stats': {
                        'nodeCount': len(vis_nodes),
                        'edgeCount': len(vis_edges)
                    }
                },
                'graph_type': '系统默认图谱'
            })
        else:
            # 用户子图处理逻辑保持不变...
            # 验证用户权限
            conn = sqlite3.connect(KG_DB_PATH)
            cursor = conn.cursor()
            cursor.execute(
                'SELECT name FROM user_kgs WHERE kg_id = ? AND user_id = ?', 
                (kg_id, user_id)
            )
            
            result = cursor.fetchone()
            if not result:
                conn.close()
                return jsonify({'success': False, 'message': '知识图谱不存在或无权访问'}), 404
            
            kg_name = result[0]
            conn.close()
            
            # 获取子图可视化数据
            from utils.kg.graph_builder import get_subgraph_for_visualization
            
            vis_data = get_subgraph_for_visualization(kg_id)
            
            if vis_data:
                return jsonify({
                    'success': True,
                    'data': vis_data,
                    'graph_type': f'用户子图: {kg_name}',
                    'kg_id': kg_id
                })
            else:
                return jsonify({
                    'success': False,
                    'message': '无法获取可视化数据'
                }), 500
        
    except Exception as e:
        import traceback
        print("❌ 获取可视化数据失败:", traceback.format_exc())
        return jsonify({'success': False, 'message': f'获取可视化数据失败: {str(e)}'}), 500

# 删除知识图谱（子图模式）
@bp.route('/kg/delete/<kg_id>', methods=['DELETE'])
def delete_kg(kg_id):
    """删除知识图谱（子图模式）"""
    try:
        user_id = session.get('user_id', 'anonymous')
        
        # 验证知识图谱属于当前用户
        conn = sqlite3.connect(KG_DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            'SELECT kg_id FROM user_kgs WHERE kg_id = ? AND user_id = ?', 
            (kg_id, user_id)
        )
        
        if not cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'message': '知识图谱不存在或无权删除'}), 404
        
        # 从数据库中删除记录
        cursor.execute('DELETE FROM user_kgs WHERE kg_id = ? AND user_id = ?', (kg_id, user_id))
        conn.commit()
        conn.close()
        
        # 删除Neo4j中的子图
        from utils.kg.graph_builder import delete_user_kg_subgraph
        
        if delete_user_kg_subgraph(kg_id):
            print(f"✅ 子图删除成功")
        else:
            print(f"⚠️ 子图删除可能失败，但数据库记录已删除")
        
        return jsonify({
            'success': True,
            'message': '知识图谱删除成功'
        })
        
    except Exception as e:
        import traceback
        print("❌ 删除知识图谱失败:", traceback.format_exc())
        return jsonify({'success': False, 'message': f'删除知识图谱失败: {str(e)}'}), 500

# 获取子图详情API
@bp.route('/kg/subgraph/<kg_id>', methods=['GET'])
def get_subgraph_info_api(kg_id):
    """获取子图详细信息（支持默认图谱）"""
    try:
        if kg_id == 'default':
            # ✅ 处理默认图谱的统计
            graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"))
            
            try:
                # ✅ 修复：简化查询语句
                node_query = """
                MATCH (n) 
                WHERE NOT any(label IN labels(n) WHERE label STARTS WITH 'UserKG_')
                RETURN count(n) as node_count, 
                       collect(DISTINCT [label IN labels(n) WHERE NOT label STARTS WITH 'UserKG_'][0]) as node_types
                """
                
                # ✅ 修复：简化关系查询
                rel_query = """
                MATCH ()-[r]->() 
                WHERE NOT r.kg_id IS NOT NULL
                RETURN count(r) as relation_count, 
                       collect(DISTINCT type(r)) as relation_types
                """
                
                print(f"🔍 执行默认图谱统计查询...")
                
                try:
                    node_result = graph.run(node_query).data()
                    print(f"📊 节点统计查询成功")
                except Exception as e:
                    print(f"❌ 节点统计查询失败: {e}")
                    # 降级查询
                    node_query_fallback = """
                    MATCH (n) 
                    WHERE n.name IS NOT NULL
                    RETURN count(n) as node_count, 
                           collect(DISTINCT labels(n)[0]) as node_types
                    """
                    node_result = graph.run(node_query_fallback).data()
                
                try:
                    rel_result = graph.run(rel_query).data()
                    print(f"🔗 关系统计查询成功")
                except Exception as e:
                    print(f"❌ 关系统计查询失败: {e}")
                    # 降级查询
                    rel_query_fallback = """
                    MATCH ()-[r]->() 
                    RETURN count(r) as relation_count, 
                           collect(DISTINCT type(r)) as relation_types
                    """
                    rel_result = graph.run(rel_query_fallback).data()
                
                if node_result and rel_result:
                    # 过滤掉None值和UserKG标签
                    node_types = [t for t in node_result[0]["node_types"] 
                                 if t and not (isinstance(t, str) and t.startswith('UserKG_'))]
                    relation_types = [t for t in rel_result[0]["relation_types"] if t]
                    
                    return jsonify({
                        'success': True,
                        'kg_id': 'default',
                        'name': '系统默认图谱',
                        'node_count': node_result[0]["node_count"],
                        'relation_count': rel_result[0]["relation_count"],
                        'node_types': node_types,
                        'relation_types': relation_types,
                        'created_time': '系统预置'
                    })
                else:
                    return jsonify({
                        'success': False,
                        'message': '无法获取默认图谱统计数据'
                    }), 500
                    
            except Exception as e:
                print(f"❌ 获取默认图谱统计失败: {e}")
                return jsonify({
                    'success': False,
                    'message': f'获取默认图谱统计失败: {str(e)}'
                }), 500
        else:
            # 原有的用户子图逻辑保持不变
            user_id = session.get('user_id', 'anonymous')
            
            # 验证权限
            conn = sqlite3.connect(KG_DB_PATH)
            cursor = conn.cursor()
            cursor.execute(
                'SELECT name FROM user_kgs WHERE kg_id = ? AND user_id = ?', 
                (kg_id, user_id)
            )
            
            result = cursor.fetchone()
            if not result:
                conn.close()
                return jsonify({'success': False, 'message': '知识图谱不存在或无权访问'}), 404
            
            kg_name = result[0]
            conn.close()
            
            # 获取子图信息
            from utils.kg.graph_builder import get_subgraph_info
            
            subgraph_info = get_subgraph_info(kg_id)
            
            if subgraph_info:
                return jsonify({
                    'success': True,
                    'kg_id': kg_id,
                    'name': kg_name,
                    **subgraph_info
                })
            else:
                return jsonify({
                    'success': False,
                    'message': '无法获取子图信息'
                }), 500
        
    except Exception as e:
        import traceback
        print("❌ 获取子图信息失败:", traceback.format_exc())
        return jsonify({'success': False, 'message': f'获取子图信息失败: {str(e)}'}), 500

# 确保上传目录存在
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# 文档上传API
@bp.route('/kg/upload_document', methods=['POST'])
def upload_document():
    """上传文档API"""
    try:
        if 'document' not in request.files:
            return jsonify({'success': False, 'message': '未找到文件'}), 400
            
        file = request.files['document']
        
        if file.filename == '':
            return jsonify({'success': False, 'message': '未选择文件'}), 400
            
        # 检查文件类型
        allowed_extensions = {'txt', 'doc', 'docx'}
        if '.' not in file.filename or \
           file.filename.rsplit('.', 1)[1].lower() not in allowed_extensions:
            return jsonify({
                'success': False, 
                'message': f'不支持的文件类型，请上传 {", ".join(allowed_extensions)} 格式的文件'
            }), 400
        
        # 生成安全的文件名和保存路径
        document_id = str(uuid.uuid4())
        secure_name = secure_filename(file.filename)
        file_extension = secure_name.rsplit('.', 1)[1].lower()
        saved_filename = f"{document_id}.{file_extension}"
        file_path = os.path.join(UPLOAD_FOLDER, saved_filename)
        
        # 保存文件
        file.save(file_path)
        
        # 获取用户ID
        user_id = session.get('user_id', 'anonymous')
        
        # 记录到数据库
        conn = sqlite3.connect(KG_DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO documents 
            (document_id, user_id, file_name, file_path, status) 
            VALUES (?, ?, ?, ?, ?)
        ''', (document_id, user_id, secure_name, file_path, 'uploaded'))
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': '文档上传成功',
            'documentId': document_id,
            'fileName': secure_name
        })
        
    except Exception as e:
        import traceback
        print("❌ 文档上传失败:", traceback.format_exc())
        return jsonify({'success': False, 'message': f'文档上传失败: {str(e)}'}), 500

# 从文档中提取知识并创建临时图谱
@bp.route('/kg/create_temp_kg', methods=['POST'])
def create_temp_kg():
    """从文档创建临时知识图谱"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': '无效的请求数据'}), 400
            
        document_id = data.get('documentId')
        document_name = data.get('documentName')
        
        if not document_id:
            return jsonify({'success': False, 'message': '文档ID不能为空'}), 400
            
        # 获取用户ID
        user_id = session.get('user_id', 'anonymous')
        
        # 验证文档存在并属于当前用户
        conn = sqlite3.connect(KG_DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            'SELECT file_path FROM documents WHERE document_id = ? AND user_id = ?', 
            (document_id, user_id)
        )
        
        result = cursor.fetchone()
        if not result:
            conn.close()
            return jsonify({'success': False, 'message': '文档不存在或无权访问'}), 404
            
        file_path = result[0]
        
        # 创建知识图谱ID
        kg_id = str(uuid.uuid4()).replace("-", "_")
        kg_name = f"KG_{document_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # 更新文档状态
        cursor.execute(
            'UPDATE documents SET status = ? WHERE document_id = ?', 
            ('processing', document_id)
        )
        conn.commit()
        
        # 在数据库中创建知识图谱记录
        cursor.execute('''
            INSERT INTO user_kgs 
            (kg_id, user_id, name, document_id, status) 
            VALUES (?, ?, ?, ?, ?)
        ''', (kg_id, user_id, kg_name, document_id, 'processing'))
        conn.commit()
        conn.close()
        
        # 使用新的知识图谱构建模块
        try:
            build_result = build_knowledge_graph_from_document(file_path, kg_id, kg_name)
            
            if build_result['success']:
                # 更新知识图谱状态和元数据
                conn = sqlite3.connect(KG_DB_PATH)
                cursor = conn.cursor()
                
                stats = build_result['stats']
                metadata = {
                    'entity_types': stats['entity_types'],
                    'node_count': stats['node_count'],
                    'relation_count': stats['relation_count'],
                    'extraction_time': datetime.now().isoformat(),
                    'document_name': document_name,
                    'subgraph': stats.get('subgraph', f"UserKG_{kg_id}")
                }
                
                cursor.execute('''
                    UPDATE user_kgs 
                    SET status = ?, node_count = ?, relation_count = ?, metadata = ?
                    WHERE kg_id = ?
                ''', ('active', stats['node_count'], stats['relation_count'], json.dumps(metadata), kg_id))
                
                # 更新文档状态
                cursor.execute(
                    'UPDATE documents SET status = ? WHERE document_id = ?', 
                    ('processed', document_id)
                )
                
                conn.commit()
                conn.close()
                
                return jsonify({
                    'success': True,
                    'message': '知识图谱创建成功',
                    'kgId': kg_id,
                    'kgName': kg_name,
                    'stats': {
                        'nodeCount': stats['node_count'],
                        'relationCount': stats['relation_count'],
                        'entityTypes': stats['entity_types'],
                        'subgraph': stats.get('subgraph')
                    }
                })
            else:
                raise Exception(build_result['message'])
                
        except Exception as e:
            # 如果知识抽取失败，更新状态
            conn = sqlite3.connect(KG_DB_PATH)
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE user_kgs SET status = ? WHERE kg_id = ?', 
                ('failed', kg_id)
            )
            cursor.execute(
                'UPDATE documents SET status = ? WHERE document_id = ?', 
                ('failed', document_id)
            )
            conn.commit()
            conn.close()
            
            import traceback
            print("❌ 知识抽取失败:", traceback.format_exc())
            return jsonify({
                'success': False,
                'message': f'知识抽取失败: {str(e)}'
            }), 500
        
    except Exception as e:
        import traceback
        print("❌ 创建知识图谱失败:", traceback.format_exc())
        return jsonify({'success': False, 'message': f'创建知识图谱失败: {str(e)}'}), 500

# 获取用户的知识图谱列表
@bp.route('/kg/list', methods=['GET'])
def get_kg_list():
    """获取用户的知识图谱列表"""
    try:
        user_id = session.get('user_id', 'anonymous')
        
        conn = sqlite3.connect(KG_DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT kg_id, name, created_at, node_count, relation_count, status, metadata
            FROM user_kgs 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        ''', (user_id,))
        
        kgs = []
        for row in cursor.fetchall():
            kg_info = {
                'kgId': row[0],
                'name': row[1],
                'createdAt': row[2],
                'nodeCount': row[3] or 0,
                'relationCount': row[4] or 0,
                'status': row[5]
            }
            
            # 解析元数据
            if row[6]:
                try:
                    metadata = json.loads(row[6])
                    kg_info.update(metadata)
                except:
                    pass
            
            kgs.append(kg_info)
        
        conn.close()
        
        return jsonify({
            'success': True,
            'kgs': kgs
        })
        
    except Exception as e:
        import traceback
        print("❌ 获取知识图谱列表失败:", traceback.format_exc())
        return jsonify({'success': False, 'message': f'获取知识图谱列表失败: {str(e)}'}), 500

@bp.route('/kg/check_connection', methods=['GET'])
def check_neo4j_connection():
    """检查Neo4j连接状态"""
    try:
        graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"))
        
        # 执行简单查询测试连接
        result = graph.run("RETURN 1 as test").data()
        
        if result and len(result) > 0:
            return jsonify({
                'success': True,
                'message': 'Neo4j连接正常',
                'status': 'connected'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Neo4j查询返回空结果',
                'status': 'query_failed'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Neo4j连接失败: {str(e)}',
            'status': 'connection_failed'
        }), 500

# LLM 相关路由
@bp.route('/llm/query_page')
def llm_query_page():
    """LLM查询页面路由（仅返回模板）"""
    return render_template('templates_lk/llm.html')

# ==================== LLM 聊天相关路由 ====================

@bp.route('/llm/conversations', methods=['GET'])
def get_conversations_api():
    """获取对话列表"""
    try:
        user_id = get_user_id()
        conversations = get_conversations(user_id)
        
        return jsonify({
            'success': True,
            'conversations': conversations
        })
    except Exception as e:
        print(f"❌ 获取对话列表API失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@bp.route('/llm/conversations', methods=['POST'])
def create_conversation_api():
    """创建新对话"""
    try:
        user_id = get_user_id()
        chat_id = create_conversation(user_id)
        
        return jsonify({
            'success': True,
            'chat_id': chat_id
        })
    except Exception as e:
        print(f"❌ 创建对话API失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@bp.route('/llm/conversations/<chat_id>', methods=['GET'])
def get_conversation_api(chat_id):
    """获取对话详情"""
    try:
        messages = get_messages(chat_id)
        return jsonify({
            'success': True,
            'messages': messages
        })
    except Exception as e:
        print(f"❌ 获取对话详情API失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@bp.route('/llm/conversations/<chat_id>', methods=['DELETE'])
def delete_conversation_api(chat_id):
    """删除对话"""
    try:
        delete_conversation(chat_id)
        return jsonify({
            'success': True,
            'message': '对话已删除'
        })
    except Exception as e:
        print(f"❌ 删除对话API失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@bp.route('/llm/conversations/<chat_id>/title', methods=['PUT'])
def update_conversation_title_api(chat_id):
    """更新对话标题"""
    try:
        data = request.get_json()
        title = data.get('title', '').strip()
        
        if not title:
            return jsonify({'success': False, 'message': '标题不能为空'}), 400
            
        update_conversation_title(chat_id, title)
        
        return jsonify({
            'success': True,
            'message': '标题更新成功'
        })
    except Exception as e:
        print(f"❌ 更新标题API失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# 流式聊天API
@bp.route('/llm/chat/stream', methods=['POST'])
def chat_stream_api():
    """真正的流式聊天API"""
    try:
        print("🚀 开始处理流式聊天请求...")
        
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': '无效的请求数据'}), 400
            
        message = data.get('message', '').strip()
        chat_id = data.get('chat_id', '').strip()
        
        print(f"📝 收到消息: {message[:50]}...")
        print(f"💬 对话ID: {chat_id}")
        
        if not message:
            return jsonify({'success': False, 'message': '消息不能为空'}), 400
            
        if not chat_id:
            return jsonify({'success': False, 'message': '对话ID不能为空'}), 400
        
        # 验证对话是否存在
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT chat_id FROM conversations WHERE chat_id = ?', (chat_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'message': '对话不存在'}), 404
        conn.close()
        
        # 添加用户消息
        add_message(chat_id, 'user', message)
        
        # 获取历史消息用于LLM调用
        messages = get_messages(chat_id)
        print(f"📚 历史消息数量: {len(messages)}")
        
        def generate_stream():
            """生成真正的流式响应"""
            try:
                print("🤖 开始流式LLM调用...")
                
                # 发送开始信号
                start_data = json.dumps({'type': 'start', 'message': 'AI正在思考...'}, ensure_ascii=False)
                yield f"data: {start_data}\n\n"
                
                # 累积的完整响应
                full_response = ""
                
                # 调用流式LLM API
                from utils.llm.llm_client import llm_client
                
                # 检查 llm_client 是否有流式方法
                if hasattr(llm_client, 'chat_completion_with_history_stream'):
                    # 调用真正的流式API
                    for content_chunk in llm_client.chat_completion_with_history_stream(
                        user_input=message,
                        chat_history=messages[:-1]  # 排除刚添加的用户消息
                    ):
                        # 添加到完整响应
                        full_response += content_chunk
                        
                        # 安全地发送内容块
                        try:
                            # 清理JSON内容
                            clean_chunk = clean_content_for_json(content_chunk)
                            content_data = json.dumps({
                                'type': 'content', 
                                'content': full_response
                            }, ensure_ascii=False)
                            yield f"data: {content_data}\n\n"
                        except Exception as json_error:
                            print(f"❌ JSON序列化失败: {json_error}")
                            continue
                else:
                    # 降级到非流式API
                    print("⚠️ 流式API不可用，使用非流式API")
                    response, _ = llm_client.chat_completion_with_history(
                        user_input=message,
                        chat_history=messages[:-1]
                    )
                    full_response = response
                    
                    # 模拟流式输出
                    words = full_response.split()
                    current_text = ""
                    for word in words:
                        current_text += word + " "
                        content_data = json.dumps({
                            'type': 'content', 
                            'content': current_text.strip()
                        }, ensure_ascii=False)
                        yield f"data: {content_data}\n\n"
                        time.sleep(0.05)  # 模拟打字效果
                
                # 保存AI回复到数据库
                add_message(chat_id, 'assistant', full_response)
                
                # 如果是第一轮对话，更新对话标题
                if len(messages) <= 1:
                    title = message[:20] + ('...' if len(message) > 20 else '')
                    update_conversation_title(chat_id, title)
                    print(f"📝 更新对话标题: {title}")
                
                # 发送完成信号
                done_data = json.dumps({'type': 'done', 'content': full_response}, ensure_ascii=False)
                yield f"data: {done_data}\n\n"
                
                print("✅ 流式聊天请求处理完成")
                
            except Exception as e:
                print(f"❌ 流式生成失败: {e}")
                error_msg = f"抱歉，出现了错误: {str(e)}"
                error_data = json.dumps({'type': 'error', 'content': error_msg}, ensure_ascii=False)
                yield f"data: {error_data}\n\n"
        
        # 返回流式响应
        return Response(
            generate_stream(),
            mimetype='text/event-stream',  # 使用标准的SSE MIME类型
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control',
                'X-Accel-Buffering': 'no'  # 禁用Nginx缓冲
            }
        )
        
    except Exception as e:
        print(f"❌ 流式聊天API失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'服务器错误: {str(e)}'}), 500

# 非流式聊天API（备用）
@bp.route('/llm/chat', methods=['POST'])
def chat_api():
    """非流式聊天API"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': '无效的请求数据'}), 400
            
        message = data.get('message', '').strip()
        chat_id = data.get('chat_id', '').strip()
        
        if not message:
            return jsonify({'success': False, 'message': '消息不能为空'}), 400
            
        if not chat_id:
            return jsonify({'success': False, 'message': '对话ID不能为空'}), 400
        
        # 验证对话是否存在
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT chat_id FROM conversations WHERE chat_id = ?', (chat_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'message': '对话不存在'}), 404
        conn.close()
        
        # 添加用户消息
        add_message(chat_id, 'user', message)
        
        # 获取历史消息
        messages = get_messages(chat_id)
        
        # 调用LLM
        from utils.llm.llm_client import llm_client
        response, _ = llm_client.chat_completion_with_history(
            user_input=message,
            chat_history=messages[:-1]
        )
        
        # 保存AI回复
        add_message(chat_id, 'assistant', response)
        
        # 如果是第一轮对话，更新标题
        if len(messages) <= 1:
            title = message[:20] + ('...' if len(message) > 20 else '')
            update_conversation_title(chat_id, title)
        
        return jsonify({
            'success': True,
            'response': response,
            'message': '回复成功'
        })
        
    except Exception as e:
        print(f"❌ 聊天API失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'服务器错误: {str(e)}'}), 500

# ==================== 辅助模板路由 ====================

@bp.route('/chat')
def chat_page():
    """聊天页面路由"""
    return render_template('templates_lk/chat.html')

@bp.route('/llm')
def llm_page():
    """LLM页面路由"""
    return render_template('templates_lk/llm.html')

@bp.route('/query')  
def query_page():
    """通用查询页面路由"""
    return render_template('templates_lk/query.html')