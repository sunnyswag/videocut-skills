import { html } from '../preact.js';

export function ControlsBar({
  videoRef,
  currentTime,
  duration,
  onTimeUpdate,
  onPlayPause,
  onCopyDeleteList,
  onExecuteCut,
  onClearAll,
  formatTime,
}) {
  return html`
    <div class="controls">
      <div class="buttons">
        <button id="btnPlay" onClick=${onPlayPause}>▶️ 播放/暂停</button>
        <select
          id="speed"
          onChange=${(e) => {
            if (videoRef.current) videoRef.current.playbackRate = parseFloat(e.target.value);
          }}
        >
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1" selected>1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
        <button id="btnCopy" onClick=${onCopyDeleteList}>📋 复制删除列表</button>
        <button id="btnCut" style="background:#9C27B0" onClick=${onExecuteCut}>🎬 执行剪辑</button>
        <label style="font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="burnSubtitle" /> 剪辑后烧录字幕
        </label>
        <button class="danger" id="btnClear" onClick=${onClearAll}>🗑️ 清空选择</button>
        <span id="time">${formatTime(currentTime)} / ${formatTime(duration)}</span>
      </div>

      <video id="videoPlayer" ref=${videoRef} preload="auto" onTimeUpdate=${onTimeUpdate}></video>

      <div class="help">
        <div><b>🖱️ 鼠标：</b>单击 = 跳转播放 | 双击 = 选中/取消 | Shift+拖动 = 批量选中/取消</div>
        <div><b>⌨️ 键盘：</b>空格 = 播放/暂停 | ← → = 跳转1秒 | Shift+←→ = 跳转5秒</div>
        <div><b>🎨 颜色：</b><span style="color:#ff9800">橙色</span> = AI预选 | <span style="color:#f44336">红色删除线</span> = 已确认删除 | 播放时自动跳过选中片段</div>
      </div>
    </div>
  `;
}
