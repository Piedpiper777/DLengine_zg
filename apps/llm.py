from openai import OpenAI
import requests
import json
from typing import List, Dict, Optional

class DeepSeekLLMClient:
    def __init__(self, api_key: str = None, model: str = "deepseek-chat"):
        """
        初始化 DeepSeek LLM 客户端
        
        Args:
            api_key: DeepSeek API 密钥
            model: 模型名称，默认为 deepseek-chat
        """
        self.api_key = api_key or "sk-30e3786c078e42e09482b6c2427937ee"  
        self.model = model
        
        # 初始化 OpenAI 客户端以连接 DeepSeek API
        self.client = OpenAI(
            api_key=self.api_key,
            base_url="https://api.deepseek.com",
            timeout=60.0  # 设置60秒超时
        )
    
    def chat_completion_with_history(self, user_input: str, chat_history: List[Dict] = None) -> tuple[str, List[Dict]]:
        """
        使用聊天历史进行对话
        
        Args:
            user_input: 用户输入
            chat_history: 聊天历史，格式为 [{"role": "user/assistant", "content": "..."}]
        
        Returns:
            tuple: (AI回复, 更新后的聊天历史)
        """
        if chat_history is None:
            chat_history = []
        
        # 构建消息列表
        messages = []
        
        # 添加系统提示
        system_prompt = """你是一个专业的工业技术AI助手，专注于制造业、自动化、设备维护、CAD/CAM、工业4.0等领域。

请遵循以下原则：
1. 提供准确、实用的工业技术信息
2. 回答要简洁明了，重点突出
3. 适当使用技术术语，但要易于理解
4. 如果涉及安全操作，请特别强调安全注意事项
5. 回复长度控制在200-400字以内，避免过长回复

请用中文回答，语气专业但友好。"""
        
        messages.append({"role": "system", "content": system_prompt})
        
        # 添加聊天历史（限制最近8轮对话）
        recent_history = chat_history[-16:] if len(chat_history) > 16 else chat_history
        messages.extend(recent_history)
        
        # 添加当前用户输入
        messages.append({"role": "user", "content": user_input})
        
        try:
            # 调用 DeepSeek API，优化参数
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=800,  # 限制最大token数，减少响应时间
                temperature=0.1,  # 降低temperature，提高响应速度
                top_p=0.8,       # 限制采样范围，提高响应速度
                stream=False     # 不使用流式响应（如果需要流式可以改为True）
            )
            
            # 提取 AI 回复
            ai_response = response.choices[0].message.content.strip()
            
            # 更新聊天历史
            updated_history = recent_history + [
                {"role": "user", "content": user_input},
                {"role": "assistant", "content": ai_response}
            ]
            
            return ai_response, updated_history
            
        except Exception as e:
            print(f"DeepSeek API 调用失败: {e}")
            return f"抱歉，AI服务暂时不可用。错误信息：{str(e)}", chat_history

# 创建全局实例
llm_client = DeepSeekLLMClient()


class OpenAILLMClient:
    """
    OpenAI API 客户端（保留作为备选）
    """
    def __init__(self, api_key: str = None, model: str = "gpt-3.5-turbo"):
        self.api_key = api_key or "your-openai-api-key-here"
        self.model = model
        
        self.client = OpenAI(api_key=self.api_key)
    
    def chat_completion(self, messages: List[Dict], temperature: float = 0.7, max_tokens: int = 1000) -> str:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            print(f"OpenAI API 调用失败: {str(e)}")
            return f"抱歉，模型调用失败：{str(e)}"
    
    def chat_completion_with_history(self, user_input: str, chat_history: List[Dict]) -> tuple:
        messages = chat_history + [{"role": "user", "content": user_input}]
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.7,
            max_tokens=1000
        )
        
        assistant_content = response.choices[0].message.content.strip()
        updated_history = messages + [{"role": "assistant", "content": assistant_content}]
        
        return assistant_content, updated_history


class LocalLLMClient:
    """
    本地或自部署模型的客户端示例
    适用于使用 Ollama、vLLM 等本地部署的模型
    """
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama2"):
        self.base_url = base_url
        self.model = model
    
    def chat_completion(self, messages: List[Dict], temperature: float = 0.7) -> str:
        """
        调用本地模型 API（以 Ollama 为例）
        """
        try:
            # 构建请求数据
            data = {
                "model": self.model,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": temperature
                }
            }
            
            # 发送请求
            response = requests.post(
                f"{self.base_url}/api/chat",
                json=data,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("message", {}).get("content", "")
            else:
                return f"请求失败，状态码：{response.status_code}"
                
        except Exception as e:
            return f"本地模型调用失败：{str(e)}"
    
    def chat_completion_with_history(self, user_input: str, chat_history: List[Dict]) -> tuple:
        messages = chat_history + [{"role": "user", "content": user_input}]
        response = self.chat_completion(messages)
        updated_history = messages + [{"role": "assistant", "content": response}]
        return response, updated_history


# 测试函数
def test_deepseek_chat():
    """
    测试 DeepSeek 多轮对话功能
    """
    client = DeepSeekLLMClient(api_key="your-actual-api-key")
    
    # Round 1
    messages = []
    user_input_1 = "世界上最高的山是什么？"
    
    response_1, messages = client.chat_completion_with_history(user_input_1, messages)
    print(f"Round 1 - User: {user_input_1}")
    print(f"Round 1 - Assistant: {response_1}")
    print(f"Messages after Round 1: {messages}")
    print("-" * 50)
    
    # Round 2
    user_input_2 = "第二高的呢？"
    response_2, messages = client.chat_completion_with_history(user_input_2, messages)
    print(f"Round 2 - User: {user_input_2}")
    print(f"Round 2 - Assistant: {response_2}")
    print(f"Messages after Round 2: {messages}")

# 如果需要测试，可以运行：
# test_deepseek_chat()