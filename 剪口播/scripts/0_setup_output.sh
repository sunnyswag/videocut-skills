#!/bin/bash
#
# 创建剪口播输出目录结构
#
# 用法: ./setup_output.sh <VIDEO_PATH> [WORKSPACE_ROOT]
# 输出: BASE_DIR 绝对路径（用于 cd）
#
# 目录结构: output/YYYY-MM-DD_视频名/剪口播/{1_转录,2_分析,3_审核}
#

VIDEO_PATH="$1"
WORKSPACE_ROOT="${2:-$(pwd)}"

if [ -z "$VIDEO_PATH" ]; then
  echo "❌ 用法: ./setup_output.sh <VIDEO_PATH> [WORKSPACE_ROOT]" >&2
  exit 1
fi

VIDEO_NAME=$(basename "$VIDEO_PATH" .mp4)
DATE=$(date +%Y-%m-%d)
BASE_DIR="$WORKSPACE_ROOT/output/${DATE}_${VIDEO_NAME}/剪口播"

mkdir -p "$BASE_DIR/1_转录" "$BASE_DIR/2_分析" "$BASE_DIR/3_审核" "$BASE_DIR/common"

echo "$BASE_DIR"
