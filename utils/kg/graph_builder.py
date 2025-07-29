"""
知识图谱构建模块
用于从文档文本中提取知识并构建图谱
"""

import os
import json
import re
import uuid
import sqlite3
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from py2neo import Graph
import docx

from utils.llm.llm_client import llm_client

# ==================== 数据模型定义 ====================

class Property(BaseModel):
    """知识图谱中的属性，由键和值组成"""
    key: str = Field(..., description="属性的键名")
    value: str = Field(..., description="属性的值")

class Node(BaseModel):
    """知识图谱中的节点，代表实体"""
    id: str = Field(..., description="节点唯一标识符")
    type: str = Field(..., description="节点类型")
    properties: Optional[List[Property]] = Field(
        None, description="节点属性列表"
    )

class Relationship(BaseModel):
    """知识图谱中的关系，连接两个节点"""
    source: Node = Field(..., description="关系的起始节点")
    target: Node = Field(..., description="关系的目标节点")
    type: str = Field(..., description="关系类型")
    properties: Optional[List[Property]] = Field(
        None, description="关系属性列表"
    )

class KnowledgeGraph(BaseModel):
    """完整的知识图谱结构"""
    nodes: List[Node] = Field(..., description="图谱中的所有节点")
    rels: List[Relationship] = Field(..., description="图谱中的所有关系")

# ==================== 辅助函数 ====================

def format_property_key(s: str) -> str:
    """格式化属性键名，转换为驼峰命名"""
    words = s.split()
    if not words:
        return s
    first_word = words[0].lower()
    capitalized_words = [word.capitalize() for word in words[1:]]
    return "".join([first_word] + capitalized_words)

def props_to_dict(props) -> dict:
    """将属性列表转换为字典"""
    properties = {}
    if not props:
        return properties
    for p in props:
        properties[format_property_key(p.key)] = p.value
    return properties

def normalize_relation_name(relation):
    """规范化关系名称，去除特殊字符并将空格替换为下划线"""
    # 移除特殊字符
    normalized = re.sub(r'[^\w\s]', '', relation)
    # 将空格替换为下划线
    normalized = re.sub(r'\s+', '_', normalized)
    # 确保非空
    if not normalized:
        normalized = 'relates_to'
    return normalized

def chunk_text(text, max_chunk_size=8000, overlap=500):
    """将长文本分成多个块，带有重叠以保持上下文"""
    if len(text) <= max_chunk_size:
        return [text]
    
    chunks = []
    start = 0
    
    while start < len(text):
        end = min(start + max_chunk_size, len(text))
        
        # 如果不是最后一个块，尝试在一个自然的断点处分割
        if end < len(text):
            # 尝试在段落结束处分割
            paragraph_end = text.rfind('\n\n', start, end)
            if paragraph_end != -1 and paragraph_end > start + max_chunk_size // 2:
                end = paragraph_end + 2  # +2 to include the newlines
            else:
                # 尝试在句子结束处分割
                sentence_end = text.rfind('. ', start, end)
                if sentence_end != -1 and sentence_end > start + max_chunk_size // 2:
                    end = sentence_end + 2  # +2 to include the period and space
        
        chunks.append(text[start:end])
        
        # 移动起点，考虑重叠
        start = end - overlap if end < len(text) else len(text)
    
    return chunks

def normalize_node_type(node_type):
    """规范化节点类型名称，确保Neo4j兼容"""
    # 移除或替换特殊字符
    normalized = re.sub(r'[^\w\u4e00-\u9fff]', '_', node_type)  # 保留中文字符
    # 确保不以数字开头
    if normalized and normalized[0].isdigit():
        normalized = 'Type_' + normalized
    # 确保非空
    if not normalized:
        normalized = 'Unknown'
    return normalized

# ==================== JSON 处理函数 ====================

def complete_truncated_json(json_str):
    """尝试补全被截断的JSON"""
    print(f"🔧 尝试补全JSON: {json_str[-50:]}")
    
    # 计算括号平衡
    open_braces = json_str.count('{') - json_str.count('}')
    open_brackets = json_str.count('[') - json_str.count(']')
    
    # 补全缺失的括号
    completion = ''
    if open_brackets > 0:
        completion += ']' * open_brackets
    if open_braces > 0:
        completion += '}' * open_braces
    
    completed = json_str + completion
    print(f"🔧 补全后的JSON: {completed}")
    return completed

def fix_json_format_advanced(json_str):
    """高级JSON格式修复"""
    try:
        print("🔧 开始高级JSON修复...")
        
        # 移除可能的前后缀
        json_str = re.sub(r'^.*?({.*}).*?$', r'\1', json_str, flags=re.DOTALL)
        
        # 替换单引号为双引号（更精确的匹配）
        json_str = re.sub(r"'([^']*?)'(\s*:)", r'"\1"\2', json_str)  # 键
        json_str = re.sub(r":\s*'([^']*?)'", r': "\1"', json_str)    # 值
        
        # 修复Python布尔值和None
        json_str = re.sub(r'\bFalse\b', 'false', json_str)
        json_str = re.sub(r'\bTrue\b', 'true', json_str)
        json_str = re.sub(r'\bNone\b', 'null', json_str)
        
        # 修复缺失的逗号
        # 在 } 后面跟着 { 的情况
        json_str = re.sub(r'}\s*(\n\s*){', '},\n{', json_str)
        # 在 ] 后面跟着 { 的情况
        json_str = re.sub(r']\s*(\n\s*){', '],\n{', json_str)
        # 在 } 后面跟着 [ 的情况
        json_str = re.sub(r'}\s*(\n\s*)\[', '},\n[', json_str)
        
        # 修复对象内缺失的逗号
        json_str = re.sub(r'([}\]])\s*\n\s*"', r'\1,\n"', json_str)
        
        print(f"🔧 高级修复后的JSON: {json_str}")
        return json_str
        
    except Exception as e:
        print(f"❌ 高级JSON修复失败: {e}")
        return None

