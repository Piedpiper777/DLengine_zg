from openai import OpenAI

# 配置你的 DeepSeek API Key
client = OpenAI(
    api_key="sk-", 
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

def process_question_for_both(question):
    """
    同时生成答案查询和可视化查询
    :param question: 用户输入的问题
    :return: (答案查询, 可视化查询)
    """
    answer_cypher = process_question_with_llm(question)
    visualization_cypher = generate_visualization_cypher(question)
    return answer_cypher, visualization_cypher

# 示例用法
if __name__ == "__main__":
    question = "齿轮的材质是什么？"
    answer_cypher, vis_cypher = process_question_for_both(question)
    print("答案查询Cypher语句：", answer_cypher)
    print("可视化查询Cypher语句：", vis_cypher)