from openai import OpenAI

# 配置你的 DeepSeek API Key
client = OpenAI(
    api_key="sk-45386d94f2ef4bb7ae0d8d448bfec47d", 
    base_url="https://api.deepseek.com"
)

# 可选：实体和关系类型，便于大模型理解你的知识图谱结构
ENTITY_TYPES = "齿轮、检测工具、传动比、离合器、油位、轴承、发动机"
RELATION_TYPES = "材质、检测工具、功率参数、寿命、故障类型"

def generate_cypher_with_llm(question, query_type="answer"):
    """
    调用大模型API，将自然语言问题转为Cypher查询语句
    :param question: 用户输入的问题
    :param query_type: 查询类型，"answer"用于获取答案，"visualization"用于可视化
    :return: Cypher查询语句
    """
    if query_type == "answer":
        prompt = (
            f"你是一个知识图谱问答助手。请根据下列实体类型和关系类型，将用户问题转换为Cypher查询语句。\n"
            f"实体类型：{ENTITY_TYPES}\n"
            f"关系类型：{RELATION_TYPES}\n"
            f"问题：{question}\n"
            f"只输出Cypher语句，不要输出任何其他内容。"
        )
    elif query_type == "visualization":
        prompt = (
            f"你是一个知识图谱可视化助手。请根据下列实体类型和关系类型，将用户问题转换为用于图形可视化的Cypher查询语句。\n"
            f"实体类型：{ENTITY_TYPES}\n"
            f"关系类型：{RELATION_TYPES}\n"
            f"问题：{question}\n"
            f"要求：\n"
            f"1. 查询结果必须包含节点和关系，格式为 MATCH (m)-[r]->(n) RETURN m,r,n\n"
            f"2. 限制结果数量在50以内，避免图形过于复杂\n"
            f"3. 优先显示与问题相关的实体和关系\n"
            f"只输出Cypher语句，不要输出任何其他内容。"
        )
    else:
        raise ValueError("query_type must be 'answer' or 'visualization'")
    
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": "You are a helpful assistant"},
            {"role": "user", "content": prompt},
        ],
        stream=False
    )
    return response.choices[0].message.content.strip()

def process_question_with_llm(question):
    """
    用大模型API生成用于获取答案的Cypher查询语句
    :param question: 用户输入的问题
    :return: Cypher查询语句
    """
    cypher = generate_cypher_with_llm(question, "answer")
    return cypher

def generate_visualization_cypher(question):
    """
    用大模型API生成用于可视化的Cypher查询语句
    :param question: 用户输入的问题
    :return: 用于可视化的Cypher查询语句
    """
    cypher = generate_cypher_with_llm(question, "visualization")
    return cypher

# 如果 nlp_utils.py 中有Neo4j连接代码，确保使用简单配置：
def process_question_for_both(question):
    """
    同时生成答案查询和可视化查询
    :param question: 用户输入的问题
    :return: (答案查询, 可视化查询)
    """
    # 生成答案查询
    answer_cypher = process_question_with_llm(question)
    
    # 清理答案查询，确保只有一个查询
    if isinstance(answer_cypher, str) and ';' in answer_cypher:
        queries = [q.strip() for q in answer_cypher.split(';') if q.strip()]
        if len(queries) > 1:
            print(f"⚠️ 检测到多个查询，只返回第一个: {queries[0]}")
            answer_cypher = queries[0]
    
    # 生成可视化查询
    visualization_cypher = generate_visualization_cypher(question)
    
    # 清理可视化查询
    if isinstance(visualization_cypher, str) and ';' in visualization_cypher:
        queries = [q.strip() for q in visualization_cypher.split(';') if q.strip()]
        if len(queries) > 1:
            print(f"⚠️ 可视化查询检测到多个语句，只返回第一个: {queries[0]}")
            visualization_cypher = queries[0]
    
    print(f"📊 生成答案查询: {answer_cypher}")
    print(f"🎨 生成可视化查询: {visualization_cypher}")
    
    return answer_cypher, visualization_cypher

# 示例用法
if __name__ == "__main__":
    question = "齿轮的材质是什么？"
    answer_cypher = process_question_for_both(question)
    print("答案查询Cypher语句：", answer_cypher)