def request_complete_json():
    """重新请求LLM生成完整的JSON"""
    try:
        print("🤖 重新请求LLM生成完整JSON...")
        
        fix_prompt = """
请生成一个完整的知识图谱JSON，包含nodes和rels两个字段。

要求：
1. 必须是完整的、有效的JSON格式
2. 包含"nodes"数组和"rels"数组
3. 如果没有关系，rels可以是空数组[]
4. 每个节点必须有id、type、properties字段
5. 确保JSON完整，不要被截断

请生成一个关于发动机的简单知识图谱示例：

只返回JSON，不要任何其他内容：
"""
        
        fix_response, _ = llm_client.chat_completion(fix_prompt)
        
        # 清理响应
        fixed_json = fix_response.strip()
        if '```' in fixed_json:
            json_match = re.search(r'```(?:json)?(.*?)```', fixed_json, re.DOTALL)
            if json_match:
                fixed_json = json_match.group(1).strip()
        
        print(f"🤖 重新生成的JSON: {fixed_json}")
        return json.loads(fixed_json)
        
    except Exception as e:
        print(f"❌ 重新生成JSON失败: {e}")
        return None

def extract_json_from_response(response):
    """从LLM响应中提取JSON部分（完全重写版）"""
    print(f"🔍 原始LLM响应长度: {len(response)} 字符")
    print(f"🔍 原始LLM响应: {response}")
    
    # 尝试寻找JSON代码块
    json_match = re.search(r'```(?:json)?(.*?)```', response, re.DOTALL)
    if json_match:
        json_str = json_match.group(1).strip()
        print("📄 找到JSON代码块")
    else:
        # 尝试直接解析整个响应
        json_str = response.strip()
        print("📄 使用整个响应作为JSON")
    
    # 如果JSON字符串被截断，尝试补全
    if not json_str.endswith('}') and not json_str.endswith(']'):
        print("⚠️ JSON可能被截断，尝试补全...")
        json_str = complete_truncated_json(json_str)
    
    # 尝试解析JSON
    try:
        print(f"🧹 准备解析的JSON: {json_str}")
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"❌ JSON解析失败: {e}")
        print(f"🔍 错误位置: {e.pos}, 错误行列: line {e.lineno} column {e.colno}")
        
        # 尝试修复JSON
        fixed_json = fix_json_format_advanced(json_str)
        if fixed_json:
            try:
                print(f"🔧 尝试解析修复后的JSON: {fixed_json}")
                return json.loads(fixed_json)
            except json.JSONDecodeError as e2:
                print(f"❌ 修复后JSON仍然失败: {e2}")
        
        # 最后尝试：重新请求LLM生成完整JSON
        return request_complete_json()

# ==================== 知识图谱提取函数 ====================

def extract_knowledge_graph_from_text(document_text):
    """从文本中提取结构化知识图谱（改进版）"""
    
    # 使用更明确的提示，强调properties格式
    prompt = f"""
请从以下文本中提取知识图谱，返回JSON格式。

文本：{document_text[:2000]}

请严格按照以下格式返回JSON，不要添加任何解释：

{{
  "nodes": [
    {{
      "id": "实体名称", 
      "type": "实体类型", 
      "properties": [
        {{"key": "属性名", "value": "属性值"}}
      ]
    }}
  ],
  "rels": [
    {{
      "source": {{"id": "源实体", "type": "源类型", "properties": []}}, 
      "target": {{"id": "目标实体", "type": "目标类型", "properties": []}}, 
      "type": "关系类型",
      "properties": []
    }}
  ]
}}

重要格式要求：
1. 实体类型只能是：设备、部件、技术、材料、过程、参数、组织、地点
2. properties 必须是对象数组，每个对象包含 "key" 和 "value" 字段
3. 如果没有属性，properties 设为空数组 []
4. 如果没有关系，rels 设为空数组 []

只返回有效的JSON，确保完整：
"""
    
    # 调用LLM
    try:
        print("🤖 调用LLM提取知识图谱...")
        response, _ = llm_client.chat_completion(prompt)
        
        # 解析响应中的JSON
        kg_data = extract_json_from_response(response)
        if not kg_data:
            print("❌ 无法从LLM响应中提取有效的JSON，尝试降级策略")
            return extract_simple_entities(document_text)
        
        # ✅ 使用改进的验证函数
        if not validate_kg_structure(kg_data):
            print("❌ JSON结构验证失败，尝试降级策略")
            return extract_simple_entities(document_text)
            
        # 转换为结构化数据
        try:
            knowledge_graph = KnowledgeGraph.parse_obj(kg_data)
            print(f"✅ 成功提取知识图谱: {len(knowledge_graph.nodes)}个节点, {len(knowledge_graph.rels)}个关系")
            return knowledge_graph
        except Exception as e:
            print(f"❌ Pydantic验证失败: {e}")
            print("🔧 尝试再次修复数据格式...")
            # 再次尝试修复
            if validate_kg_structure(kg_data):
                try:
                    knowledge_graph = KnowledgeGraph.parse_obj(kg_data)
                    print(f"✅ 修复后成功创建知识图谱: {len(knowledge_graph.nodes)}个节点")
                    return knowledge_graph
                except Exception as e2:
                    print(f"❌ 修复后仍然失败: {e2}")
            return extract_simple_entities(document_text)
            
    except Exception as e:
        print(f"❌ 知识图谱提取失败: {e}")
        return extract_simple_entities(document_text)

