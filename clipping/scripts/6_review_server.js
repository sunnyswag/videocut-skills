#!/usr/bin/env node
/**
 * 审核服务器（多项目 / 多 Tab）
 *
 * 功能：
 * 1. 返回审核页 HTML 壳（加载 review_app/app.js）
 * 2. GET /api/projects — 项目列表
 * 3. GET /api/data/:id — 指定项目的 words + autoSelected
 * 4. GET /api/video/:id — 指定项目的源视频（支持 Range）
 * 5. POST /api/cut/:id — 按项目执行剪辑
 *
 * 用法: node review_server.js [port] [root_path]
 * - root_path 由调用方（如 AI）传入；可传单项目目录（.../clipping）或父目录（如 output/）。未传时兜底为 process.cwd() 或 ./output
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { cutVideo } = require('./6_cut_video');
const { deepClone, applyEditsToOpted, buildDeleteSegmentsFromDeletes } = require('./edits_utils');
const { generateSrt, buildSubtitlesFromEditedOpted, burnSubtitles } = require('./subtitle_utils');

const PORT = parseInt(process.argv[2], 10) || 8899;
const ROOT_PATH = path.resolve(process.argv[3] || path.join(process.cwd(), 'output'));

const SCRIPT_DIR = __dirname;
const REVIEW_HTML_PATH = path.join(SCRIPT_DIR, 'review_app', 'review.html');

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
    const projectRoot = path.join(ROOT_PATH, d, 'clipping');
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

function findVideoFile(project) {
  const parentDir = path.dirname(project.path);
  const mp4s = fs.readdirSync(parentDir).filter(f => f.endsWith('.mp4') && !f.endsWith('_cut.mp4'));
  if (mp4s.length > 0) return path.join(parentDir, mp4s[0]);

  const macroDir = path.join(ROOT_PATH, '..', 'macro_notes');
  if (fs.existsSync(macroDir)) {
    const videoName = project.id.replace(/^\d{4}-\d{2}-\d{2}_/, '');
    const candidate = path.join(macroDir, videoName + '.mp4');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function flattenWords(opted) {
  const out = [];
  opted.forEach((node, parentIndex) => {
    const parentOpt = node.opt || 'keep';
    if (Array.isArray(node.words) && node.words.length > 0) {
      node.words.forEach((w, childIndex) => {
        const start = typeof w.start_time === 'number' ? w.start_time / 1000 : (node.start_time || 0) / 1000;
        const end = typeof w.end_time === 'number' ? w.end_time / 1000 : (node.end_time || 0) / 1000;
        const opt = parentOpt === 'del' ? 'del' : (w.opt || 'keep');
        out.push({ start, end, text: (w.text || '').trim(), opt, parentIndex, childIndex });
      });
    } else {
      const start = (node.start_time || 0) / 1000;
      const end = (node.end_time || 0) / 1000;
      out.push({ start, end, text: (node.text || '').trim(), opt: parentOpt, parentIndex, childIndex: undefined });
    }
  });
  return out;
}

function loadProjectWordsRaw(project) {
  const commonDir = path.join(project.path, 'common');
  const editedPath = path.join(commonDir, 'subtitles_words_edited.json');
  const wordsPath = path.join(commonDir, 'subtitles_words.json');
  const rawPath = fs.existsSync(editedPath) ? editedPath : wordsPath;
  return {
    rawPath,
    opted: JSON.parse(fs.readFileSync(rawPath, 'utf8')),
  };
}

function normalizeEditsPayload(payload) {
  if (Array.isArray(payload)) {
    return { deletes: payload.map((seg) => ({ start: seg.start, end: seg.end })), burnSubtitle: false };
  }

  const deletes = Array.isArray(payload?.deletes) ? payload.deletes : [];
  const burnSubtitle = Boolean(payload?.burnSubtitle);

  return { deletes, burnSubtitle };
}

function handleGetProjects(req, res) {
  try {
    const projects = getProjects();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(projects));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleGetData(req, res, m) {
  const projectId = decodeURIComponent(m[1]);
  const project = getProjectById(projectId);
  if (!project) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Project not found' }));
    return;
  }
  try {
    const { opted } = loadProjectWordsRaw(project);
    const words = flattenWords(opted);
    const autoSelected = [];
    words.forEach((w, i) => { if (w.opt === 'del') autoSelected.push(i); });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ words, autoSelected }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleGetVideo(req, res, m) {
  const projectId = decodeURIComponent(m[1]);
  const project = getProjectById(projectId);
  if (!project) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  const videoPath = findVideoFile(project);
  if (!videoPath) {
    res.writeHead(404);
    res.end('Video not found');
    return;
  }
  const stat = fs.statSync(videoPath);
  if (req.headers.range) {
    const range = req.headers.range.replace('bytes=', '').split('-');
    const start = parseInt(range[0], 10);
    const end = range[1] ? parseInt(range[1], 10) : stat.size - 1;
    res.writeHead(206, {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
    });
    fs.createReadStream(videoPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(videoPath).pipe(res);
  }
}

function handlePostCut(req, res, m) {
  const projectId = decodeURIComponent(m[1]);
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
      const requestPayload = JSON.parse(body);
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
      const { opted } = loadProjectWordsRaw(project);
      const normalized = normalizeEditsPayload(requestPayload);
      const deleteSegments = buildDeleteSegmentsFromDeletes(opted, normalized.deletes);

      if (deleteSegments.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '删除片段为空，请先选择要删除的内容' }));
        return;
      }

      const editsPath = path.join(project.path, 'edits.json');
      const deletePath = path.join(project.path, 'delete_segments.json');
      fs.writeFileSync(editsPath, JSON.stringify({ deletes: normalized.deletes }, null, 2));
      fs.writeFileSync(deletePath, JSON.stringify(deleteSegments, null, 2));
      console.log(`📝 保存编辑: ${editsPath}`);
      console.log(`📝 保存 ${deleteSegments.length} 个删除片段: ${deletePath}`);

      const cutResult = cutVideo(inputPath, deleteSegments, outputFile, project.path);
      const originalDuration = cutResult.originalDuration;
      const newDuration = cutResult.newDuration;
      const deletedDuration = originalDuration - newDuration;
      const savedPercent = ((deletedDuration / originalDuration) * 100).toFixed(1);

      let subtitleOutput = null;
      let srtPath = null;
      if (normalized.burnSubtitle) {
        const editedOpted = applyEditsToOpted(deepClone(opted), { deletes: normalized.deletes });
        const subtitles = buildSubtitlesFromEditedOpted(editedOpted, cutResult.audioOffset, cutResult.keepSegments);
        srtPath = path.join(parentDir, `${baseName}_cut.srt`);
        fs.writeFileSync(srtPath, generateSrt(subtitles));
        subtitleOutput = path.join(parentDir, `${baseName}_cut_字幕.mp4`);
        burnSubtitles(outputFile, srtPath, subtitleOutput);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        output: outputFile,
        subtitleOutput,
        srtPath,
        editsPath,
        deletePath,
        originalDuration: originalDuration.toFixed(2),
        newDuration: newDuration.toFixed(2),
        deletedDuration: deletedDuration.toFixed(2),
        savedPercent: savedPercent,
        message: normalized.burnSubtitle ? `剪辑+烧录完成: ${subtitleOutput || outputFile}` : `剪辑完成: ${outputFile}`
      }));
    } catch (err) {
      console.error('❌ 剪辑失败:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  });
}

function handleReviewHtml(req, res) {
  if (!fs.existsSync(REVIEW_HTML_PATH)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  const stat = fs.statSync(REVIEW_HTML_PATH);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': stat.size });
  fs.createReadStream(REVIEW_HTML_PATH).pipe(res);
}

function handleReviewAsset(req, res, m) {
  const relativePath = decodeURIComponent(m[1] || '');
  if (!relativePath) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const assetRoot = path.join(SCRIPT_DIR, 'review_app');
  const assetPath = path.normalize(path.join(assetRoot, relativePath));
  if (!assetPath.startsWith(assetRoot + path.sep)) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(assetPath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(assetPath);
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size });
  fs.createReadStream(assetPath).pipe(res);
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

  const routes = [
    { method: 'GET', match: (p) => p === '/api/projects' && [], handler: handleGetProjects },
    { method: 'GET', match: (p) => p.match(/^\/api\/data\/(.+)$/), handler: handleGetData },
    { method: 'GET', match: (p) => p.match(/^\/api\/video\/(.+)$/), handler: handleGetVideo },
    { method: 'POST', match: (p) => p.match(/^\/api\/cut\/(.+)$/), handler: handlePostCut },
    { method: 'GET', match: (p) => p.match(/^\/review_app\/(.+)$/), handler: handleReviewAsset },
    { method: 'GET', match: (p) => (p === '/' || p === '/review.html') && [], handler: handleReviewHtml },
  ];

  let handled = false;
  routes.forEach((route) => {
    if (handled) return;
    if (req.method !== route.method) return;
    const matchResult = route.match(urlPath);
    if (!matchResult) return;
    route.handler(req, res, matchResult);
    handled = true;
  });

  if (!handled) {
    res.writeHead(404);
    res.end('Not Found');
  }
});

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
