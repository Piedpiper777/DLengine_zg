import subprocess
import json
import os
import tempfile
import time
import shutil
from pathlib import Path
from typing import List, Dict, Optional

class MonkeyOCRProcessor:
    def __init__(self, 
                 monkey_ocr_path: str = "/home/zhanggu/MyDoc/DLsystem/models_storage/monkey_ocr",
                 model_weight_path: str = "/home/zhanggu/MyDoc/DLsystem/models_storage/monkey_ocr/model_weight",
                 python_env: str = None):
        """
        初始化 MonkeyOCR 处理器
        
        Args:
            monkey_ocr_path: MonkeyOCR项目代码路径
            model_weight_path: 模型权重文件路径
            python_env: Python环境路径 (可以是conda环境名或虚拟环境路径)
        """
        self.monkey_ocr_path = monkey_ocr_path
        self.model_weight_path = model_weight_path
        self.python_env = python_env
        self.supported_image_types = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
        self.supported_pdf_types = {'.pdf'}
        
        # 检查MonkeyOCR是否可用
        self.is_available = self._check_availability()
        
    def _get_python_command(self) -> List[str]:
        """获取Python命令（考虑环境）"""
        if self.python_env:
            # 检查是否是conda环境
            if '/' not in self.python_env:  # 环境名而不是路径
                # conda环境
                return ['conda', 'run', '-n', self.python_env, 'python']
            else:
                # 虚拟环境路径
                python_path = os.path.join(self.python_env, 'bin', 'python')
                if os.path.exists(python_path):
                    return [python_path]
                else:
                    print(f"⚠️ 虚拟环境Python不存在: {python_path}")
                    return ['python']
        return ['python']
    
    def _check_availability(self) -> bool:
        """检查MonkeyOCR是否可用"""
        try:
            # 检查项目路径
            if not os.path.exists(self.monkey_ocr_path):
                print(f"⚠️ MonkeyOCR项目路径不存在: {self.monkey_ocr_path}")
                return False
                
            # 检查parse.py
            parse_script = os.path.join(self.monkey_ocr_path, "parse.py")
            if not os.path.exists(parse_script):
                print(f"⚠️ MonkeyOCR parse.py不存在: {parse_script}")
                return False
            
            # 检查模型权重路径
            if not os.path.exists(self.model_weight_path):
                print(f"⚠️ 模型权重路径不存在: {self.model_weight_path}")
                return False
            
            # 测试Python环境
            python_cmd = self._get_python_command()
            print(f"🐍 使用Python命令: {' '.join(python_cmd)}")
            
            # 检查配置文件
            config_file = os.path.join(self.monkey_ocr_path, "model_configs.yaml")
            if not os.path.exists(config_file):
                print(f"📝 创建默认配置文件: {config_file}")
                self._create_default_config(config_file)
            
            print(f"✅ MonkeyOCR可用")
            print(f"   项目路径: {self.monkey_ocr_path}")
            print(f"   模型路径: {self.model_weight_path}")
            print(f"   Python环境: {self.python_env or '系统默认'}")
            return True
            
        except Exception as e:
            print(f"⚠️ MonkeyOCR检查失败: {str(e)}")
            return False
    
    def _create_default_config(self, config_file: str):
        """创建默认配置文件"""
        config_content = f"""model:
  name: "MonkeyOCR-pro-1.2B"
  model_path: "{self.model_weight_path}"
  device: "cpu"
  precision: "fp32"

inference:
  batch_size: 1
  max_pages: 50
  
output:
  format: ["markdown", "json"]
  save_layout: true
  save_middle: true"""
        try:
            with open(config_file, 'w', encoding='utf-8') as f:
                f.write(config_content)
            print(f"✅ 配置文件创建成功: {config_file}")
        except Exception as e:
            print(f"⚠️ 配置文件创建失败: {str(e)}")
    
    def test_installation(self) -> bool:
        """测试MonkeyOCR安装"""
        print("🧪 测试MonkeyOCR安装...")
        
        if not self.is_available:
            print("❌ MonkeyOCR不可用")
            return False
        
        try:
            # 测试命令
            python_cmd = self._get_python_command()
            cmd = python_cmd + ['parse.py', '--help']
            
            # 设置环境变量
            env = os.environ.copy()
            if self.python_env and '/' in self.python_env:
                env['PATH'] = f"{os.path.join(self.python_env, 'bin')}:{env.get('PATH', '')}"
                env['VIRTUAL_ENV'] = self.python_env
            
            print(f"🔧 执行测试命令: {' '.join(cmd)}")
            print(f"📂 工作目录: {self.monkey_ocr_path}")
            
            result = subprocess.run(
                cmd,
                cwd=self.monkey_ocr_path,
                capture_output=True,
                text=True,
                timeout=30,
                env=env
            )
            
            if result.returncode == 0:
                print("✅ MonkeyOCR安装正常")
                print("📋 帮助信息预览:")
                help_text = result.stdout
                if len(help_text) > 300:
                    print(help_text[:300] + "...")
                else:
                    print(help_text)
                return True
            else:
                print(f"❌ MonkeyOCR测试失败 (返回码: {result.returncode})")
                print(f"📝 错误信息: {result.stderr}")
                if result.stdout:
                    print(f"📝 标准输出: {result.stdout}")
                
                # 如果是缺少依赖，给出具体建议
                if "ModuleNotFoundError" in result.stderr or "ImportError" in result.stderr:
                    print("\n💡 可能的解决方案:")
                    print(f"   1. 激活环境: conda activate {self.python_env}")
                    print(f"   2. 安装依赖: cd {self.monkey_ocr_path} && pip install -r requirements.txt")
                    print("   3. 检查CUDA环境是否正确安装")
                
                return False
                
        except subprocess.TimeoutExpired:
            print("⏰ MonkeyOCR测试超时")
            return False
        except Exception as e:
            print(f"❌ MonkeyOCR测试异常: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def process_document(self, file_path: str, output_dir: str = None, use_custom_config: bool = True) -> Dict:
        """
        使用MonkeyOCR处理文档
        
        Args:
            file_path: 输入文件路径
            output_dir: 输出目录，默认为临时目录
            use_custom_config: 是否使用自定义配置
            
        Returns:
            处理结果字典
        """
        if not self.is_available:
            return {
                'success': False,
                'error': 'MonkeyOCR不可用',
                'message': 'MonkeyOCR未正确安装或配置'
            }
        
        try:
            # 准备输出目录
            if output_dir is None:
                output_dir = tempfile.mkdtemp(prefix="monkey_ocr_")
            
            os.makedirs(output_dir, exist_ok=True)
            
            # 构建MonkeyOCR命令（使用指定的Python环境）
            python_cmd = self._get_python_command()
            cmd = python_cmd + [
                'parse.py', 
                file_path,
                '-o', output_dir
            ]
            
            # 如果有自定义配置文件，添加配置参数
            config_file = os.path.join(self.monkey_ocr_path, "model_configs.yaml")
            if use_custom_config and os.path.exists(config_file):
                cmd.extend(['-c', config_file])
            
            print(f"🚀 执行MonkeyOCR命令: {' '.join(cmd)}")
            print(f"📂 工作目录: {self.monkey_ocr_path}")
            print(f"📁 输出目录: {output_dir}")
            
            # 设置环境变量
            env = os.environ.copy()
            if self.python_env and '/' in self.python_env:  # 虚拟环境路径
                env['PATH'] = f"{os.path.join(self.python_env, 'bin')}:{env.get('PATH', '')}"
                env['VIRTUAL_ENV'] = self.python_env
            
            # 执行OCR处理
            result = subprocess.run(
                cmd, 
                cwd=self.monkey_ocr_path,
                capture_output=True, 
                text=True, 
                timeout=600,
                env=env
            )
            
            if result.returncode == 0:
                print("✅ MonkeyOCR处理成功")
                print(f"📝 输出信息: {result.stdout[-500:]}")
                return self._parse_results(file_path, output_dir)
            else:
                print(f"❌ MonkeyOCR处理失败")
                print(f"📝 错误信息: {result.stderr}")
                print(f"📝 标准输出: {result.stdout}")
                return {
                    'success': False,
                    'error': result.stderr,
                    'stdout': result.stdout,
                    'message': 'MonkeyOCR处理失败'
                }
                
        except subprocess.TimeoutExpired:
            print("⏰ MonkeyOCR处理超时")
            return {
                'success': False,
                'error': 'Timeout',
                'message': 'OCR处理超时（超过10分钟）'
            }
        except Exception as e:
            print(f"💥 MonkeyOCR处理异常: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e),
                'message': f'处理异常: {str(e)}'
            }
    
    def _parse_results(self, file_path: str, output_dir: str) -> Dict:
        """解析MonkeyOCR处理结果"""
        try:
            base_name = Path(file_path).stem
            
            # 查找输出文件（MonkeyOCR可能在子目录中创建结果）
            result_files = self._find_result_files(output_dir, base_name)
            
            result = {
                'success': True,
                'type': 'monkey_ocr',
                'content': '',
                'structured_data': {},
                'pages': 1,
                'engine': 'MonkeyOCR-pro-1.2B',
                'output_dir': output_dir,
                'files': result_files
            }
            
            # 读取Markdown结果
            md_content = self._read_markdown_files(result_files['markdown'])
            if md_content:
                result['content'] = md_content
                print(f"📄 读取到Markdown内容: {len(md_content)}字符")
            
            # 读取结构化数据
            json_data = self._read_json_files(result_files['json'])
            if json_data:
                result['structured_data'] = json_data
                # 尝试提取页数信息
                if isinstance(json_data, list):
                    result['pages'] = len(json_data)
                elif isinstance(json_data, dict):
                    if 'pages' in json_data:
                        result['pages'] = len(json_data['pages'])
                    elif any(key.endswith('_middle.json') for key in result_files['json']):
                        result['pages'] = len(result_files['json'])
                
                print(f"📊 读取到结构化数据: {result['pages']}页")
            
            # 如果没有内容，返回错误
            if not result['content']:
                result['success'] = False
                result['message'] = '未能提取到文档内容，可能是文档格式不支持或内容为空'
                print(f"⚠️ 可用文件: {result_files}")
            else:
                print(f"✅ MonkeyOCR处理完成，提取内容长度: {len(result['content'])}")
            
            return result
            
        except Exception as e:
            print(f"💥 结果解析失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e),
                'message': f'结果解析失败: {str(e)}'
            }
    
    def _find_result_files(self, output_dir: str, base_name: str) -> Dict[str, List[str]]:
        """查找结果文件"""
        result_files = {
            'markdown': [],
            'json': [],
            'pdf': [],
            'images': []
        }
        
        # 递归查找文件
        for root, dirs, files in os.walk(output_dir):
            for file in files:
                file_path = os.path.join(root, file)
                file_lower = file.lower()
                
                if file_lower.endswith('.md'):
                    result_files['markdown'].append(file_path)
                elif file_lower.endswith('.json'):
                    result_files['json'].append(file_path)
                elif file_lower.endswith('.pdf'):
                    result_files['pdf'].append(file_path)
                elif file_lower.endswith(('.png', '.jpg', '.jpeg')):
                    result_files['images'].append(file_path)
        
        return result_files
    
    def _read_markdown_files(self, md_files: List[str]) -> str:
        """读取Markdown文件内容"""
        content_parts = []
        
        for md_file in sorted(md_files):
            try:
                with open(md_file, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if content:
                        content_parts.append(content)
                        print(f"📄 读取文件: {md_file} ({len(content)}字符)")
            except Exception as e:
                print(f"⚠️ 读取Markdown文件失败 {md_file}: {str(e)}")
        
        return '\n\n'.join(content_parts)
    
    def _read_json_files(self, json_files: List[str]) -> Dict:
        """读取JSON文件内容"""
        combined_data = {}
        
        for json_file in sorted(json_files):
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    file_key = Path(json_file).stem
                    combined_data[file_key] = data
                    print(f"📊 读取JSON文件: {json_file}")
            except Exception as e:
                print(f"⚠️ 读取JSON文件失败 {json_file}: {str(e)}")
        
        return combined_data
    
    def process_file(self, file_path: str, lang: str = 'chi_sim+eng') -> Dict:
        """
        处理上传的文件（统一接口）
        
        Args:
            file_path: 文件路径
            lang: 语言参数（MonkeyOCR会自动处理，此参数保留兼容性）
            
        Returns:
            处理结果
        """
        file_ext = os.path.splitext(file_path)[1].lower()
        
        if file_ext not in (self.supported_image_types | self.supported_pdf_types):
            return {
                'type': 'unsupported',
                'content': f"不支持的文件类型: {file_ext}",
                'pages': 0,
                'success': False,
                'engine': 'None'
            }
        
        print(f"📁 开始处理文件: {file_path}")
        
        # 使用MonkeyOCR处理
        result = self.process_document(file_path)
        
        if result.get('success', False):
            print("🎉 文件处理成功！")
        else:
            print(f"❌ 文件处理失败: {result.get('message', '未知错误')}")
        
        return result

# 工厂函数，支持环境配置
def create_ocr_processor(
    monkey_ocr_path: str = "/home/zhanggu/MyDoc/DLsystem/models_storage/monkey_ocr",
    model_weight_path: str = "/home/zhanggu/MyDoc/DLsystem/models_storage/monkey_ocr/model_weight",
    python_env: str = None
) -> MonkeyOCRProcessor:
    """
    创建OCR处理器实例
    
    Args:
        monkey_ocr_path: MonkeyOCR项目路径
        model_weight_path: 模型权重路径
        python_env: Python环境 (conda环境名或虚拟环境路径)
        
    Returns:
        OCR处理器实例
    """
    return MonkeyOCRProcessor(
        monkey_ocr_path=monkey_ocr_path,
        model_weight_path=model_weight_path,
        python_env=python_env
    )

# 创建全局实例 - 根据你的环境选择一种方式
# 选项1: 使用conda环境
ocr_processor = create_ocr_processor(python_env="monkey_ocr")

# 选项2: 使用虚拟环境
# ocr_processor = create_ocr_processor(python_env="/home/zhanggu/MyDoc/DLsystem/envs/monkey_ocr_env")

# 选项3: 使用系统默认环境
# ocr_processor = create_ocr_processor()

def check_monkey_ocr_setup():
    """检查MonkeyOCR设置"""
    print("🔍 检查MonkeyOCR设置...")
    
    monkey_ocr_path = "/home/zhanggu/MyDoc/DLsystem/models_storage/monkey_ocr"
    model_weight_path = "/home/zhanggu/MyDoc/DLsystem/models_storage/monkey_ocr/model_weight"
    
    print(f"📂 项目路径: {monkey_ocr_path}")
    print(f"📂 模型路径: {model_weight_path}")
    
    issues = []
    
    if not os.path.exists(monkey_ocr_path):
        issues.append(f"项目代码路径不存在: {monkey_ocr_path}")
    elif not os.path.exists(os.path.join(monkey_ocr_path, "parse.py")):
        issues.append(f"parse.py不存在: {os.path.join(monkey_ocr_path, 'parse.py')}")
    
    if not os.path.exists(model_weight_path):
        issues.append(f"模型权重路径不存在: {model_weight_path}")
    
    if issues:
        print("❌ 发现问题:")
        for issue in issues:
            print(f"   - {issue}")
        print("\n📝 解决建议:")
        print("   1. 创建独立环境: conda create -n monkey_ocr python=3.9")
        print("   2. 激活环境: conda activate monkey_ocr")
        print("   3. 安装依赖: pip install -r requirements.txt")
        print("   4. 测试安装: ocr_processor.test_installation()")
        return False
    else:
        print("✅ MonkeyOCR设置检查通过")
        return True

def test_ocr_processing(test_file: str = None):
    """测试OCR处理功能"""
    if test_file is None:
        print("📝 请提供测试文件路径")
        return False
    
    if not os.path.exists(test_file):
        print(f"❌ 测试文件不存在: {test_file}")
        return False
    
    print(f"🧪 测试OCR处理: {test_file}")
    
    try:
        result = ocr_processor.process_file(test_file)
        
        if result.get('success', False):
            print("✅ OCR处理测试成功!")
            print(f"📄 提取内容长度: {len(result.get('content', ''))}")
            print(f"📊 页数: {result.get('pages', 0)}")
            return True
        else:
            print(f"❌ OCR处理测试失败: {result.get('message', '未知错误')}")
            return False
            
    except Exception as e:
        print(f"💥 OCR处理测试异常: {str(e)}")
        return False

if __name__ == "__main__":
    # 运行设置检查
    check_monkey_ocr_setup()
    
    # 运行安装测试
    ocr_processor.test_installation()