def validate_kg_structure(kg_data):
    """验证知识图谱数据结构"""
    if not isinstance(kg_data, dict):
        print("❌ 不是字典类型")
        return False
        
    if 'nodes' not in kg_data:
        print("❌ 缺少nodes字段")
        return False
        
    if 'rels' not in kg_data:
        print("⚠️ 缺少rels字段，添加空数组")
        kg_data['rels'] = []
    
    if not isinstance(kg_data['nodes'], list):
        print("❌ nodes不是数组")
        return False
        
    if not isinstance(kg_data['rels'], list):
        print("❌ rels不是数组")
        kg_data['rels'] = []
    
    # 验证和修复节点结构
    for i, node in enumerate(kg_data['nodes']):
        if not isinstance(node, dict):
            print(f"❌ 节点{i}不是字典")
            return False
        if 'id' not in node:
            print(f"❌ 节点{i}缺少id字段")
            return False
        if 'type' not in node:
            print(f"⚠️ 节点{i}缺少type字段，设为默认值")
            node['type'] = '实体'
        
        # ✅ 修复 properties 字段格式
        if 'properties' not in node:
            node['properties'] = []
        else:
            # 如果 properties 是字符串列表，转换为 Property 对象列表
            if isinstance(node['properties'], list):
                fixed_properties = []
                for j, prop in enumerate(node['properties']):
                    if isinstance(prop, str):
                        # 字符串转换为 Property 对象格式
                        fixed_properties.append({
                            "key": f"description_{j}",
                            "value": prop
                        })
                        print(f"🔧 修复节点{i}的属性{j}: '{prop}' -> {{key: 'description_{j}', value: '{prop}'}}")
                    elif isinstance(prop, dict) and 'key' in prop and 'value' in prop:
                        # 已经是正确格式
                        fixed_properties.append(prop)
                    else:
                        # 其他格式，尝试转换
                        try:
                            fixed_properties.append({
                                "key": "property",
                                "value": str(prop)
                            })
                            print(f"🔧 修复节点{i}的属性{j}: {prop} -> {{key: 'property', value: '{str(prop)}'}}")
                        except:
                            print(f"⚠️ 跳过节点{i}的无效属性{j}: {prop}")
                
                node['properties'] = fixed_properties
            else:
                # properties 不是列表，重置为空列表
                print(f"⚠️ 节点{i}的properties不是列表，重置为空")
                node['properties'] = []
    
    # 验证关系结构
    valid_rels = []
    for i, rel in enumerate(kg_data['rels']):
        if not isinstance(rel, dict):
            print(f"⚠️ 关系{i}不是字典，跳过")
            continue
            
        if not all(key in rel for key in ['source', 'target', 'type']):
            print(f"⚠️ 关系{i}缺少必需字段，跳过")
            continue
            
        # 验证并修复source和target
        for field in ['source', 'target']:
            if not isinstance(rel[field], dict) or 'id' not in rel[field]:
                print(f"⚠️ 关系{i}的{field}格式错误，跳过")
                break
            if 'type' not in rel[field]:
                rel[field]['type'] = '实体'
            # 确保source和target也有正确的properties格式
            if 'properties' not in rel[field]:
                rel[field]['properties'] = []
        else:
            # 修复关系的properties
            if 'properties' not in rel:
                rel['properties'] = []
            elif isinstance(rel['properties'], list):
                fixed_rel_properties = []
                for j, prop in enumerate(rel['properties']):
                    if isinstance(prop, str):
                        fixed_rel_properties.append({
                            "key": f"description_{j}",
                            "value": prop
                        })
                    elif isinstance(prop, dict) and 'key' in prop and 'value' in prop:
                        fixed_rel_properties.append(prop)
                    else:
                        try:
                            fixed_rel_properties.append({
                                "key": "property",
                                "value": str(prop)
                            })
                        except:
                            continue
                rel['properties'] = fixed_rel_properties
            else:
                rel['properties'] = []
            
            valid_rels.append(rel)
    
    kg_data['rels'] = valid_rels
    return True

# 同时优化 extract_simple_entities 函数的提示，避免生成错误格式：

def extract_simple_entities(document_text):
    """简单的实体提取作为降级策略"""
    print("🔄 使用降级策略：简单实体提取")
    
    prompt = f"""
从以下文本中提取重要实体，返回简单的JSON：

文本：{document_text[:1000]}

返回格式（严格按照此格式）：
{{
  "nodes": [
    {{"id": "活塞式发动机", "type": "设备", "properties": []}},
    {{"id": "气缸", "type": "部件", "properties": []}},
    {{"id": "活塞", "type": "部件", "properties": []}}
  ],
  "rels": []
}}

重要说明：
1. properties 必须是空数组 []，不要添加任何内容
2. 只提取实体，不提取关系
3. 实体类型只能是：设备、部件、技术、材料
4. 确保JSON格式完全正确

只返回JSON，不要任何解释：
"""
    
    try:
        response, _ = llm_client.chat_completion(prompt)
        
        # 简单的JSON提取
        json_str = response.strip()
        if '```' in json_str:
            json_match = re.search(r'```(?:json)?(.*?)```', json_str, re.DOTALL)
            if json_match:
                json_str = json_match.group(1).strip()
        
        # 确保JSON完整
        if not json_str.endswith('}'):
            json_str = complete_truncated_json(json_str)
        
        kg_data = json.loads(json_str)
        
        # 确保有rels字段
        if 'rels' not in kg_data:
            kg_data['rels'] = []
            
        # ✅ 应用新的验证和修复逻辑
        if validate_kg_structure(kg_data):
            return KnowledgeGraph.parse_obj(kg_data)
            
    except Exception as e:
        print(f"❌ 简单实体提取也失败: {e}")
    
    # 最后的降级策略：创建基本的图谱
    return create_basic_kg(document_text)

