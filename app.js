'use strict';

// ===== 色の変換ユーティリティ =====
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const wrapHue = (h) => ((h % 360) + 360) % 360;
const rand = (min, max) => min + Math.random() * (max - min);

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}
function hslToRgb({ h, s, l }) {
  h = wrapHue(h); s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}
const hexToHsl = (hex) => rgbToHsl(hexToRgb(hex));
const hslToHex = (h, s, l) => rgbToHex(hslToRgb({ h, s, l }));

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const DARK_TEXT = '#1D1A22';
const textColorFor = (hex) => (contrast(hex, '#FFFFFF') >= contrast(hex, DARK_TEXT) ? '#FFFFFF' : DARK_TEXT);

function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({ r: ca.r + (cb.r - ca.r) * t, g: ca.g + (cb.g - ca.g) * t, b: ca.b + (cb.b - ca.b) * t });
}

// ===== 配色の生成 =====
const HUE_SETS = {
  complementary: [0, 180],
  triadic: [0, 120, 240],
  tetradic: [0, 90, 180, 270],
  split: [0, 150, 210],
};
const LIGHT_OFFSETS = [0, 18, -18, 30, -30, 8, -8];

function harmonyColors(baseHex, mode, n) {
  const { h, s, l } = hexToHsl(baseHex);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5; // -0.5 〜 0.5
    switch (mode) {
      case 'analogous':
        out.push(hslToHex(h + (i - (n - 1) / 2) * 26, clamp(s + t * 10, 25, 100), clamp(l + t * 24, 15, 90)));
        break;
      case 'monochrome':
        out.push(hslToHex(h, clamp(s * (0.75 + Math.abs(t) * 0.5), 10, 95), 90 - (i / Math.max(1, n - 1)) * 72));
        break;
      case 'pastel':
        out.push(hslToHex(h + i * (360 / n) + rand(-12, 12), rand(62, 85), rand(80, 88)));
        break;
      case 'random':
        out.push(hslToHex(rand(0, 360), rand(40, 85), rand(30, 82)));
        break;
      default: {
        const hues = HUE_SETS[mode];
        const round = Math.floor(i / hues.length);
        const off = LIGHT_OFFSETS[round % LIGHT_OFFSETS.length];
        out.push(hslToHex(h + hues[i % hues.length], clamp(s - round * 6, 20, 100), clamp(l + off, 12, 92)));
      }
    }
  }
  return out;
}

function randomBase() {
  return hslToHex(rand(0, 360), rand(50, 85), rand(45, 70));
}

// ===== 状態 =====
const $ = (sel) => document.querySelector(sel);
const els = {
  base: $('#baseColor'),
  baseHex: $('#baseHex'),
  harmony: $('#harmony'),
  count: $('#count'),
  countLabel: $('#countLabel'),
  palette: $('#palette'),
  shades: $('#shades'),
  preview: $('#preview'),
  exportCode: $('#exportCode'),
  savedList: $('#savedList'),
  name: $('#paletteName'),
  aiList: $('#aiList'),
  toast: $('#toast'),
};

let colors = []; // { hex, locked }
let exportFormat = 'css';

