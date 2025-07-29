import subprocess
import time
import logging
import os
from neo4j import GraphDatabase
from utils.kg.nlp_utils import process_question_with_llm  # 替换为新方法
from py2neo import Graph, NodeMatcher

# Neo4j相关配置信息，根据实际路径修改
NEO4J_INSTALL_PATH = "/home/zhanggu/MyDoc/DLsystem/neo4j5.26.4"
NEO4J_BIN_PATH = os.path.join(NEO4J_INSTALL_PATH, "bin")
# 启动Neo4j服务的命令，指定完整路径及参数
NEO4J_START_COMMAND = [os.path.join(NEO4J_BIN_PATH, "neo4j"), "start"]
# 检查Neo4j服务状态的命令，指定完整路径及参数
NEO4J_STATUS_COMMAND = [os.path.join(NEO4J_BIN_PATH, "neo4j"), "status"]
# Neo4j日志文件路径
NEO4J_LOG_PATH = os.path.join(NEO4J_INSTALL_PATH, "logs")

# 配置日志基本信息（主要用于记录应用相关操作情况，可按需调整）
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    filename=os.path.join(NEO4J_LOG_PATH, 'app_neo4j_management.log'))

# 创建一个控制台输出的日志处理器
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)

# 将控制台处理器添加到根日志记录器
logger = logging.getLogger()
logger.addHandler(console_handler)


def check_neo4j_status():
    """检查Neo4j服务状态"""
    try:
        result = subprocess.run(NEO4J_STATUS_COMMAND, capture_output=True, text=True)
        output = result.stdout.strip()
        running_status_markers = {
            "Neo4j is running at pid": True,
            "Neo4j is not running": False
        }
        for marker, status in running_status_markers.items():
            if marker in output:
                return status
        logger.warning(f"无法准确判断Neo4j服务状态，命令输出: {output}")
        return False
    except subprocess.CalledProcessError:
        logger.error("执行检查Neo4j服务状态命令时出错")
        return False


def start_neo4j():
    """启动Neo4j服务"""
    if check_neo4j_status():
        logger.info("Neo4j服务已处于运行状态，无需再次启动。")
        return
    try:
        subprocess.run(NEO4J_START_COMMAND, check=True)
        time.sleep(5)
        if not check_neo4j_status():
            raise RuntimeError("尝试启动Neo4j，但服务未能成功启动，请检查相关日志。")
        logger.info("Neo4j服务已成功启动。")
    except subprocess.CalledProcessError as e:
        logger.error(f"启动Neo4j时出现错误: {str(e)}")

def get_neo4j_connection():
    """获取Neo4j连接，使用py2neo支持的参数"""
    try:
        graph = Graph(
            "bolt://localhost:7687", 
            auth=("neo4j", "3080neo4j"), 
            secure=False,
            # 移除所有不支持的连接池参数
        )
        return graph
    except Exception as e:
        print(f"❌ Neo4j连接失败: {e}")
        raise

def execute_query_with_retry(cypher_query, max_retries=3):
    """执行查询并支持重试 - 简化版本"""
    import time
    
    for attempt in range(max_retries):
        try:
            # 使用简化的连接配置
            graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"), secure=False)
            result = graph.run(cypher_query).data()
            return result
        except Exception as e:
            print(f"❌ 查询执行失败 (尝试 {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # 指数退避
            else:
                raise e

def perform_query(cypher_query):
    """执行Cypher查询 - 简化版本"""
    try:
        # 确保查询只有一个语句
        if ';' in cypher_query:
            queries = [q.strip() for q in cypher_query.split(';') if q.strip()]
            if len(queries) > 1:
                print(f"⚠️ 检测到多个查询语句，只执行第一个: {queries[0]}")
                cypher_query = queries[0]
        
        # 使用简化的连接方式
        graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"), secure=False)
        result = graph.run(cypher_query).data()
        
        print(f"✅ 查询执行成功，返回 {len(result)} 条结果")
        return result
        
    except Exception as e:
        print(f"❌ 执行查询 {cypher_query} 时出现错误: {e}")
        raise e