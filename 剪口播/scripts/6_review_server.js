#!/usr/bin/env node
/**
 * 审核服务器（多项目 / 多 Tab）
 *
 * 功能：
 * 1. 静态服务 review.html（脚本同目录）
 * 2. GET /api/projects — 项目列表
 * 3. GET /api/data/:id — 指定项目的 words + autoSelected
 * 4. GET /api/audio/:id — 指定项目的 audio.mp3（支持 Range）
 * 5. POST /api/cut/:id — 按项目执行剪辑
 *
 * 用法: node review_server.js [port] [root_path]
 * - root_path 由调用方（如 AI）传入；可传单项目目录（.../剪口播）或父目录（如 output/）。未传时兜底为 process.cwd() 或 ./output
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = parseInt(process.argv[2], 10) || 8899;
const ROOT_PATH = path.resolve(process.argv[3] || path.join(process.cwd(), 'output'));

const SCRIPT_DIR = __dirname;
const REVIEW_HTML_PATH = path.join(SCRIPT_DIR, 'review.html');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

// ---------- 项目解析 ----------
function getProjects() {
  const list = [];
  const common = path.join(ROOT_PATH, 'common');
  const wordsFile = path.join(common, 'subtitles_words_edited.json');
  const wordsFallback = path.join(common, 'subtitles_words.json');
  if (fs.existsSync(wordsFile) || fs.existsSync(wordsFallback)) {
    const id = path.basename(path.dirname(ROOT_PATH));
    list.push({
      id,
      name: id,
      path: ROOT_PATH,
      hasEdited: fs.existsSync(wordsFile)
    });
    return list;
  }
  if (!fs.existsSync(ROOT_PATH) || !fs.statSync(ROOT_PATH).isDirectory()) {
    return list;
  }
  const dirs = fs.readdirSync(ROOT_PATH);
  for (const d of dirs) {
    const projectRoot = path.join(ROOT_PATH, d, '剪口播');
    const commonDir = path.join(projectRoot, 'common');
    const edited = path.join(commonDir, 'subtitles_words_edited.json');
    const fallback = path.join(commonDir, 'subtitles_words.json');
    if (fs.existsSync(edited) || fs.existsSync(fallback)) {
      list.push({
        id: d,
        name: d,
        path: projectRoot,
        hasEdited: fs.existsSync(edited)
      });
    }
  }
  return list;
}

function getProjectById(projectId) {
  const projects = getProjects();
  return projects.find(p => p.id === projectId) || null;
}

function flattenWords(opted) {
  const out = [];
  for (const node of opted) {
    if (Array.isArray(node.words) && node.words.length > 0) {
      for (const w of node.words) {
        const start = typeof w.start_time === 'number' ? w.start_time / 1000 : (node.start_time || 0) / 1000;
        const end = typeof w.end_time === 'number' ? w.end_time / 1000 : (node.end_time || 0) / 1000;
        out.push({ start, end, text: (w.text || '').trim(), opt: w.opt || 'keep' });
      }
    } else {
      const start = (node.start_time || 0) / 1000;
      const end = (node.end_time || 0) / 1000;
      out.push({ start, end, text: (node.text || '').trim(), opt: node.opt || 'keep' });
    }
  }
  return out;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // GET /api/projects
  if (req.method === 'GET' && urlPath === '/api/projects') {
    try {
      const projects = getProjects();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(projects));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/data/:id
  const dataMatch = urlPath.match(/^\/api\/data\/(.+)$/);
  if (req.method === 'GET' && dataMatch) {
    const projectId = decodeURIComponent(dataMatch[1]);
    const project = getProjectById(projectId);
    if (!project) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Project not found' }));
      return;
    }
    try {
      const commonDir = path.join(project.path, 'common');
      const editedPath = path.join(commonDir, 'subtitles_words_edited.json');
      const wordsPath = path.join(commonDir, 'subtitles_words.json');
      const rawPath = fs.existsSync(editedPath) ? editedPath : wordsPath;
      const opted = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
      const words = flattenWords(opted);

      let autoSelected = [];
      const autoPath = path.join(project.path, '2_分析', 'auto_selected.json');
      if (fs.existsSync(autoPath)) {
        autoSelected = JSON.parse(fs.readFileSync(autoPath, 'utf8'));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ words, autoSelected }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/audio/:id
  const audioMatch = urlPath.match(/^\/api\/audio\/(.+)$/);
  if (req.method === 'GET' && audioMatch) {
    const projectId = decodeURIComponent(audioMatch[1]);
    const project = getProjectById(projectId);
    if (!project) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const audioPath = path.join(project.path, '1_转录', 'audio.mp3');
    if (!fs.existsSync(audioPath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const stat = fs.statSync(audioPath);
    if (req.headers.range) {
      const range = req.headers.range.replace('bytes=', '').split('-');
      const start = parseInt(range[0], 10);
      const end = range[1] ? parseInt(range[1], 10) : stat.size - 1;
      res.writeHead(206, {
        'Content-Type': 'audio/mpeg',
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      fs.createReadStream(audioPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(audioPath).pipe(res);
    }
    return;
  }

  // POST /api/cut/:id
  const cutMatch = urlPath.match(/^\/api\/cut\/(.+)$/);
  if (req.method === 'POST' && cutMatch) {
    const projectId = decodeURIComponent(cutMatch[1]);
    const project = getProjectById(projectId);
    if (!project) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Project not found' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const deleteList = JSON.parse(body);
        const parentDir = path.dirname(project.path);
        const videoFiles = fs.readdirSync(parentDir).filter(f => f.endsWith('.mp4'));
        const videoFile = videoFiles[0];
        if (!videoFile) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'No .mp4 in project folder' }));
          return;
        }
        const inputPath = path.join(parentDir, videoFile);
        const baseName = path.basename(videoFile, '.mp4');
        const outputFile = path.join(parentDir, `${baseName}_cut.mp4`);
        const deletePath = path.join(project.path, 'delete_segments.json');
        fs.writeFileSync(deletePath, JSON.stringify(deleteList, null, 2));
        console.log(`📝 保存 ${deleteList.length} 个删除片段: ${deletePath}`);

        const scriptPath = path.join(SCRIPT_DIR, '6_cut_video.sh');
        if (fs.existsSync(scriptPath)) {
          execSync(`bash "${scriptPath}" "${inputPath}" "${deletePath}" "${outputFile}"`, { stdio: 'inherit' });
        } else {
          executeFFmpegCut(inputPath, deleteList, outputFile, project.path);
        }

        const originalDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${inputPath}"`).toString().trim());
        const newDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${outputFile}"`).toString().trim());
        const deletedDuration = originalDuration - newDuration;
        const savedPercent = ((deletedDuration / originalDuration) * 100).toFixed(1);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          output: outputFile,
          originalDuration: originalDuration.toFixed(2),
          newDuration: newDuration.toFixed(2),
          deletedDuration: deletedDuration.toFixed(2),
          savedPercent: savedPercent,
          message: `剪辑完成: ${outputFile}`
        }));
      } catch (err) {
        console.error('❌ 剪辑失败:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 静态：review.html 从脚本目录提供
  if (urlPath === '/' || urlPath === '/review.html') {
    if (!fs.existsSync(REVIEW_HTML_PATH)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const stat = fs.statSync(REVIEW_HTML_PATH);
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': stat.size });
    fs.createReadStream(REVIEW_HTML_PATH).pipe(res);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// 检测可用的硬件编码器
function detectEncoder() {
  const platform = process.platform;
  const encoders = [];

  // 根据平台确定候选编码器
  if (platform === 'darwin') {
    encoders.push({ name: 'h264_videotoolbox', args: '-q:v 60', label: 'VideoToolbox (macOS)' });
  } else if (platform === 'win32') {
    encoders.push({ name: 'h264_nvenc', args: '-preset p4 -cq 20', label: 'NVENC (NVIDIA)' });
    encoders.push({ name: 'h264_qsv', args: '-global_quality 20', label: 'QSV (Intel)' });
    encoders.push({ name: 'h264_amf', args: '-quality balanced', label: 'AMF (AMD)' });
  } else {
    // Linux
    encoders.push({ name: 'h264_nvenc', args: '-preset p4 -cq 20', label: 'NVENC (NVIDIA)' });
    encoders.push({ name: 'h264_vaapi', args: '-qp 20', label: 'VAAPI (Linux)' });
  }

  // 软件编码兜底
  encoders.push({ name: 'libx264', args: '-preset fast -crf 18', label: 'x264 (软件)' });

  // 检测哪个可用
  for (const enc of encoders) {
    try {
      execSync(`ffmpeg -hide_banner -encoders 2>/dev/null | grep ${enc.name}`, { stdio: 'pipe' });
      console.log(`🎯 检测到编码器: ${enc.label}`);
      return enc;
    } catch (e) {
      // 该编码器不可用，继续检测下一个
    }
  }

  // 默认返回软件编码
  return { name: 'libx264', args: '-preset fast -crf 18', label: 'x264 (软件)' };
}

// 缓存编码器检测结果
let cachedEncoder = null;
function getEncoder() {
  if (!cachedEncoder) {
    cachedEncoder = detectEncoder();
  }
  return cachedEncoder;
}

// 内置 FFmpeg 剪辑逻辑（filter_complex 精确剪辑 + buffer + crossfade）
function executeFFmpegCut(input, deleteList, output, projectPath) {
  const BUFFER_MS = 50;
  const CROSSFADE_MS = 30;

  console.log(`⚙️ 优化参数: 扩展范围=${BUFFER_MS}ms, 音频crossfade=${CROSSFADE_MS}ms`);

  let audioOffset = 0;
  const audioPath = projectPath ? path.join(projectPath, '1_转录', 'audio.mp3') : 'audio.mp3';
  try {
    if (fs.existsSync(audioPath)) {
      const offsetCmd = `ffprobe -v error -show_entries format=start_time -of csv=p=0 "${audioPath}"`;
      audioOffset = parseFloat(execSync(offsetCmd).toString().trim()) || 0;
      if (audioOffset > 0) {
        console.log(`🔧 检测到音频偏移: ${audioOffset.toFixed(3)}s，自动补偿`);
      }
    }
  } catch (e) {
    // 忽略
  }

  // 获取视频总时长
  const probeCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${input}"`;
  const duration = parseFloat(execSync(probeCmd).toString().trim());

  const bufferSec = BUFFER_MS / 1000;
  const crossfadeSec = CROSSFADE_MS / 1000;

  // 补偿偏移 + 扩展删除范围（前后各加 buffer）
  const expandedDelete = deleteList
    .map(seg => ({
      start: Math.max(0, seg.start - audioOffset - bufferSec),
      end: Math.min(duration, seg.end - audioOffset + bufferSec)
    }))
    .sort((a, b) => a.start - b.start);

  // 合并重叠的删除段
  const mergedDelete = [];
  for (const seg of expandedDelete) {
    if (mergedDelete.length === 0 || seg.start > mergedDelete[mergedDelete.length - 1].end) {
      mergedDelete.push({ ...seg });
    } else {
      mergedDelete[mergedDelete.length - 1].end = Math.max(mergedDelete[mergedDelete.length - 1].end, seg.end);
    }
  }

  // 计算保留片段
  const keepSegments = [];
  let cursor = 0;

  for (const del of mergedDelete) {
    if (del.start > cursor) {
      keepSegments.push({ start: cursor, end: del.start });
    }
    cursor = del.end;
  }
  if (cursor < duration) {
    keepSegments.push({ start: cursor, end: duration });
  }

  console.log(`保留 ${keepSegments.length} 个片段，删除 ${mergedDelete.length} 个片段`);

  // 生成 filter_complex（带 crossfade）
  let filters = [];
  let vconcat = '';

  for (let i = 0; i < keepSegments.length; i++) {
    const seg = keepSegments[i];
    filters.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    filters.push(`[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    vconcat += `[v${i}]`;
  }

  // 视频直接 concat
  filters.push(`${vconcat}concat=n=${keepSegments.length}:v=1:a=0[outv]`);

  // 音频使用 acrossfade 逐个拼接（消除接缝咔声）
  if (keepSegments.length === 1) {
    filters.push(`[a0]anull[outa]`);
  } else {
    let currentLabel = 'a0';
    for (let i = 1; i < keepSegments.length; i++) {
      const nextLabel = `a${i}`;
      const outLabel = (i === keepSegments.length - 1) ? 'outa' : `amid${i}`;
      filters.push(`[${currentLabel}][${nextLabel}]acrossfade=d=${crossfadeSec.toFixed(3)}:c1=tri:c2=tri[${outLabel}]`);
      currentLabel = outLabel;
    }
  }

  const filterComplex = filters.join(';');

  const encoder = getEncoder();
  console.log(`✂️ 执行 FFmpeg 精确剪辑（${encoder.label}）...`);

  const cmd = `ffmpeg -y -i "file:${input}" -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v ${encoder.name} ${encoder.args} -c:a aac -b:a 192k "file:${output}"`;

  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`✅ 输出: ${output}`);

    const newDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${output}"`).toString().trim());
    console.log(`📹 新时长: ${newDuration.toFixed(2)}s`);
  } catch (err) {
    console.error('FFmpeg 执行失败，尝试分段方案...');
    executeFFmpegCutFallback(input, keepSegments, output);
  }
}

// 备用方案：分段切割 + concat（当 filter_complex 失败时使用）
function executeFFmpegCutFallback(input, keepSegments, output) {
  const tmpDir = `tmp_cut_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const partFiles = [];
    keepSegments.forEach((seg, i) => {
      const partFile = path.join(tmpDir, `part${i.toString().padStart(4, '0')}.mp4`);
      const segDuration = seg.end - seg.start;

      const encoder = getEncoder();
      const cmd = `ffmpeg -y -ss ${seg.start.toFixed(3)} -i "file:${input}" -t ${segDuration.toFixed(3)} -c:v ${encoder.name} ${encoder.args} -c:a aac -b:a 128k -avoid_negative_ts make_zero "${partFile}"`;

      console.log(`切割片段 ${i + 1}/${keepSegments.length}: ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s`);
      execSync(cmd, { stdio: 'pipe' });
      partFiles.push(partFile);
    });

    const listFile = path.join(tmpDir, 'list.txt');
    const listContent = partFiles.map(f => `file '${path.resolve(f)}'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${output}"`;
    console.log('合并片段...');
    execSync(concatCmd, { stdio: 'pipe' });

    console.log(`✅ 输出: ${output}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

server.listen(PORT, () => {
  const projects = getProjects();
  console.log(`
🎬 审核服务器已启动
📍 地址: http://localhost:${PORT}
📂 根路径: ${ROOT_PATH}
📋 项目数: ${projects.length}

操作说明:
1. 打开网页，选择项目 Tab
2. 审核选择要删除的片段，点击「🎬 执行剪辑」
  `);
});
