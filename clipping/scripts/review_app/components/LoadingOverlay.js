import { html } from '../preact.js';

export function LoadingOverlay({ loading, progressPercent, progressText }) {
  return html`
    <div class=${`loading-overlay ${loading.show ? 'show' : ''}`}>
      <div class="loading-spinner"></div>
      <div class="loading-text">🎬 正在剪辑中...</div>
      <div class="loading-progress-container">
        <div class="loading-progress-bar" style=${`width:${progressPercent}%`}></div>
      </div>
      <div class="loading-time">已等待 ${loading.elapsed} 秒</div>
      <div class="loading-estimate">${loading.show ? progressText : '预估剩余: 计算中...'}</div>
    </div>
  `;
}
