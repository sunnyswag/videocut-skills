import { html, memo } from '../preact.js';

const WordItem = memo(({ word, index, isGap, isSelected, isAuto, isCurrent, wordRefs, onWordClick, onToggleWord, onWordMouseDown, onWordMouseEnter }) => {
  const cls = `${isGap ? 'gap' : 'word'} ${isSelected ? 'selected' : ''} ${!isSelected && isAuto ? 'ai-selected' : ''} ${isCurrent ? 'current' : ''}`.trim();
  return html`
    <div
      ref=${(el) => { wordRefs.current[index] = el; }}
      class=${cls}
      onClick=${() => onWordClick(word)}
      onDblClick=${() => onToggleWord(index)}
      onMouseDown=${(e) => onWordMouseDown(e, index)}
      onMouseEnter=${() => onWordMouseEnter(index)}
    >
      ${isGap ? `⏸ ${(word.end - word.start).toFixed(1)}s` : word.text}
    </div>
  `;
}, (prev, next) =>
  prev.word === next.word &&
  prev.isSelected === next.isSelected &&
  prev.isAuto === next.isAuto &&
  prev.isCurrent === next.isCurrent
);

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
        ${words.map((word, i) => html`
          <${WordItem}
            key=${i}
            word=${word}
            index=${i}
            isGap=${word.opt === 'del'}
            isSelected=${selected.has(i)}
            isAuto=${autoSelected.has(i)}
            isCurrent=${i === currentWordIndex}
            wordRefs=${wordRefs}
            onWordClick=${onWordClick}
            onToggleWord=${onToggleWord}
            onWordMouseDown=${onWordMouseDown}
            onWordMouseEnter=${onWordMouseEnter}
          />
        `)}
      </div>
      <div class="stats">已选择 ${selected.size} 个元素，总时长 ${selectedDuration.toFixed(2)}s</div>
    </div>
  `;
}
