import { useEffect, useMemo, useRef, useState } from '../preact.js';
import { formatDuration, mergeAdjacentSegments } from '../utils.js';
import { buildEditsPayload } from '../edits.js';
import { fetchProjects, fetchProjectData, executeProjectCut } from '../api.js';

export function useReviewState() {
  const videoRef = useRef(null);
  const wordRefs = useRef([]);
  const selectingRef = useRef({ active: false, start: -1, mode: 'add' });
  const skipRafRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [stateByProject, setStateByProject] = useState({});
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [loading, setLoading] = useState({ show: false, elapsed: 0, estimate: 0 });
  const [errorText, setErrorText] = useState('');

  const currentState = currentProjectId ? stateByProject[currentProjectId] : null;
  const words = currentState?.words || [];
  const selected = currentState?.selected || new Set();
  const autoSelected = currentState?.autoSelected || new Set();

  const selectedDuration = useMemo(() => {
    let total = 0;
    selected.forEach((i) => { total += (words[i]?.end || 0) - (words[i]?.start || 0); });
    return total;
  }, [selected, words]);

  const setProjectState = (projectId, updater) => {
    setStateByProject((prev) => {
      const prevState = prev[projectId];
      if (!prevState) return prev;
      const nextState = updater(prevState);
      return { ...prev, [projectId]: nextState };
    });
  };

  const loadOneProject = async (projectId) => {
    const data = await fetchProjectData(projectId);
    const projectWords = data.words || [];
    const projectAutoSelected = new Set(Array.isArray(data.autoSelected) ? data.autoSelected : []);
    const projectSelected = new Set(projectAutoSelected);
    setStateByProject((prev) => ({
      ...prev,
      [projectId]: {
        words: projectWords,
        autoSelected: projectAutoSelected,
        selected: projectSelected,
      },
    }));
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchProjects();
        setProjects(list);
        if (!list.length) return;
        setCurrentProjectId(list[0].id);
        for (const p of list) {
          // eslint-disable-next-line no-await-in-loop
          await loadOneProject(p.id);
        }
      } catch (err) {
        setErrorText(err.message || String(err));
      }
    })();
  }, []);

  useEffect(() => {
    if (!currentProjectId || !videoRef.current) return;
    videoRef.current.src = '/api/video/' + encodeURIComponent(currentProjectId);
    setCurrentTime(0);
    setDuration(0);
    setCurrentWordIndex(-1);
  }, [currentProjectId]);

  useEffect(() => {
    const onMouseUp = () => { selectingRef.current.active = false; };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      const video = videoRef.current;
      if (!video) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (video.paused) video.play(); else video.pause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - (e.shiftKey ? 5 : 1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        video.currentTime = video.currentTime + (e.shiftKey ? 5 : 1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const node = wordRefs.current[currentWordIndex];
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentWordIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentState) return undefined;

    const tick = () => {
      if (!video || video.paused || !currentProjectId) {
        skipRafRef.current = null;
        return;
      }
      const state = stateByProject[currentProjectId];
      if (!state) {
        skipRafRef.current = null;
        return;
      }
      const t = video.currentTime;
      const sortedSelected = Array.from(state.selected).sort((a, b) => a - b);
      for (let k = 0; k < sortedSelected.length; k += 1) {
        const i = sortedSelected[k];
        const w = state.words[i];
        if (!w) continue;
        if (t >= w.start && t < w.end) {
          let endTime = w.end;
          let j = k + 1;
          while (j < sortedSelected.length) {
            const nextW = state.words[sortedSelected[j]];
            if (nextW && nextW.start - endTime < 0.1) {
              endTime = nextW.end;
              j += 1;
            } else {
              break;
            }
          }
          video.currentTime = endTime;
          break;
        }
      }
      skipRafRef.current = requestAnimationFrame(tick);
    };

    const onPlay = () => {
      if (!skipRafRef.current) skipRafRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => { skipRafRef.current = null; };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      skipRafRef.current = null;
    };
  }, [currentProjectId, currentState, stateByProject]);

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !currentState) return;
    const t = video.currentTime || 0;
    const d = video.duration || 0;
    setCurrentTime(t);
    setDuration(d);
    const idx = currentState.words.findIndex((w) => t >= w.start && t < w.end);
    setCurrentWordIndex(idx);
  };

  const toggleWord = (i) => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, (state) => {
      const nextSelected = new Set(state.selected);
      if (nextSelected.has(i)) nextSelected.delete(i);
      else nextSelected.add(i);
      return { ...state, selected: nextSelected };
    });
  };

  const handleWordMouseDown = (e, i) => {
    if (!currentState || !e.shiftKey) return;
    selectingRef.current.active = true;
    selectingRef.current.start = i;
    selectingRef.current.mode = currentState.selected.has(i) ? 'remove' : 'add';
    e.preventDefault();
  };

  const handleWordMouseEnter = (i) => {
    const s = selectingRef.current;
    if (!s.active || !currentProjectId || !currentState) return;
    const min = Math.min(s.start, i);
    const max = Math.max(s.start, i);
    setProjectState(currentProjectId, (state) => {
      const nextSelected = new Set(state.selected);
      for (let j = min; j <= max; j += 1) {
        if (s.mode === 'add') nextSelected.add(j);
        else nextSelected.delete(j);
      }
      return { ...state, selected: nextSelected };
    });
  };

  const handleWordClick = (word) => {
    const video = videoRef.current;
    if (!video || selectingRef.current.active) return;
    video.currentTime = word.start;
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  const handleCopyDeleteList = async () => {
    if (!currentState) return;
    const sortedSelected = Array.from(currentState.selected).sort((a, b) => a - b);
    const segments = sortedSelected.map((i) => ({ start: currentState.words[i].start, end: currentState.words[i].end }));
    const merged = mergeAdjacentSegments(segments);
    await navigator.clipboard.writeText(JSON.stringify(merged, null, 2));
    alert('已复制 ' + merged.length + ' 个删除片段到剪贴板');
  };

  const handleClearAll = () => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, (state) => ({ ...state, selected: new Set() }));
  };

  const handleExecuteCut = async () => {
    if (!currentProjectId || !currentState) return;
    const burnSubtitle = document.getElementById('burnSubtitle').checked;
    const payload = buildEditsPayload(currentState.words, currentState.selected, burnSubtitle);
    if (!payload.deletes.length) {
      alert('请先选择要删除的内容');
      return;
    }

    const estimated = Math.max(5, Math.ceil((duration || 0) / 4));
    const estMin = Math.floor(estimated / 60);
    const estSec = estimated % 60;
    const estText = estMin > 0 ? `${estMin}分${estSec}秒` : `${estSec}秒`;
    if (!confirm(`确认执行剪辑？\n\n📹 当前项目: ${currentProjectId}\n⏱️ 预计耗时: ${estText}\n\n点击确定开始`)) return;

    const start = Date.now();
    setLoading({ show: true, elapsed: 0, estimate: estimated });
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setLoading((prev) => ({ ...prev, elapsed }));
    }, 500);

    try {
      const data = await executeProjectCut(currentProjectId, payload);
      clearInterval(timer);
      setLoading({ show: false, elapsed: 0, estimate: 0 });
      const totalTime = ((Date.now() - start) / 1000).toFixed(1);
      if (data.success) {
        const subtitleMsg = data.subtitleOutput ? `\n字幕输出: ${data.subtitleOutput}` : '';
        alert(`✅ 剪辑完成！(耗时 ${totalTime}s)\n\n📁 输出: ${data.output}${subtitleMsg}\n\n原时长: ${formatDuration(data.originalDuration)}\n新时长: ${formatDuration(data.newDuration)}\n删减: ${formatDuration(data.deletedDuration)} (${data.savedPercent}%)`);
      } else {
        alert('❌ 剪辑失败: ' + data.error);
      }
    } catch (err) {
      clearInterval(timer);
      setLoading({ show: false, elapsed: 0, estimate: 0 });
      alert('❌ 请求失败: ' + err.message + '\n\n请确保使用 review_server.js 启动服务');
    }
  };

  const progressPercent = loading.estimate > 0
    ? Math.min(95, (loading.elapsed / loading.estimate) * 100)
    : 0;
  const progressText = loading.elapsed >= loading.estimate
    ? '即将完成...'
    : `预估剩余: ${Math.max(0, loading.estimate - loading.elapsed)} 秒`;

  return {
    videoRef,
    wordRefs,
    projects,
    currentProjectId,
    setCurrentProjectId,
    words,
    selected,
    autoSelected,
    currentTime,
    duration,
    currentWordIndex,
    loading,
    errorText,
    selectedDuration,
    progressPercent,
    progressText,
    handleVideoTimeUpdate,
    handlePlayPause,
    handleCopyDeleteList,
    handleExecuteCut,
    handleClearAll,
    handleWordClick,
    toggleWord,
    handleWordMouseDown,
    handleWordMouseEnter,
  };
}