# 同时优化主要的提取函数，改进提示格式：

def extract_knowledge_graph_from_text(document_text):
    """从文本中提取结构化知识图谱（改进版）"""
    
    # 使用更明确的提示，强调properties格式
    prompt = f"""
请从以下文本中提取知识图谱，返回JSON格式。

文本：{document_text[:2000]}

请严格按照以下格式返回JSON，不要添加任何解释：

{{
  "nodes": [
    {{
      "id": "实体名称", 
      "type": "实体类型", 
      "properties": [
        {{"key": "属性名", "value": "属性值"}}
      ]
    }}
  ],
  "rels": [
    {{
      "source": {{"id": "源实体", "type": "源类型", "properties": []}}, 
      "target": {{"id": "目标实体", "type": "目标类型", "properties": []}}, 
      "type": "关系类型",
      "properties": []
    }}
  ]
}}

重要格式要求：
1. 实体类型只能是：设备、部件、技术、材料、过程、参数、组织、地点
2. properties 必须是对象数组，每个对象包含 "key" 和 "value" 字段
3. 如果没有属性，properties 设为空数组 []
4. 如果没有关系，rels 设为空数组 []

只返回有效的JSON，确保完整：
"""
    
    # 调用LLM
    try:
        print("🤖 调用LLM提取知识图谱...")
        response, _ = llm_client.chat_completion(prompt)
        
        # 解析响应中的JSON
        kg_data = extract_json_from_response(response)
        if not kg_data:
            print("❌ 无法从LLM响应中提取有效的JSON，尝试降级策略")
            return extract_simple_entities(document_text)
        
        # ✅ 使用改进的验证函数
        if not validate_kg_structure(kg_data):
            print("❌ JSON结构验证失败，尝试降级策略")
            return extract_simple_entities(document_text)
            
        # 转换为结构化数据
        try:
            knowledge_graph = KnowledgeGraph.parse_obj(kg_data)
            print(f"✅ 成功提取知识图谱: {len(knowledge_graph.nodes)}个节点, {len(knowledge_graph.rels)}个关系")
            return knowledge_graph
        except Exception as e:
            print(f"❌ Pydantic验证失败: {e}")
            print("🔧 尝试再次修复数据格式...")
            # 再次尝试修复
            if validate_kg_structure(kg_data):
                try:
                    knowledge_graph = KnowledgeGraph.parse_obj(kg_data)
                    print(f"✅ 修复后成功创建知识图谱: {len(knowledge_graph.nodes)}个节点")
                    return knowledge_graph
                except Exception as e2:
                    print(f"❌ 修复后仍然失败: {e2}")
            return extract_simple_entities(document_text)
            
    except Exception as e:
        print(f"❌ 知识图谱提取失败: {e}")
        return extract_simple_entities(document_text)

def validate_kg_structure(kg_data):
    """验证知识图谱数据结构"""
    if not isinstance(kg_data, dict):
        print("❌ 不是字典类型")
        return False
        
    if 'nodes' not in kg_data:
        print("❌ 缺少nodes字段")
        return False
        
    if 'rels' not in kg_data:
        print("⚠️ 缺少rels字段，添加空数组")
        kg_data['rels'] = []
    
    if not isinstance(kg_data['nodes'], list):
        print("❌ nodes不是数组")
        return False
        
    if not isinstance(kg_data['rels'], list):
        print("❌ rels不是数组")
        kg_data['rels'] = []
    
    # 验证和修复节点结构
    for i, node in enumerate(kg_data['nodes']):
        if not isinstance(node, dict):
            print(f"❌ 节点{i}不是字典")
            return False
        if 'id' not in node:
            print(f"❌ 节点{i}缺少id字段")
            return False
        if 'type' not in node:
            print(f"⚠️ 节点{i}缺少type字段，设为默认值")
            node['type'] = '实体'
        
        # ✅ 修复 properties 字段格式
        if 'properties' not in node:
            node['properties'] = []
        else:
            # 如果 properties 是字符串列表，转换为 Property 对象列表
            if isinstance(node['properties'], list):
                fixed_properties = []
                for j, prop in enumerate(node['properties']):
                    if isinstance(prop, str):
                        # 字符串转换为 Property 对象格式
                        fixed_properties.append({
                            "key": f"description_{j}",
                            "value": prop
                        })
                        print(f"🔧 修复节点{i}的属性{j}: '{prop}' -> {{key: 'description_{j}', value: '{prop}'}}")
                    elif isinstance(prop, dict) and 'key' in prop and 'value' in prop:
                        # 已经是正确格式
                        fixed_properties.append(prop)
                    else:
                        # 其他格式，尝试转换
                        try:
                            fixed_properties.append({
                                "key": "property",
                                "value": str(prop)
                            })
                            print(f"🔧 修复节点{i}的属性{j}: {prop} -> {{key: 'property', value: '{str(prop)}'}}")
                        except:
                            print(f"⚠️ 跳过节点{i}的无效属性{j}: {prop}")
                
                node['properties'] = fixed_properties
            else:
                # properties 不是列表，重置为空列表
                print(f"⚠️ 节点{i}的properties不是列表，重置为空")
                node['properties'] = []
    
    # 验证关系结构
    valid_rels = []
    for i, rel in enumerate(kg_data['rels']):
        if not isinstance(rel, dict):
            print(f"⚠️ 关系{i}不是字典，跳过")
            continue
            
        if not all(key in rel for key in ['source', 'target', 'type']):
            print(f"⚠️ 关系{i}缺少必需字段，跳过")
            continue
            
        # 验证并修复source和target
        for field in ['source', 'target']:
            if not isinstance(rel[field], dict) or 'id' not in rel[field]:
                print(f"⚠️ 关系{i}的{field}格式错误，跳过")
                break
            if 'type' not in rel[field]:
                rel[field]['type'] = '实体'
            # 确保source和target也有正确的properties格式
            if 'properties' not in rel[field]:
                rel[field]['properties'] = []
        else:
            # 修复关系的properties
            if 'properties' not in rel:
                rel['properties'] = []
            elif isinstance(rel['properties'], list):
                fixed_rel_properties = []
                for j, prop in enumerate(rel['properties']):
                    if isinstance(prop, str):
                        fixed_rel_properties.append({
                            "key": f"description_{j}",
                            "value": prop
                        })
                    elif isinstance(prop, dict) and 'key' in prop and 'value' in prop:
                        fixed_rel_properties.append(prop)
                    else:
                        try:
                            fixed_rel_properties.append({
                                "key": "property",
                                "value": str(prop)
                            })
                        except:
                            continue
                rel['properties'] = fixed_rel_properties
            else:
                rel['properties'] = []
            
            valid_rels.append(rel)
    
    kg_data['rels'] = valid_rels
    return True

