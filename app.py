from flask import redirect, url_for, session, g
from database import UserModel
from app_init import *


@app.route('/')
def index():
    return redirect(url_for("user.login"))


@app.before_request
def before_request():
    username = session.get("user")
    if username:
        # 给全局变量g绑定参数
        # setattr(g, "user", user)
        g.user = username


if __name__ == '__main__':
    print("🚀 启动Flask应用...")
    print(f"📡 监听端口: 5001")
    
    # 其他调试输出...
    
    # 关闭debug模式，避免自动重启
    app.run(host='0.0.0.0', port=5001, debug=False)
