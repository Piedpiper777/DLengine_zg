import os
import time
import json

# 尝试导入 OpenAI 库
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    print("警告：未安装 openai 库，将使用模拟 LLM 客户端")
    OPENAI_AVAILABLE = False

class LLMClient:
    """LLM 客户端类，封装对大语言模型的调用"""
    
    def __init__(self):
        """初始化 LLM 客户端"""
        self.api_key = "sk-"
        self.base_url = "https://api.deepseek.com"
        self.model_name = "deepseek-chat"
        
        # 检查是否有 API 密钥
        if not self.api_key:
            print("警告：未设置 DEEPSEEK_API_KEY 环境变量，将使用模拟响应")
        
        # 初始化客户端
        if OPENAI_AVAILABLE and self.api_key:
            try:
                self.client = OpenAI(
                    api_key=self.api_key, 
                    base_url=self.base_url
                )
                print("✅ LLM 客户端初始化成功")
            except Exception as e:
                print(f"❌ LLM 客户端初始化失败: {e}")
                self.client = None
        else:
            self.client = None
    
    def chat_completion(self, prompt, system_prompt="You are a helpful assistant"):
        """基本的聊天完成功能
        
        Args:
            prompt (str): 用户输入的提示
            system_prompt (str): 系统提示
            
        Returns:
            tuple: (响应文本, 响应时间)
        """
        start_time = time.time()
        
        # 检查是否配置了 API 客户端
        if not self.client:
            # 返回模拟响应
            time.sleep(1)  # 模拟延迟
            response_text = f"这是对您问题 '{prompt}' 的回答。（模拟响应，未配置 LLM API）"
            end_time = time.time()
            return response_text, round(end_time - start_time, 2)
        
        try:
            # 调用 DeepSeek API
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                stream=False
            )
            
            # 提取响应文本
            response_text = response.choices[0].message.content
            
        except Exception as e:
            print(f"LLM API 调用失败: {str(e)}")
            response_text = f"对不起，调用模型时出现错误: {str(e)}"
        
        end_time = time.time()
        return response_text, round(end_time - start_time, 2)
    
    def chat_completion_with_history(self, prompt, history=None, system_prompt="You are a helpful assistant"):
        """带历史记录的聊天完成功能
        
        Args:
            prompt (str): 用户输入的提示
            history (list): 聊天历史记录，格式为 [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
            system_prompt (str): 系统提示
            
        Returns:
            tuple: (响应文本, 响应时间)
        """
        start_time = time.time()
        
        # 如果没有提供历史记录，初始化一个空列表
        if history is None:
            history = []
        
        # 检查是否配置了 API 客户端
        if not self.client:
            # 返回模拟响应
            time.sleep(1)  # 模拟延迟
            response_text = f"这是对您问题 '{prompt}' 的回答。（模拟响应，未配置 LLM API）"
            end_time = time.time()
            return response_text, round(end_time - start_time, 2)
        
        try:
            # 构建消息列表
            messages = [{"role": "system", "content": system_prompt}]
            
            # 添加历史记录
            for h in history:
                messages.append(h)
            
            # 添加当前查询
            messages.append({"role": "user", "content": prompt})
            
            # 调用 DeepSeek API
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                stream=False
            )
            
            # 提取响应文本
            response_text = response.choices[0].message.content
            
        except Exception as e:
            print(f"LLM API 调用失败: {str(e)}")
            response_text = f"对不起，调用模型时出现错误: {str(e)}"
        
        end_time = time.time()
        return response_text, round(end_time - start_time, 2)
    
    def chat_completion_with_history_stream(self, user_input, chat_history=None):
        """流式返回带历史记录的聊天完成功能
        
        Args:
            user_input (str): 用户输入的提示
            chat_history (list): 聊天历史记录
            
        Yields:
            str: 响应文本片段
        """
        # 如果没有提供历史记录，初始化一个空列表
        if chat_history is None:
            chat_history = []
            
        # 转换聊天历史记录格式
        formatted_history = []
        for msg in chat_history:
            if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                formatted_history.append(msg)
            
        # 检查是否配置了 API 客户端
        if not self.client:
            # 返回模拟响应
            time.sleep(0.5)  # 模拟延迟
            yield "这是对您问题的"
            time.sleep(0.3)
            yield "流式回答"
            time.sleep(0.3)
            yield "。（模拟响应，"
            time.sleep(0.3)
            yield "未配置 LLM API）"
            return
        
        try:
            # 构建消息列表
            messages = [{"role": "system", "content": "You are a helpful assistant"}]
            
            # 添加历史记录
            for msg in formatted_history:
                messages.append(msg)
            
            # 添加当前查询
            messages.append({"role": "user", "content": user_input})
            
            # 调用 DeepSeek API 流式返回
            response_stream = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                stream=True
            )
            
            # 逐块返回响应
            for chunk in response_stream:
                if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content is not None:
                    yield chunk.choices[0].delta.content
            
        except Exception as e:
            print(f"LLM 流式 API 调用失败: {str(e)}")
            yield f"对不起，调用模型时出现错误: {str(e)}"


# 创建全局 LLM 客户端实例
llm_client = LLMClient()