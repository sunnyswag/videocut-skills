#!/bin/bash
#
# 步骤 1-3: 提取音频 → 上传 uguu.se → 火山引擎转录
#
# 用法: ./transcribe.sh <VIDEO_PATH> <BASE_DIR>
#   BASE_DIR: 剪口播输出目录（setup_output.sh 的返回值）
# 输出: BASE_DIR/1_转录/audio.mp3, volcengine_result.json
#

VIDEO_PATH="$1"
BASE_DIR="$2"

if [ -z "$VIDEO_PATH" ] || [ -z "$BASE_DIR" ]; then
  echo "❌ 用法: ./transcribe.sh <VIDEO_PATH> <BASE_DIR>"
  exit 1
fi

if [ ! -d "$BASE_DIR/1_转录" ]; then
  echo "❌ 目录不存在: $BASE_DIR/1_转录，请先运行 setup_output.sh"
  exit 1
fi

cd "$BASE_DIR/1_转录" || exit 1

# 1. 提取音频（文件名有冒号需加 file: 前缀）
echo "🎵 提取音频..."
ffmpeg -i "file:$VIDEO_PATH" -vn -acodec libmp3lame -y audio.mp3

# 2. 上传获取公网 URL
echo "📤 上传音频..."
UPLOAD_RESP=$(curl -s -F "files[]=@audio.mp3" https://uguu.se/upload)
AUDIO_URL=$(echo "$UPLOAD_RESP" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
if(d.success && d.files && d.files[0]) console.log(d.files[0].url);
else process.exit(1);
" 2>/dev/null)

if [ -z "$AUDIO_URL" ]; then
  echo "❌ 上传失败，响应: $UPLOAD_RESP"
  exit 1
fi
echo "✅ 音频 URL: $AUDIO_URL"

# 3. 调用火山引擎 API
./1_volcengine_transcribe.sh "$AUDIO_URL"
