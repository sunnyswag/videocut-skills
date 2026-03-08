import { html } from '../preact.js';

export function WordTimeline({
  words,
  selected,
  autoSelected,
  currentWordIndex,
  wordRefs,
  onWordClick,
  onToggleWord,
  onWordMouseDown,
  onWordMouseEnter,
  selectedDuration,
}) {
  return html`
    <div>
      <div class="content">
        ${words.map((word, i) => {
          const isGap = word.opt === 'del';
          const isSelected = selected.has(i);
          const isAuto = autoSelected.has(i);
          const isCurrent = i === currentWordIndex;
          const cls = `${isGap ? 'gap' : 'word'} ${isSelected ? 'selected' : ''} ${!isSelected && isAuto ? 'ai-selected' : ''} ${isCurrent ? 'current' : ''}`.trim();
          return html`
            <div
              key=${i}
              ref=${(el) => { wordRefs.current[i] = el; }}
              class=${cls}
              onClick=${() => onWordClick(word)}
              onDblClick=${() => onToggleWord(i)}
              onMouseDown=${(e) => onWordMouseDown(e, i)}
              onMouseEnter=${() => onWordMouseEnter(i)}
            >
              ${isGap ? `⏸ ${(word.end - word.start).toFixed(1)}s` : word.text}
            </div>
          `;
        })}
      </div>
      <div class="stats">已选择 ${selected.size} 个元素，总时长 ${selectedDuration.toFixed(2)}s</div>
    </div>
  `;
}
