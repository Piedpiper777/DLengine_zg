from flask import Blueprint, render_template, request, jsonify

# 创建名为'llm'的蓝图，设置前缀为'/llm'
bp = Blueprint('llm', __name__, url_prefix='/llm')

@bp.route('/query_page')
def query_page():
    """LLM 查询页面"""
    return render_template('templates_lk/llm.html')

@bp.route('/llm_chat', methods=['POST'])
def llm_chat():
    """LLM 聊天接口"""
    try:
        query_text = request.form.get('query_text')
        if not query_text:
            return jsonify({'message': '请输入查询内容'}), 400
        
        # TODO: 这里后续添加 LLM 调用逻辑
        # 暂时返回模拟响应
        response = f"这是对您问题 '{query_text}' 的回答。（模拟响应）"
        
        return jsonify({
            'response': response,
            'query': query_text,
            'success': True
        })
        
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'message': f'后端异常: {str(e)}'}), 500