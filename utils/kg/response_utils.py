from flask import jsonify

def handle_error_response(error_message, error_code=None):
    """处理错误响应并返回详细错误信息"""
    return jsonify({
        'message': error_message,
        'results': None,
        'error_code': error_code
    })
