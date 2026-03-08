import { useEffect, useRef, useState } from '../preact.js';

function buildSelectedRanges(words, selectedSet) {
  const sortedSelected = Array.from(selectedSet).sort((a, b) => a - b);
  const ranges = [];
  for (let k = 0; k < sortedSelected.length; k += 1) {
    const i = sortedSelected[k];
    const w = words[i];
    if (!w) continue;
    let start = w.start;
    let end = w.end;
    let j = k + 1;
    while (j < sortedSelected.length) {
      const nextW = words[sortedSelected[j]];
      if (nextW && nextW.start - end < 0.1) {
        end = nextW.end;
        j += 1;
      } else {
        break;
      }
    }
    ranges.push({ start, end });
    k = j - 1;
  }
  return ranges;
}

function findWordIndexAtTime(words, t) {
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = words[mid];
    if (!w) return -1;
    if (t < w.start) {
      hi = mid - 1;
    } else if (t >= w.end) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }
  return -1;
}

export function useVideoPlayerState({ videoRef, wordRefs, currentProjectId, currentState, stateByProject }) {
  const skipRafRef = useRef(null);
  const selectedRangesRef = useRef([]);
  const wordsRef = useRef([]);
  const lastTimeUiUpdateRef = useRef(0);
  const currentWordIndexRef = useRef(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);

  useEffect(() => {
    if (!currentProjectId || !videoRef.current) return;
    videoRef.current.src = '/api/video/' + encodeURIComponent(currentProjectId);
    setCurrentTime(0);
    setDuration(0);
    setCurrentWordIndex(-1);
  }, [currentProjectId, videoRef]);

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
  }, [videoRef]);

  useEffect(() => {
    const node = wordRefs.current[currentWordIndex];
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentWordIndex, wordRefs]);

  useEffect(() => {
    const state = currentProjectId ? stateByProject[currentProjectId] : null;
    wordsRef.current = state?.words || [];
    selectedRangesRef.current = state ? buildSelectedRanges(state.words, state.selected) : [];
  }, [currentProjectId, stateByProject]);

  const syncCurrentByTime = (t, d, forceUi = false) => {
    const now = performance.now();
    if (forceUi || now - lastTimeUiUpdateRef.current >= 120) {
      setCurrentTime(t);
      setDuration(d || 0);
      lastTimeUiUpdateRef.current = now;
    }

    const idx = findWordIndexAtTime(wordsRef.current, t);
    if (idx !== currentWordIndexRef.current) {
      currentWordIndexRef.current = idx;
      setCurrentWordIndex(idx);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentProjectId) return undefined;

    const tick = () => {
      if (!video || video.paused || !currentProjectId) {
        skipRafRef.current = null;
        return;
      }
      const t = video.currentTime;
      const ranges = selectedRangesRef.current;
      for (let i = 0; i < ranges.length; i += 1) {
        const range = ranges[i];
        if (t >= range.start && t < range.end) {
          video.currentTime = range.end;
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
  }, [currentProjectId, videoRef]);

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !currentState) return;
    const t = video.currentTime || 0;
    const d = video.duration || 0;
    syncCurrentByTime(t, d, false);
  };

  const seekToTime = (targetTime) => {
    const video = videoRef.current;
    if (!video) return;
    const t = Math.max(0, targetTime || 0);
    video.currentTime = t;
    syncCurrentByTime(t, video.duration || duration, true);
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  return {
    currentTime,
    duration,
    currentWordIndex,
    handleVideoTimeUpdate,
    handlePlayPause,
    seekToTime,
  };
}
