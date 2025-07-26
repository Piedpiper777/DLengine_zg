from flask import Blueprint, render_template, request, jsonify, session, Response
from apps.neo4j_helper import start_neo4j, perform_query
from utils.kg.response_utils import handle_error_response
from utils.kg.nlp_utils import process_question_for_both
from apps.llm import llm_client  
from py2neo import Graph
import uuid
import sqlite3
import json
import os
from datetime import datetime
import time

# 创建蓝图
bp = Blueprint('search', __name__)

# 数据库文件路径
DB_PATH = os.path.join(os.getcwd(), 'chat_data.db')

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

# ==================== 路由定义 ====================

# KG 相关路由
@bp.route('/kg/query_page')
def kg_query_page():
    start_neo4j()
    return render_template('templates_lk/kg.html')

@bp.route('/kg/kg_search', methods=['POST'])
def kg_search():
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

# LLM 相关路由
@bp.route('/llm/query_page')
def llm_query_page():
    """LLM 查询页面"""
    return render_template('templates_lk/llm.html')

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

def clean_content_for_json(content):
    """清理内容以确保JSON安全"""
    if not content:
        return ""
    
    try:
        content = str(content)
        
        # 移除控制字符
        import re
        content = re.sub(r'[\x00-\x1F\x7F]', '', content)
        
        # 确保UTF-8编码
        content = content.encode('utf-8', 'ignore').decode('utf-8')
        
        return content
    except Exception as e:
        print(f"❌ 内容清理失败: {e}")
        return "内容处理错误"