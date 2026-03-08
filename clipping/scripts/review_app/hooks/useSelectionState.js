import { useEffect, useRef } from '../preact.js';

export function useSelectionState({ videoRef, currentProjectId, currentState, setProjectState, onSeekToTime }) {
  const selectingRef = useRef({ active: false, start: -1, mode: 'add' });

  useEffect(() => {
    const onMouseUp = () => { selectingRef.current.active = false; };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

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
    if (onSeekToTime) {
      onSeekToTime(word.start);
      return;
    }
    video.currentTime = word.start;
  };

  const handleClearAll = () => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, (state) => ({ ...state, selected: new Set() }));
  };

  return {
    toggleWord,
    handleWordMouseDown,
    handleWordMouseEnter,
    handleWordClick,
    handleClearAll,
  };
}