def create_basic_kg(document_text):
    """创建基本的知识图谱作为最后的降级策略"""
    print("🔄 使用最后降级策略：创建基本图谱")
    
    # 使用简单的关键词提取
    keywords = ["发动机", "气缸", "活塞", "连杆", "曲轴", "气门", "螺旋桨", "减速器", "机匣", 
                "燃烧", "混合气", "压缩", "排气", "进气", "冷却", "润滑", "点火", "启动",
                "设备", "部件", "系统", "组件", "机构", "装置", "材料", "技术"]
    
    nodes = []
    found_keywords = []
    
    # 在文档中查找关键词
    for keyword in keywords:
        if keyword in document_text:
            found_keywords.append(keyword)
    
    # 如果找到关键词，为每个创建节点
    if found_keywords:
        for i, keyword in enumerate(found_keywords[:10]):  # 最多10个节点
            # 根据关键词类型确定节点类型
            if keyword in ["发动机", "减速器", "螺旋桨"]:
                node_type = "设备"
            elif keyword in ["气缸", "活塞", "连杆", "曲轴", "气门", "机匣"]:
                node_type = "部件"
            elif keyword in ["燃烧", "压缩", "排气", "进气", "冷却", "润滑", "点火", "启动"]:
                node_type = "过程"
            elif keyword in ["混合气", "材料"]:
                node_type = "材料"
            elif keyword in ["技术"]:
                node_type = "技术"
            else:
                node_type = "实体"
            
            # 创建节点，properties为空数组以避免Pydantic错误
            node = Node(
                id=keyword, 
                type=node_type, 
                properties=[]  # 空的Property对象列表
            )
            nodes.append(node)
            print(f"📝 创建基本节点: {keyword} ({node_type})")
    
    # 如果没有找到任何关键词，创建一个通用节点
    if not nodes:
        print("⚠️ 未找到关键词，创建通用文档实体")
        # 尝试从文档开头提取一些文字作为实体名称
        doc_words = document_text.split()[:3]  # 取前3个词
        entity_name = "".join(doc_words) if doc_words else "文档实体"
        
        node = Node(
            id=entity_name, 
            type="实体", 
            properties=[]
        )
        nodes.append(node)
    
    print(f"✅ 创建基本知识图谱: {len(nodes)}个节点")
    
    # 返回只有节点没有关系的知识图谱
    return KnowledgeGraph(nodes=nodes, rels=[])

def extract_entities_by_pattern(document_text):
    """使用正则表达式模式提取实体"""
    entities = []
    
    # 中文实体模式
    chinese_patterns = [
        r'[一-龟]{2,6}发动机',  # XX发动机
        r'[一-龟]{1,3}气缸',    # X气缸
        r'[一-龟]{2,4}系统',    # XX系统
        r'[一-龟]{2,4}装置',    # XX装置
        r'[一-龟]{1,3}型',      # X型
    ]
    
    # 英文实体模式
    english_patterns = [
        r'[A-Z][a-z]+ Engine',
        r'[A-Z][a-z]+ System',
        r'[A-Z]{2,5}-\d+',  # 型号模式，如 CFM-56
    ]
    
    all_patterns = chinese_patterns + english_patterns
    
    for pattern in all_patterns:
        matches = re.findall(pattern, document_text)
        for match in matches:
            if match not in entities and len(match) > 1:
                entities.append(match)
    
    return entities[:8]  # 最多返回8个实体

