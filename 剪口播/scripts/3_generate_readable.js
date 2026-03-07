#!/usr/bin/env node
/**
 * 从 common/subtitles_words.json 生成层级易读格式 readable.txt
 *
 * 格式：句/块行 i|内容；字行 j|字。所有下标 0-based，与 edits.json 的 pathSet 一致，不含时间列。
 *
 * 用法: node generate_readable.js [subtitles_words.json]
 * 输出: readable.txt
 */

const fs = require('fs');
const path = require('path');

const optedFile = process.argv[2] || '../common/subtitles_words.json';
const resolvedPath = path.resolve(optedFile);

if (!fs.existsSync(resolvedPath)) {
  console.error('❌ 找不到文件:', optedFile);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

const lines = [];

function blankSec(node) {
  const startMs = typeof node.start_time === 'number' ? node.start_time : 0;
  const endMs = typeof node.end_time === 'number' ? node.end_time : startMs;
  return ((endMs - startMs) / 1000).toFixed(2);
}

function emitBlock(items, baseIndex) {
  if (!Array.isArray(items)) return;
  items.forEach((node, k) => {
    const idx = baseIndex == null ? String(k) : `${k}`;
    if (node.opt === 'blank') {
      lines.push(`${idx}|blank_${blankSec(node)}s`);
    } else {
      lines.push(`${idx}|${(node.text || '').trim()}`);
      emitBlock(node.words, idx);
    }
  });
}

emitBlock(data, null);

const outPath = path.join(process.cwd(), 'readable.txt');
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log('✅ 已保存', outPath);