// "#fff" / "fff" / "#FF8FB8" / "ff8fb8" を受け付けて "#ff8fb8" 形式にする。不正なら null
function parseHex(text) {
  const m = text.trim().replace(/^#/, '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const v = m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join('') : m[1];
  return '#' + v.toLowerCase();
}

// ピッカーと16進数入力の両方にベース色を反映する
function setBase(hex) {
  els.base.value = hex.toLowerCase();
  els.baseHex.value = hex.toUpperCase();
  els.baseHex.classList.remove('invalid');
}

function regenerate({ newBase = false } = {}) {
  if (newBase && els.harmony.value !== 'random') setBase(randomBase());
  const n = Number(els.count.value);
  const fresh = harmonyColors(els.base.value, els.harmony.value, n);
  colors = fresh.map((hex, i) => (colors[i] && colors[i].locked ? colors[i] : { hex, locked: false }));
  render();
  refreshNameSuggestion();
}

// 保存済みや AI のパレットを編集エリアに読み込む
function loadPalette(hexes, name) {
  colors = hexes.map((hex) => ({ hex, locked: false }));
  els.count.value = colors.length;
  els.countLabel.textContent = colors.length;
  setBase(colors[0].hex);
  render();
  refreshNameSuggestion(name);
  toast(`「${name}」を読み込みました`, colors[0].hex);
}

// 名前欄のプレースホルダーに名前の候補を出す (空のまま保存するとこの名前になる)
let nameSuggestion = '';
function refreshNameSuggestion(name) {
  nameSuggestion = name || suggestName(colors.map((c) => hexToHsl(c.hex)));
  els.name.placeholder = nameSuggestion;
}

// ===== ひらめきパレット =====
// シャッフルしたデッキから順に引くので、全部見終わるまで同じパレットは出ない
const AI_COUNT = 6;
let deck = [];

function drawPalettes(n) {
  const out = [];
  while (out.length < n) {
    if (!deck.length) deck = shuffled(PALETTE_LIBRARY);
    out.push(deck.pop());
  }
  return out;
}

function renderAiPalettes() {
  els.aiList.innerHTML = '';
  drawPalettes(AI_COUNT).forEach((p, i) => {
    const card = document.createElement('button');
    card.className = 'ai-card';
    card.style.animationDelay = `${i * 50}ms`;
    const strip = p.colors.map((h) => `<span style="background:${h}" title="${h}"></span>`).join('');
    card.innerHTML = `<span class="strip">${strip}</span><span class="ai-name"></span><span class="ai-hex">${p.colors.join(' ')}</span>`;
    card.querySelector('.ai-name').textContent = p.name;
    card.addEventListener('click', () => loadPalette(p.colors, p.name));
    els.aiList.appendChild(card);
  });
}

// ===== アイコン =====
const ICONS = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

// ===== 描画 =====
function render() {
  renderSwatches();
  renderPanels();
}

function renderPanels() {
  renderShades();
  renderPreview();
  renderExport();
  updateHash();
}

function renderSwatches() {
  els.palette.innerHTML = '';
  colors.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'swatch';
    el.innerHTML = `
      <div class="tools">
        <button class="icon-btn lock ${c.locked ? 'on' : ''}" title="${c.locked ? '固定を解除' : 'この色を固定'}" aria-label="固定">${c.locked ? ICONS.lock : ICONS.unlock}</button>
        <label class="icon-btn" title="色を変更" aria-label="色を変更">${ICONS.palette}<input type="color" value="${c.hex.toLowerCase()}"></label>
        <button class="icon-btn copy" title="コピー" aria-label="コピー">${ICONS.copy}</button>
        ${colors.length > 2 ? `<button class="icon-btn remove" title="この色を削除" aria-label="削除">${ICONS.trash}</button>` : ''}
      </div>
      <div class="info">
        <button class="hex" title="クリックでコピー"></button>
        <div class="meta"></div>
        <div class="badges"></div>
      </div>`;
    updateSwatch(el, c.hex);

    el.querySelector('.lock').addEventListener('click', () => { c.locked = !c.locked; renderSwatches(); });
    el.querySelector('.hex').addEventListener('click', () => copyText(c.hex, `${c.hex} をコピーしました`, c.hex));
    el.querySelector('.copy').addEventListener('click', () => copyText(c.hex, `${c.hex} をコピーしました`, c.hex));
    const picker = el.querySelector('input[type="color"]');
    // ドラッグ中はスウォッチだけ更新し、確定したら全体を描き直す
    picker.addEventListener('input', () => {
      c.hex = picker.value.toUpperCase();
      c.locked = true;
      updateSwatch(el, c.hex);
      renderPanels();
    });
    picker.addEventListener('change', () => renderSwatches());
    const remove = el.querySelector('.remove');
    if (remove) {
      remove.addEventListener('click', () => {
        colors.splice(i, 1);
        els.count.value = colors.length;
        els.countLabel.textContent = colors.length;
        render();
      });
    }
    els.palette.appendChild(el);
  });
}

