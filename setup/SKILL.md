---
name: videocut:安装
description: 环境准备。安装依赖、配置 API Key、验证环境。触发词：安装、环境准备、初始化
---

<!--
input: 无
output: 环境就绪
pos: 前置 skill，首次使用前运行

-->

# 安装

> 首次使用前的环境准备

## 快速使用

```
用户: 安装环境
用户: 初始化
```

## 依赖清单

| 依赖 | 用途 | 安装命令 |
|------|------|----------|
| Node.js | 运行 CLI | `brew install node` |
| FFmpeg | 视频剪辑 | `brew install ffmpeg` |
| @videocut/cli | 视频剪辑工具 | `npm install -g @videocut/cli` |

## API 配置

### 火山引擎语音识别

控制台：https://console.volcengine.com/speech/new/experience/asr?projectName=default

1. 注册火山引擎账号
2. 开通语音识别服务
3. 获取 App ID 和 Access Token

## 安装流程

```
1. 安装 Node.js + FFmpeg
       ↓
2. 安装 @videocut/cli
       ↓
3. 配置火山引擎 API Key
       ↓
4. 验证环境
```

## 执行步骤

### 1. 安装依赖

```bash
# macOS
brew install node ffmpeg

# 验证
node -v
ffmpeg -version
```

### 2. 安装 CLI

```bash
npm install -g @videocut/cli

# 验证
videocut --help
```

### 3. 配置 API Key

```bash
# 设置环境变量（推荐添加到 ~/.zshrc 或 ~/.bashrc）
export VOLCENGINE_APP_ID="your_app_id"
export VOLCENGINE_ACCESS_TOKEN="your_access_token"
```

### 4. 验证环境

```bash
# 检查 Node.js
node -v

# 检查 FFmpeg
ffmpeg -version

# 检查 CLI
videocut --help

# 检查环境变量
echo $VOLCENGINE_APP_ID
echo $VOLCENGINE_ACCESS_TOKEN
```

## 常见问题

### Q1: API Key 在哪获取？

火山引擎控制台 → 语音技术 → 语音识别 → API Key

### Q2: ffmpeg 命令找不到

```bash
which ffmpeg  # 应该输出路径
# 如果没有，重新安装：brew install ffmpeg
```

### Q3: 文件名含冒号报错

FFmpeg 命令需加 `file:` 前缀：

```bash
ffmpeg -i "file:2026:01:26 task.mp4" ...
```

### Q4: CLI 安装失败

确保 Node.js 版本 >= 18：

```bash
node -v  # 应该 >= 18.0.0
```
