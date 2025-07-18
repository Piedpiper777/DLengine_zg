from flask import Blueprint, render_template, request, jsonify
from apps.neo4j_helper import start_neo4j, perform_query
from utils.kg.response_utils import handle_error_response
from utils.kg.nlp_utils import process_question_for_both  # 导入新方法
from py2neo import Graph

# 创建名为'search'的蓝图，设置前缀为'/kg'
bp = Blueprint('search', __name__, url_prefix='/kg')

@bp.route('/query_page')
def query_page():
    start_neo4j()  # 初始化 Neo4j 连接或其他必要的操作
    return render_template('templates_kg/search.html')

@bp.route('/kg_search', methods=['POST'])
def kg_search():
    try:
        query_text = request.form.get('query_text')
        if not query_text:
            return jsonify({'message': '请输入查询内容'}), 400

        # 同时生成答案查询和可视化查询
        cypher_query, cypher_query_vs = process_question_for_both(query_text)
        
        if not cypher_query:
            return jsonify({'message': '未能生成有效的Cypher语句'}), 500

        graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"))
        
        # 执行答案查询
        results = graph.run(cypher_query)
        text_results = []
        
        for record in results:
            text_results.append(dict(record))

        # 执行可视化查询获取节点和关系信息
        viz_results = graph.run(cypher_query_vs)
        nodes = []
        relationships = []
        
        for record in viz_results:
            # 处理节点
            for key in ['m', 'n']:
                node = record.get(key)
                if node:
                    node_info = {
                        'label': list(node.labels)[0] if node.labels else 'Unknown',
                        'name': node.get('name', '未知')
                    }
                    if node_info not in nodes:
                        nodes.append(node_info)
            
            # 处理关系
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
            'cypher_query': cypher_query,  # 答案查询
            'cypher_query_vs': cypher_query_vs,  # 可视化查询
            'queryResults': {
                'nodes': nodes,
                'relationships': relationships
            }
        })
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'message': f'后端异常: {str(e)}'}), 500
