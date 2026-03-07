#!/usr/bin/env node
/**
 * 将 edits.json 应用到 common/subtitles_words.json，写出 common/subtitles_words_edited.json
 *
 * pathSet 约定（所有下标 0-based）：
 *   { parent: i }                    → opted[i]（整个 item）
 *   { parent: i, children: [j, k] }  → opted[i].words[j], opted[i].words[k]（单个/多个子节点）
 *
 * 操作：deletes（标记删除）、textChanges（修正文字）、combines（合并多子节点）
 * 应用完成后自动由子节点文本重建父节点 text。
 *
 * 用法: node apply_edits.js <subtitles_words.json> [edits.json]
 * 输出: subtitles_words_edited.json（与输入同目录）
 */

const fs = require('fs');
const path = require('path');

const optedFile = process.argv[2] || 'common/subtitles_words.json';
const editsFile = process.argv[3] || path.join(path.dirname(path.resolve(optedFile)), '..', '2_分析', 'edits.json');

if (!fs.existsSync(optedFile)) {
  console.error('❌ 找不到 opted 文件:', optedFile);
  process.exit(1);
}

const opted = JSON.parse(fs.readFileSync(optedFile, 'utf8'));

if (!Array.isArray(opted) || opted.length === 0) {
  console.error('❌ opted 不是数组或为空');
  process.exit(1);
}

if (!fs.existsSync(editsFile)) {
  console.error('❌ 找不到 edits 文件:', editsFile);
  process.exit(1);
}

const edits = JSON.parse(fs.readFileSync(editsFile, 'utf8'));

function processItem(items, func, str) {
  if (!Array.isArray(items)) return;
  for (const editItem of items) {
    const parent = opted[editItem.pathSet.parent];
    if ('children' in editItem.pathSet) {
      const sorted = editItem.pathSet.children.sort((a, b) => a - b);
      for (let i = 0; i < sorted.length; i++)
        func(parent.words[sorted[i]], editItem, i);
    } else {
      func(parent, editItem, 0);
    }
  }
  console.log(`已应用 ${str}:`, items.length, '个节点');
}

// 1. deletes
processItem(edits.deletes, (node) => {
  node.opt = 'del';
}, 'deletes');

// 2. textChanges
processItem(edits.textChanges, (node, editItem) => {
  node.text = String(editItem.newText);
  node.opt = 'edit';
}, 'textChanges');

// 3. combines：首个子节点保留合并文本和时间范围，其余标记删除
processItem(edits.combines, (() => {
  let first = null;
  return (node, editItem, i) => {
    if (i === 0) {
      first = node;
      node.text = String(editItem.newText);
      node.opt = 'edit';
    } else {
      if (typeof node.start_time === 'number' &&
          (typeof first.start_time !== 'number' || node.start_time < first.start_time))
        first.start_time = node.start_time;
      if (typeof node.end_time === 'number' &&
          (typeof first.end_time !== 'number' || node.end_time > first.end_time))
        first.end_time = node.end_time;
      node.opt = 'del';
    }
  };
})(), 'combines');

// 4. 递归重建父节点 text（由非 del 子节点拼接）
function rebuildText(items) {
  if (!Array.isArray(items)) return;
  for (const node of items) {
    if (Array.isArray(node.words) && node.words.length > 0) {
      rebuildText(node.words);
      node.text = node.words
        .filter(w => w.opt !== 'del')
        .map(w => (w.text || '').trim())
        .join('');
    }
  }
}

rebuildText(opted);

// 5. 输出
const outDir = path.dirname(path.resolve(optedFile));
const outFile = path.join(outDir, 'subtitles_words_edited.json');
fs.writeFileSync(outFile, JSON.stringify(opted, null, 2), 'utf8');
console.log('✅ 已保存', outFile);