function updateSwatch(el, hex) {
  const fg = textColorFor(hex);
  el.style.backgroundColor = hex;
  el.style.color = fg;
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = hexToHsl(hex);
  el.querySelector('.hex').textContent = hex;
  el.querySelector('.meta').innerHTML =
    `rgb(${r}, ${g}, ${b})<br>hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  const cw = contrast(hex, '#FFFFFF');
  const cb = contrast(hex, DARK_TEXT);
  el.querySelector('.badges').innerHTML = [['白', cw], ['黒', cb]]
    .map(([label, v]) => `<span class="badge ${v < 4.5 ? 'ng' : ''}" title="${label}文字とのコントラスト比 (4.5 以上で WCAG AA)">${label} ${v.toFixed(1)}</span>`)
    .join('');
}

function renderShades() {
  els.shades.innerHTML = '';
  for (const c of colors) {
    const { h, s } = hexToHsl(c.hex);
    const row = document.createElement('div');
    row.className = 'shade-row';
    for (let k = 0; k < 9; k++) {
      const hex = hslToHex(h, s, 94 - k * 10.5);
      const b = document.createElement('button');
      b.style.background = hex;
      b.style.color = textColorFor(hex);
      b.textContent = hex.slice(1);
      b.title = hex;
      b.addEventListener('click', () => copyText(hex, `${hex} をコピーしました`, hex));
      row.appendChild(b);
    }
    els.shades.appendChild(row);
  }
}

function renderPreview() {
  const byLum = [...colors].map((c) => c.hex).sort((a, b) => luminance(b) - luminance(a));
  const lightest = byLum[0];
  const darkest = byLum[byLum.length - 1];
  const vivid = [...colors].map((c) => c.hex).sort((a, b) => hexToHsl(b).s - hexToHsl(a).s)[0];
  const cardBg = mix(lightest, '#FFFFFF', 0.65);
  const text = contrast(darkest, cardBg) >= 4.5 ? darkest : DARK_TEXT;

  els.preview.style.background = lightest;
  const card = els.preview.querySelector('.pv-card');
  card.style.background = cardBg;
  card.style.color = text;
  const others = colors.map((c) => c.hex).filter((h) => h !== vivid);
  const accent2 = others[Math.floor(others.length / 2)] || vivid;
  els.preview.querySelector('.pv-avatar').style.background = `linear-gradient(135deg, ${vivid}, ${accent2})`;
  els.preview.querySelectorAll('.pv-tags span').forEach((tag, i) => {
    const c = colors[i % colors.length].hex;
    const bg = mix(c, '#FFFFFF', 0.7);
    tag.style.background = bg;
    tag.style.color = contrast(c, bg) >= 3 ? c : textColorFor(bg);
  });
  const btn = els.preview.querySelector('.pv-btn');
  btn.style.background = vivid;
  btn.style.color = textColorFor(vivid);
  els.preview.querySelector('.pv-btn.ghost').style.color = contrast(vivid, cardBg) >= 3 ? vivid : text;
}

function exportText(format = exportFormat) {
  const hexes = colors.map((c) => c.hex);
  switch (format) {
    case 'css':
      return `:root {\n${hexes.map((h, i) => `  --color-${i + 1}: ${h};`).join('\n')}\n}`;
    case 'scss':
      return hexes.map((h, i) => `$color-${i + 1}: ${h};`).join('\n');
    case 'json':
      return JSON.stringify({ colors: hexes.map((hex) => ({ hex, rgb: hexToRgb(hex) })) }, null, 2);
    default:
      return JSON.stringify(hexes);
  }
}

function renderExport() {
  els.exportCode.textContent = exportText();
}

// ===== URL 共有 =====
function updateHash() {
  const hash = '#' + colors.map((c) => c.hex.slice(1).toLowerCase()).join('-');
  history.replaceState(null, '', hash);
}
function loadFromHash() {
  const parts = location.hash.slice(1).split('-').filter((p) => /^[0-9a-f]{6}$/i.test(p));
  if (parts.length < 2) return false;
  colors = parts.slice(0, 8).map((p) => ({ hex: '#' + p.toUpperCase(), locked: false }));
  els.count.value = colors.length;
  els.countLabel.textContent = colors.length;
  setBase(colors[0].hex);
  return true;
}

// ===== コピー & トースト =====
let toastTimer = 0;
// メッセージにはパレット名など入力された文字が入るので、HTML としてではなく文字として表示する
function toast(message, swatch) {
  els.toast.replaceChildren();
  if (swatch) {
    const chip = document.createElement('i');
    chip.style.background = swatch;
    els.toast.appendChild(chip);
  }
  els.toast.append(message);
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1600);
}

async function copyText(text, message, swatch) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    // file:// などで Clipboard API が使えないときの代替
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(message, swatch);
}

// ===== PNG 書き出し =====
function downloadPng() {
  const cv = document.createElement('canvas');
  cv.width = 1200;
  cv.height = 630;
  const c = cv.getContext('2d');
  const w = cv.width / colors.length;
  colors.forEach((col, i) => {
    c.fillStyle = col.hex;
    c.fillRect(Math.floor(i * w), 0, Math.ceil(w) + 1, cv.height);
    c.fillStyle = textColorFor(col.hex);
    c.font = '700 30px "JetBrains Mono", Consolas, monospace';
    c.textAlign = 'center';
    c.fillText(col.hex, i * w + w / 2, cv.height - 60);
  });
  const a = document.createElement('a');
  a.download = `palette-${colors.map((x) => x.hex.slice(1)).join('-')}.png`;
  a.href = cv.toDataURL('image/png');
  a.click();
  toast('PNG を保存しました');
}

// ===== 保存 (localStorage) =====
const STORE_KEY = 'colorPaletteMaker.saved';
// 保存データは書き換えられている可能性もあるので、形の正しいものだけ使う
function loadSaved() {
  let list;
  try { list = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (_) { return []; }
  if (!Array.isArray(list)) return [];
  return list.filter((item) => item && typeof item.name === 'string'
    && Array.isArray(item.colors) && item.colors.length >= 2
    && item.colors.every((h) => typeof h === 'string' && /^#[0-9A-F]{6}$/i.test(h)));
}
function writeSaved(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (_) { toast('保存できませんでした'); }
}

function renderSaved() {
  const list = loadSaved();
  els.savedList.innerHTML = '';
  if (!list.length) {
    els.savedList.innerHTML = '<li class="empty">まだ保存されたパレットはありません</li>';
    return;
  }
  for (const item of list) {
    const li = document.createElement('li');
    li.title = 'クリックで読み込み';
    const mini = item.colors.map((h) => `<span style="background:${h}"></span>`).join('');
    li.innerHTML = `<div class="mini">${mini}</div><span class="name"></span><button class="icon-btn" title="削除" aria-label="削除">${ICONS.trash}</button>`;
    li.querySelector('.name').textContent = item.name;
    li.addEventListener('click', () => loadPalette(item.colors, item.name));
    li.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      writeSaved(loadSaved().filter((x) => x.id !== item.id));
      renderSaved();
    });
    els.savedList.appendChild(li);
  }
}

function savePalette() {
  const list = loadSaved();
  const name = els.name.value.trim() || nameSuggestion;
  list.unshift({ id: Date.now(), name, colors: colors.map((c) => c.hex) });
  writeSaved(list);
  els.name.value = '';
  renderSaved();
  toast(`「${name}」を保存しました`, colors[0].hex);
}

// ===== イベント =====
$('#generate').addEventListener('click', () => regenerate({ newBase: true }));
els.base.addEventListener('input', () => {
  setBase(els.base.value);
  regenerate();
});

// 16進数入力: 6桁がそろった時点で即反映。3桁の省略形は Enter かフォーカスを外したときに反映
els.baseHex.addEventListener('input', () => {
  const raw = els.baseHex.value.trim().replace(/^#/, '');
  const hex = parseHex(raw);
  els.baseHex.classList.toggle('invalid', raw.length > 0 && !/^[0-9a-f]{0,6}$/i.test(raw));
  if (hex && raw.length === 6) {
    els.base.value = hex;
    regenerate();
  }
});
const commitBaseHex = () => {
  const hex = parseHex(els.baseHex.value);
  if (hex && hex !== els.base.value) {
    setBase(hex);
    regenerate();
  } else {
    setBase(els.base.value); // 不正な入力は元の色に戻す
  }
};
els.baseHex.addEventListener('change', commitBaseHex);
els.baseHex.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { commitBaseHex(); els.baseHex.select(); }
});
els.harmony.addEventListener('change', () => regenerate());
els.count.addEventListener('input', () => {
  els.countLabel.textContent = els.count.value;
  regenerate();
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    exportFormat = tab.dataset.format;
    renderExport();
  });
});
$('#copyExport').addEventListener('click', () => copyText(exportText(), 'コードをコピーしました'));
$('#copyLink').addEventListener('click', () => copyText(location.href, '共有リンクをコピーしました'));
$('#downloadPng').addEventListener('click', downloadPng);
$('#save').addEventListener('click', savePalette);
$('#suggestName').addEventListener('click', () => {
  refreshNameSuggestion();
  els.name.value = nameSuggestion;
});
$('#shuffleAi').addEventListener('click', renderAiPalettes);
els.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') savePalette(); });

addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
  e.preventDefault();
  regenerate({ newBase: true });
});

// ===== 初期化 =====
if (loadFromHash()) { render(); refreshNameSuggestion(); }
else regenerate({ newBase: true });
renderAiPalettes();
setBase(els.base.value);
renderSaved();