def create_enhanced_basic_kg(document_text):
    """创建增强版本的基本知识图谱"""
    print("🔄 使用增强版基本图谱创建")
    
    # 使用模式提取
    pattern_entities = extract_entities_by_pattern(document_text)
    
    # 使用关键词提取
    keyword_entities = []
    keywords = ["发动机", "气缸", "活塞", "连杆", "曲轴", "气门", "螺旋桨", "减速器"]
    for keyword in keywords:
        if keyword in document_text:
            keyword_entities.append(keyword)
    
    # 合并实体
    all_entities = list(set(pattern_entities + keyword_entities))
    
    if not all_entities:
        # 如果什么都没找到，使用原始的create_basic_kg
        return create_basic_kg(document_text)
    
    nodes = []
    for entity in all_entities[:10]:  # 最多10个节点
        # 智能判断实体类型
        if any(word in entity for word in ["发动机", "Engine"]):
            node_type = "设备"
        elif any(word in entity for word in ["气缸", "活塞", "连杆", "曲轴", "气门"]):
            node_type = "部件"
        elif any(word in entity for word in ["系统", "System"]):
            node_type = "系统"
        elif any(word in entity for word in ["装置", "Device"]):
            node_type = "装置"
        else:
            node_type = "实体"
        
        node = Node(
            id=entity,
            type=node_type,
            properties=[]
        )
        nodes.append(node)
        print(f"📝 创建增强节点: {entity} ({node_type})")
    
    print(f"✅ 创建增强基本知识图谱: {len(nodes)}个节点")
    return KnowledgeGraph(nodes=nodes, rels=[])

def merge_knowledge_graphs(knowledge_graphs):
    """合并多个知识图谱，去除重复的节点和关系"""
    if not knowledge_graphs:
        return KnowledgeGraph(nodes=[], rels=[])
    
    merged_nodes = {}
    merged_rels = []
    
    # 合并节点，使用(id, type)作为唯一键
    for kg in knowledge_graphs:
        if not kg or not kg.nodes:
            continue
            
        for node in kg.nodes:
            node_key = (node.id, node.type)
            if node_key not in merged_nodes:
                merged_nodes[node_key] = node
                print(f"🔄 合并节点: {node.id} ({node.type})")
    
    # 合并关系，避免重复
    rel_keys = set()
    for kg in knowledge_graphs:
        if not kg or not kg.rels:
            continue
            
        for rel in kg.rels:
            rel_key = (rel.source.id, rel.type, rel.target.id)
            if rel_key not in rel_keys:
                rel_keys.add(rel_key)
                # 确保使用合并后的节点
                source_key = (rel.source.id, rel.source.type)
                target_key = (rel.target.id, rel.target.type)
                if source_key in merged_nodes and target_key in merged_nodes:
                    merged_rels.append(rel)
                    print(f"🔗 合并关系: {rel.source.id} --{rel.type}--> {rel.target.id}")
    
    merged_kg = KnowledgeGraph(
        nodes=list(merged_nodes.values()),
        rels=merged_rels
    )
    
    print(f"✅ 知识图谱合并完成: {len(merged_kg.nodes)}个节点, {len(merged_kg.rels)}个关系")
    return merged_kg

# ==================== Neo4j 操作函数 ====================

def import_kg_to_neo4j(kg: KnowledgeGraph, graph_name: str = None, kg_id: str = None):
    """将知识图谱导入到Neo4j数据库（子图模式）"""
    try:
        print(f"🚀 开始导入知识图谱到Neo4j...")
        
        # 连接到Neo4j
        graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"), secure=False)
        
        # 生成子图标签
        if kg_id:
            safe_kg_id = kg_id.replace('-', '_')
            subgraph_label = f"UserKG_{safe_kg_id}"
        else:
            subgraph_label = "UserKG_default"
        
        print(f"📍 使用子图标签: {subgraph_label}")
        
        # 统计信息
        stats = {
            'node_count': 0,
            'relation_count': 0,
            'entity_types': set(),
            'subgraph': subgraph_label
        }
        
        # 导入节点
        print("📝 导入节点...")
        for node in kg.nodes:
            try:
                # 规范化节点类型
                node_type = normalize_node_type(node.type)
                stats['entity_types'].add(node_type)
                
                # 将属性转换为字典
                node_props = props_to_dict(node.properties) if node.properties else {}
                
                # 添加元数据
                node_props['name'] = node.id
                node_props['node_type'] = node_type
                node_props['kg_id'] = kg_id or 'default'
                node_props['created_at'] = datetime.now().isoformat()
                
                # 创建Cypher查询 - 使用子图标签和原始类型标签
                cypher = f"""
                MERGE (n:{subgraph_label}:{node_type} {{name: $name, kg_id: $kg_id}})
                SET n += $props
                RETURN n
                """
                
                result = graph.run(cypher, name=node.id, kg_id=kg_id, props=node_props)
                stats['node_count'] += 1
                
                print(f"✅ 导入节点: {node.id} ({node_type})")
                
            except Exception as e:
                print(f"❌ 导入节点失败 {node.id}: {e}")
                continue
        
        # 导入关系
        print("🔗 导入关系...")
        for rel in kg.rels:
            try:
                # 规范化关系类型
                rel_type = normalize_relation_name(rel.type)
                
                # 将关系属性转换为字典
                rel_props = props_to_dict(rel.properties) if rel.properties else {}
                rel_props['kg_id'] = kg_id or 'default'
                rel_props['created_at'] = datetime.now().isoformat()
                
                # 创建关系的Cypher查询
                cypher = f"""
                MATCH (s:{subgraph_label} {{name: $source_name, kg_id: $kg_id}})
                MATCH (t:{subgraph_label} {{name: $target_name, kg_id: $kg_id}})
                MERGE (s)-[r:{rel_type}]->(t)
                SET r += $props
                RETURN r
                """
                
                result = graph.run(cypher, 
                                 source_name=rel.source.id,
                                 target_name=rel.target.id,
                                 kg_id=kg_id,
                                 props=rel_props)
                
                stats['relation_count'] += 1
                print(f"✅ 导入关系: {rel.source.id} --{rel_type}--> {rel.target.id}")
                
            except Exception as e:
                print(f"❌ 导入关系失败: {e}")
                continue
        
        # 转换集合为列表
        stats['entity_types'] = list(stats['entity_types'])
        
        print(f"✅ 知识图谱导入完成!")
        print(f"📊 统计: {stats['node_count']}个节点, {stats['relation_count']}个关系")
        print(f"🏷️ 实体类型: {stats['entity_types']}")
        
        return stats
        
    except Exception as e:
        print(f"❌ 导入Neo4j失败: {e}")
        import traceback
        traceback.print_exc()
        raise e

