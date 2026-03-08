import { html, render } from './preact.js';
import { formatTime } from './utils.js';
import { useReviewState } from './hooks/useReviewState.js';
import { LoadingOverlay } from './components/LoadingOverlay.js';
import { ProjectTabs } from './components/ProjectTabs.js';
import { ControlsBar } from './components/ControlsBar.js';
import { WordTimeline } from './components/WordTimeline.js';

function App() {
  const state = useReviewState();

  return html`
    <div>
      <${LoadingOverlay}
        loading=${state.loading}
        progressPercent=${state.progressPercent}
        progressText=${state.progressText}
      />
      <h1>审核稿</h1>
      <${ProjectTabs}
        projects=${state.projects}
        currentProjectId=${state.currentProjectId}
        errorText=${state.errorText}
        onSelect=${state.setCurrentProjectId}
      />
      <${ControlsBar}
        videoRef=${state.videoRef}
        currentTime=${state.currentTime}
        duration=${state.duration}
        onTimeUpdate=${state.handleVideoTimeUpdate}
        onPlayPause=${state.handlePlayPause}
        onCopyDeleteList=${state.handleCopyDeleteList}
        onExecuteCut=${state.handleExecuteCut}
        onClearAll=${state.handleClearAll}
        formatTime=${formatTime}
      />
      <${WordTimeline}
        words=${state.words}
        selected=${state.selected}
        autoSelected=${state.autoSelected}
        currentWordIndex=${state.currentWordIndex}
        wordRefs=${state.wordRefs}
        onWordClick=${state.handleWordClick}
        onToggleWord=${state.toggleWord}
        onWordMouseDown=${state.handleWordMouseDown}
        onWordMouseEnter=${state.handleWordMouseEnter}
        selectedDuration=${state.selectedDuration}
      />
    </div>
  `;
}

render(html`<${App} />`, document.body);

