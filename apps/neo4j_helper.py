import subprocess
import time
import logging
import os
from neo4j import GraphDatabase
from utils.kg.nlp_utils import process_question_with_llm  # 替换为新方法

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


def perform_query(query_text):
    """执行查询并返回结果，整合了转换和执行的流程"""
    cypher_query = process_question_with_llm(query_text)
    if not cypher_query:
        logger.error(f"无法将查询文本 {query_text} 转换为Cypher查询语句")
        return None
    try:
        driver = GraphDatabase.driver("bolt://localhost:7687", max_connection_lifetime=60 * 60,
                                      max_connection_pool_size=50)
        with driver.session() as session:
            result = session.run(cypher_query)
            results = [record for record in result]
        return results
    except Exception as e:
        logger.error(f"执行查询 {cypher_query} 时出现错误: {str(e)}")
        return None