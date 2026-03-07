#!/usr/bin/env node
/**
 * 在 volcengine_result 上做 opt 与 gap 插入，输出 common/subtitles_words.json
 *
 * - 删除所有 "attribute": { "event": "speech" }（保留根 attribute.extra）
 * - 为每个 utterance、每个 word 添加 opt: "keep"
 * - 在相邻两项时间间隔 > 100ms 处插入 gap 节点 { opt: "blank", start_time, end_time }
 *
 * 用法: node generate_subtitles.js <volcengine_result.json>
 * 输出: common/subtitles_words.json（与 1_转录 同级的 common 目录）
 */

const fs = require('fs');
const path = require('path');

const sourceFile = process.argv[2] || 'volcengine_result.json';
const GAP_MS = 100;

function removeSpeechAttribute(obj) {
  if (obj && typeof obj === 'object' && obj.attribute && obj.attribute.event === 'speech') {
    const keys = Object.keys(obj.attribute);
    if (keys.length === 1 && keys[0] === 'event') {
      delete obj.attribute;
    }
  }
}

function makeGapNode(startTime, endTime) {
  return { opt: 'blank', start_time: startTime, end_time: endTime };
}

function isEmptyNode(item) {
  const text = (item.text != null ? String(item.text) : '').trim();
  const start = typeof item.start_time === 'number' ? item.start_time : 0;
  const end = typeof item.end_time === 'number' ? item.end_time : start;
  return start === end && !text;
}

function editNode(cur) {
  removeSpeechAttribute(cur);
  cur.opt = 'keep';
}

function produceGapNode(cur, preEndTime) {
  const currStart = typeof cur.start_time === 'number' ? cur.start_time : preEndTime;
  const gapMs = currStart - preEndTime;
  return gapMs > GAP_MS ? makeGapNode(preEndTime, currStart) : null;
}

function loopItems(items, parentStartTime = 0) {
  if (!Array.isArray(items)) return;
  let i = 0;
  while (i < items.length) {
    if (isEmptyNode(items[i])) {
      items.splice(i, 1);
      continue;
    }
    editNode(items[i]);

    const preEndTime = i > 0 ? items[i - 1].end_time : parentStartTime;
    const gap = produceGapNode(items[i], preEndTime);
    if (gap) {
      items.splice(i, 0, gap);
      i++;
    }
    loopItems(items[i].words, items[i].start_time);
    i++;
  }
}

if (!fs.existsSync(sourceFile)) {
  console.error('❌ 找不到文件:', sourceFile);
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));

if (!Array.isArray(source.utterances)) {
  console.error('❌ 缺少 utterances 数组');
  process.exit(1);
}

loopItems(source.utterances);

const outDir = path.dirname(path.dirname(path.resolve(sourceFile)));
const outFile = path.join(outDir, "common", "subtitles_words.json");
fs.writeFileSync(outFile, JSON.stringify(source.utterances, null, 2), 'utf8');
console.log('✅ 已保存', outFile);
