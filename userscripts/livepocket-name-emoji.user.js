// ==UserScript==
// @name         LivePocket 名字 → 自定义显示（本机，带输入面板）
// @namespace    pokemon-card
// @version      2.0.0
// @description  仅在本机浏览器中，把 LivePocket 页面上显示的姓/名替换成你手动输入的文字或 emoji（不改服务器数据，不影响他人）。页面右下角有浮动面板可随时编辑。
// @match        https://t.livepocket.jp/*
// @match        https://livepocket.jp/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 配置存取（本机持久化） ----------
  const STORE_KEY = 'lp_name_custom_v2';
  const defaults = {
    on: true,
    origLast: '', // 原姓：页面上现在显示的姓（要被替换的文字）
    origFirst: '',    // 原名：页面上现在显示的名（可留空）
    dispLast: '',   // 显示姓：想显示成什么
    dispFirst: '',    // 显示名：想显示成什么
  };
  let state;
  try {
    state = Object.assign({}, defaults, JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
  } catch (_) {
    state = Object.assign({}, defaults);
  }
  const save = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  };

  // ---------- 替换逻辑 ----------
  // 为每个文字节点记住它「原本的文字」，这样改配置后能从原文重新计算，
  // 开关关闭时也能完整还原。
  const baselines = new WeakMap();

  function transform(base) {
    if (!state.on) return base;
    let out = base;
    if (state.origLast) out = out.split(state.origLast).join(state.dispLast);
    if (state.origFirst) out = out.split(state.origFirst).join(state.dispFirst);
    return out;
  }

  function processNode(node) {
    let base = baselines.get(node);
    if (base === undefined) {
      // 第一次见到：只盯住包含原姓/原名的节点，避免无谓追踪整页文字
      const v = node.nodeValue || '';
      const hit = (state.origLast && v.includes(state.origLast)) ||
                  (state.origFirst && v.includes(state.origFirst));
      if (!hit) return;
      base = v;
      baselines.set(node, base);
    }
    const t = transform(base);
    if (node.nodeValue !== t) node.nodeValue = t;
  }

  function scan(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { processNode(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(processNode);
  }

  // 已追踪的节点在改配置后要重算，所以保留一份列表的替代方案：全量扫描。
  // 全量扫描靠 TreeWalker，节点若已被改过，baselines 里有原文，可正确重算。
  const rescanAll = () => scan(document.body);

  // ---------- 浮动输入面板 ----------
  function buildPanel() {
    const wrap = document.createElement('div');
    wrap.id = 'lp-name-custom-panel';
    wrap.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483647',
      'font-family:system-ui,-apple-system,sans-serif', 'font-size:14px',
    ].join(';');

    // 切换按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '🎭';
    toggleBtn.title = '自定义显示名字';
    toggleBtn.style.cssText = [
      'width:44px', 'height:44px', 'border-radius:50%', 'border:none',
      'background:#222', 'color:#fff', 'font-size:20px', 'cursor:pointer',
      'box-shadow:0 2px 8px rgba(0,0,0,.3)', 'display:block', 'margin-left:auto',
    ].join(';');

    // 面板主体
    const box = document.createElement('div');
    box.style.cssText = [
      'display:none', 'margin-top:8px', 'width:240px', 'padding:12px',
      'background:#fff', 'color:#222', 'border-radius:12px',
      'box-shadow:0 4px 20px rgba(0,0,0,.25)',
    ].join(';');

    const mkField = (labelText, key, placeholder) => {
      const label = document.createElement('label');
      label.style.cssText = 'display:block;margin:8px 0 2px;font-weight:600;';
      label.textContent = labelText;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = state[key] || '';
      input.placeholder = placeholder || '';
      input.style.cssText = [
        'width:100%', 'box-sizing:border-box', 'padding:8px',
        'border:1px solid #ccc', 'border-radius:8px', 'font-size:15px',
      ].join(';');
      // 边打边替换；阻止冒泡避免干扰页面
      const onChange = () => { state[key] = input.value; save(); rescanAll(); };
      input.addEventListener('input', onChange);
      ['keydown', 'keyup', 'click'].forEach(ev =>
        input.addEventListener(ev, e => e.stopPropagation()));
      box.appendChild(label);
      box.appendChild(input);
      return input;
    };

    // 开关
    const onRow = document.createElement('label');
    onRow.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:600;';
    const onBox = document.createElement('input');
    onBox.type = 'checkbox';
    onBox.checked = !!state.on;
    onBox.addEventListener('change', () => { state.on = onBox.checked; save(); rescanAll(); });
    onRow.appendChild(onBox);
    onRow.appendChild(document.createTextNode('启用替换'));
    box.appendChild(onRow);

    mkField('原姓（要被替换的）', 'origLast', '例如 山田');
    mkField('原名（可留空）', 'origFirst', '');
    mkField('显示姓', 'dispLast', 'emoji 或任意文字');
    mkField('显示名', 'dispFirst', '');

    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:10px;font-size:12px;color:#888;line-height:1.5;';
    hint.textContent = '仅改本机显示，服务器与他人看到的不变。配置已自动保存。';
    box.appendChild(hint);

    toggleBtn.addEventListener('click', () => {
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    });

    wrap.appendChild(toggleBtn);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
  }

  // ---------- 启动 ----------
  rescanAll();
  buildPanel();

  // 页面异步渲染/切换时，处理新出现的内容
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.id === 'lp-name-custom-panel' || (n.closest && n.closest('#lp-name-custom-panel'))) continue;
        scan(n);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
