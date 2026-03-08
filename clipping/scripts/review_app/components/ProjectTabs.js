import { html } from '../preact.js';

export function ProjectTabs({ projects, currentProjectId, errorText, onSelect }) {
  return html`
    <div class="tabs">
      ${projects.length === 0 && !errorText
        ? html`<div class="empty-state">暂无项目，请先运行剪口播流程生成数据。</div>`
        : null}
      ${errorText ? html`<div class="empty-state">加载失败: ${errorText}</div>` : null}
      ${projects.map((p) => html`
        <button
          class=${`tab ${p.id === currentProjectId ? 'active' : ''}`}
          onClick=${() => onSelect(p.id)}
        >
          ${p.name}
        </button>
      `)}
    </div>
  `;
}