def get_subgraph_for_visualization(kg_id):
    """获取子图的可视化数据"""
    try:
        safe_kg_id = kg_id.replace('-', '_')
        subgraph_label = f"UserKG_{safe_kg_id}"
        
        graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"), secure=False)
        
        # 获取节点
        nodes_query = f"""
        MATCH (n:{subgraph_label})
        WHERE n.kg_id = $kg_id
        RETURN n.name as name, labels(n) as labels, properties(n) as props
        LIMIT 100
        """
        
        # 获取关系
        rels_query = f"""
        MATCH (s:{subgraph_label})-[r]->(t:{subgraph_label})
        WHERE r.kg_id = $kg_id
        RETURN s.name as source, t.name as target, type(r) as type, properties(r) as props
        LIMIT 200
        """
        
        nodes_result = graph.run(nodes_query, kg_id=kg_id).data()
        rels_result = graph.run(rels_query, kg_id=kg_id).data()
        
        # 格式化节点数据
        vis_nodes = []
        for node in nodes_result:
            if node['name']:
                # 获取除子图标签外的其他标签作为类型
                node_labels = [label for label in node['labels'] if not label.startswith('UserKG_')]
                node_type = node_labels[0] if node_labels else 'Unknown'
                
                vis_nodes.append({
                    'id': node['name'],
                    'label': node['name'],
                    'type': node_type,
                    'properties': node['props']
                })
        
        # 格式化关系数据
        vis_edges = []
        for rel in rels_result:
            if rel['source'] and rel['target']:
                vis_edges.append({
                    'from': rel['source'],
                    'to': rel['target'],
                    'label': rel['type'],
                    'type': rel['type'],
                    'properties': rel['props']
                })
        
        return {
            'nodes': vis_nodes,
            'edges': vis_edges,
            'stats': {
                'nodeCount': len(vis_nodes),
                'edgeCount': len(vis_edges)
            }
        }
        
    except Exception as e:
        print(f"❌ 获取子图可视化数据失败: {e}")
        return None

def get_subgraph_info(kg_id):
    """获取子图的统计信息"""
    try:
        safe_kg_id = kg_id.replace('-', '_')
        subgraph_label = f"UserKG_{safe_kg_id}"
        
        graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"), secure=False)
        
        # 节点统计
        node_query = f"""
        MATCH (n:{subgraph_label})
        WHERE n.kg_id = $kg_id
        RETURN count(n) as node_count, collect(DISTINCT [label IN labels(n) WHERE NOT label =~ 'UserKG_.*'][0]) as node_types
        """
        
        # 关系统计
        rel_query = f"""
        MATCH (:{subgraph_label})-[r]->(:{subgraph_label})
        WHERE r.kg_id = $kg_id
        RETURN count(r) as relation_count, collect(DISTINCT type(r)) as relation_types
        """
        
        node_result = graph.run(node_query, kg_id=kg_id).data()
        rel_result = graph.run(rel_query, kg_id=kg_id).data()
        
        if node_result and rel_result:
            # 过滤掉None值
            node_types = [t for t in node_result[0]["node_types"] if t]
            relation_types = [t for t in rel_result[0]["relation_types"] if t]
            
            return {
                "node_count": node_result[0]["node_count"],
                "relation_count": rel_result[0]["relation_count"],
                "node_types": node_types,
                "relation_types": relation_types,
                "created_time": f"子图: {subgraph_label}"
            }
        
        return None
        
    except Exception as e:
        print(f"❌ 获取子图信息失败: {e}")
        return None

def delete_user_kg_subgraph(kg_id):
    """删除用户的知识图谱子图"""
    try:
        safe_kg_id = kg_id.replace('-', '_')
        subgraph_label = f"UserKG_{safe_kg_id}"
        
        graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"), secure=False)
        
        # 删除关系
        rel_delete_query = f"""
        MATCH (s:{subgraph_label})-[r]->(t:{subgraph_label})
        WHERE r.kg_id = $kg_id
        DELETE r
        """
        
        # 删除节点
        node_delete_query = f"""
        MATCH (n:{subgraph_label})
        WHERE n.kg_id = $kg_id
        DELETE n
        """
        
        graph.run(rel_delete_query, kg_id=kg_id)
        graph.run(node_delete_query, kg_id=kg_id)
        
        print(f"✅ 子图删除成功: {subgraph_label}")
        return True
        
    except Exception as e:
        print(f"❌ 删除子图失败: {e}")
        return False

# ==================== 文档处理函数 ====================

def read_document_content(file_path):
    """读取文档内容"""
    document_text = ""
    
    try:
        if file_path.endswith('.txt'):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    document_text = f.read()
            except UnicodeDecodeError:
                # 尝试其他编码
                try:
                    with open(file_path, 'r', encoding='gbk') as f:
                        document_text = f.read()
                except UnicodeDecodeError:
                    with open(file_path, 'r', encoding='latin-1') as f:
                        document_text = f.read()
                        
        elif file_path.endswith('.doc') or file_path.endswith('.docx'):
            # 使用python-docx库读取Word文档
            doc = docx.Document(file_path)
            document_text = "\n".join([para.text for para in doc.paragraphs if para.text.strip()])
            
        else:
            raise Exception(f"不支持的文件格式: {file_path}")
            
    except Exception as e:
        print(f"❌ 读取文档失败: {file_path} - {e}")
        raise Exception(f"无法读取文档: {str(e)}")
    
    if not document_text.strip():
        raise Exception("文档内容为空")
    
    print(f"✅ 成功读取文档: {len(document_text)} 字符")
    return document_text

# ==================== 主要构建函数 ====================

def build_knowledge_graph_from_document(file_path, kg_id, kg_name):
    """从文档构建知识图谱的主要函数（子图模式）"""
    try:
        # 读取文档内容
        document_text = read_document_content(file_path)
        
        if not document_text:
            raise Exception("文档内容为空或无法读取")
        
        print(f"📄 文本总长度: {len(document_text)} 字符")
        print(f"📍 将创建子图: UserKG_{kg_id.replace('-', '_')}")
        
        # 为长文本分段处理
        chunks = chunk_text(document_text, max_chunk_size=8000, overlap=500)
        all_knowledge_graphs = []
        
        for i, chunk in enumerate(chunks):
            print(f"🧩 处理文本块 {i+1}/{len(chunks)}，长度：{len(chunk)} 字符")
            print(f"📝 文本内容预览: {chunk[:100]}...")
            
            # 提取知识图谱，增加重试机制
            kg = None
            max_retries = 3
            
            for retry in range(max_retries):
                try:
                    print(f"🔄 尝试提取知识图谱，第 {retry+1}/{max_retries} 次")
                    kg = extract_knowledge_graph_from_text(chunk)
                    if kg and kg.nodes:
                        break
                    else:
                        print(f"⚠️ 第 {retry+1} 次提取失败，重试...")
                except Exception as e:
                    print(f"❌ 第 {retry+1} 次提取异常: {e}")
                    if retry == max_retries - 1:
                        print("❌ 所有重试都失败，使用基本图谱")
                        kg = create_enhanced_basic_kg(chunk)
            
            if kg and kg.nodes:
                all_knowledge_graphs.append(kg)
                print(f"✅ 从块 {i+1} 中提取了 {len(kg.nodes)} 个节点和 {len(kg.rels)} 个关系")
                
                # 打印提取的节点详情
                print("📊 提取的节点:")
                for node in kg.nodes[:5]:  # 显示前5个
                    print(f"   - {node.id} ({node.type})")
                if len(kg.nodes) > 5:
                    print(f"   - ... 还有 {len(kg.nodes)-5} 个节点")
                    
                if kg.rels:
                    print("🔗 提取的关系:")
                    for rel in kg.rels[:3]:  # 显示前3个
                        print(f"   - {rel.source.id} --{rel.type}--> {rel.target.id}")
                    if len(kg.rels) > 3:
                        print(f"   - ... 还有 {len(kg.rels)-3} 个关系")
                else:
                    print("🔗 未提取到关系")
            else:
                print(f"❌ 从块 {i+1} 中完全无法提取知识图谱")
        
        # 合并所有知识图谱
        if not all_knowledge_graphs:
            raise Exception("未能从文档中提取有效的知识图谱")
            
        merged_kg = merge_knowledge_graphs(all_knowledge_graphs)
        print(f"🔄 合并后的图谱包含 {len(merged_kg.nodes)} 个节点和 {len(merged_kg.rels)} 个关系")
        
        # 导入Neo4j（使用子图模式）
        result = import_kg_to_neo4j(merged_kg, None, kg_id)
        
        return {
            'success': True,
            'kg': merged_kg,
            'stats': result,
            'message': '知识图谱创建成功',
            'subgraph': result.get('subgraph')
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'message': f'知识图谱创建失败: {str(e)}'
        }

# ==================== 加载知识图谱信息函数 ====================

def loadKGInfo(kg_id):
    """加载知识图谱信息（用于前端兼容）"""
    if kg_id == 'default':
        # 返回默认图谱信息
        try:
            graph = Graph("bolt://localhost:7687", auth=("neo4j", "3080neo4j"), secure=False)
            
            # 获取默认图谱统计
            node_query = """
            MATCH (n) 
            WHERE NOT any(label IN labels(n) WHERE label =~ 'UserKG_.*')
            RETURN count(n) as node_count, collect(DISTINCT labels(n)[0]) as node_types
            """
            
            rel_query = """
            MATCH ()-[r]->() 
            WHERE NOT EXISTS(r.kg_id)
            RETURN count(r) as rel_count, collect(DISTINCT type(r)) as rel_types
            """
            
            node_result = graph.run(node_query).data()
            rel_result = graph.run(rel_query).data()
            
            return {
                "kg_id": "default",
                "name": "系统默认图谱",
                "node_count": node_result[0]["node_count"] if node_result else 0,
                "relation_count": rel_result[0]["rel_count"] if rel_result else 0,
                "node_types": node_result[0]["node_types"] if node_result else [],
                "relation_types": rel_result[0]["rel_types"] if rel_result else [],
                "created_time": "系统预置"
            }
            
        except Exception as e:
            print(f"❌ 获取默认图谱信息失败: {e}")
            return None
    else:
        # 返回用户子图信息
        return get_subgraph_info(kg_id)