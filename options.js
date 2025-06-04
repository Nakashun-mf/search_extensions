const boxesList = document.getElementById('boxes-list');
const addBoxBtn = document.getElementById('add-box');
const editArea = document.getElementById('edit-area');

// ドラッグ＆ドロップ用変数
let dragSrcIdx = null;

// インポート・エクスポート
const exportBtn = document.getElementById('export-btn');
const importFile = document.getElementById('import-file');

// 検索ボックス一覧を表示
async function renderList() {
  const data = await chrome.storage.local.get('searchBoxes');
  const boxes = data.searchBoxes || [];
  boxesList.innerHTML = '';
  boxes.forEach((box, idx) => {
    const div = document.createElement('div');
    div.className = 'box-item';
    div.setAttribute('draggable', 'true');
    div.setAttribute('data-idx', idx);
    div.innerHTML = `
      <div class="box-info">
        <b>${box.label}</b>：<span>${box.url}</span>
      </div>
      <div class="box-actions">
        <button data-edit="${idx}">編集</button>
        <button data-del="${idx}">削除</button>
        <span class="drag-hint">☰</span>
      </div>
    `;
    // ドラッグイベント
    div.ondragstart = e => {
      dragSrcIdx = idx;
      div.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    };
    div.ondragend = () => {
      dragSrcIdx = null;
      document.querySelectorAll('.box-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
    };
    div.ondragover = e => {
      e.preventDefault();
      if (dragSrcIdx !== null && dragSrcIdx !== idx) {
        div.classList.add('drag-over');
      }
    };
    div.ondragleave = () => {
      div.classList.remove('drag-over');
    };
    div.ondrop = async e => {
      e.preventDefault();
      if (dragSrcIdx !== null && dragSrcIdx !== idx) {
        // 並び替え
        const moved = boxes.splice(dragSrcIdx, 1)[0];
        boxes.splice(idx, 0, moved);
        await chrome.storage.local.set({searchBoxes: boxes});
        renderList();
      }
    };
    boxesList.appendChild(div);
  });
  // 編集・削除ボタン
  boxesList.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.onclick = () => showEditForm(btn.dataset.edit);
  });
  boxesList.querySelectorAll('button[data-del]').forEach(btn => {
    btn.onclick = async () => {
      const data = await chrome.storage.local.get('searchBoxes');
      const boxes = data.searchBoxes || [];
      boxes.splice(btn.dataset.del, 1);
      await chrome.storage.local.set({searchBoxes: boxes});
      renderList();
    };
  });
}

// 編集フォーム表示
function showEditForm(idx) {
  chrome.storage.local.get('searchBoxes', data => {
    const boxes = data.searchBoxes || [];
    const box = boxes[idx] || {label: '', url: ''};
    // URLがGoogle検索形式なら簡単モードとみなす
    let isSimple = false;
    let prefix = '';
    const googlePattern = /^https:\/\/www\.google\.com\/search\?q=([^ ]+) \{query\}$/;
    const match = box.url.match(googlePattern);
    if (match) {
      isSimple = true;
      prefix = decodeURIComponent(match[1]);
    }
    editArea.innerHTML = `
      <h2>${idx === undefined ? '新規追加' : '編集'}</h2>
      <div class="mode-switch">
        <input type="radio" name="mode" id="mode-simple" value="simple" ${isSimple ? 'checked' : ''}>
        <label for="mode-simple" class="mode-btn${isSimple ? ' selected' : ''}">簡単モード</label>
        <input type="radio" name="mode" id="mode-custom" value="custom" ${!isSimple ? 'checked' : ''}>
        <label for="mode-custom" class="mode-btn${!isSimple ? ' selected' : ''}">カスタムモード</label>
      </div>
      <div id="simple-area" style="display:${isSimple ? 'block' : 'none'};margin-bottom:8px;">
        <label>ラベル: <input id="edit-label-simple" value="${box.label || ''}"></label><br>
        <label>先頭に付ける文字列: <input id="edit-prefix" value="${prefix}"></label><br>
        <small>例：「wiki」と入力すると「wiki 検索語」でGoogle検索します</small>
      </div>
      <div id="custom-area" style="display:${!isSimple ? 'block' : 'none'};margin-bottom:8px;">
        <label>ラベル: <input id="edit-label" value="${box.label || ''}"></label><br>
        <label>検索URL: <input id="edit-url" value="${box.url || ''}"></label><br>
        <small>※ 検索語の位置に{query}を使ってください（複数可）</small><br>
      </div>
      <button id="save-box">保存</button>
      <button id="cancel-edit">キャンセル</button>
    `;
    editArea.style.display = 'block';
    // モード切り替え
    const modeBtns = editArea.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.onclick = () => {
        modeBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const simple = btn.htmlFor === 'mode-simple';
        editArea.querySelector('#mode-simple').checked = simple;
        editArea.querySelector('#mode-custom').checked = !simple;
        editArea.querySelector('#simple-area').style.display = simple ? 'block' : 'none';
        editArea.querySelector('#custom-area').style.display = simple ? 'none' : 'block';
      };
    });
    document.getElementById('save-box').onclick = async () => {
      const mode = editArea.querySelector('input[name="mode"]:checked').value;
      let label, url;
      if (mode === 'simple') {
        label = document.getElementById('edit-label-simple').value.trim();
        const prefix = document.getElementById('edit-prefix').value.trim();
        if (!label) {
          alert('ラベルを入力してください');
          return;
        }
        // Google検索URLを自動生成
        url = `https://www.google.com/search?q=${encodeURIComponent(prefix)}%20{query}`;
      } else {
        label = document.getElementById('edit-label').value.trim();
        url = document.getElementById('edit-url').value.trim();
        if (!label) {
          alert('ラベルを入力してください');
          return;
        }
        if (!url || !url.includes('{query}')) {
          alert('URLを入力し、URLに{query}を含めてください');
          return;
        }
      }
      if (idx === undefined) boxes.push({label, url});
      else boxes[idx] = {label, url};
      await chrome.storage.local.set({searchBoxes: boxes});
      editArea.style.display = 'none';
      renderList();
    };
    document.getElementById('cancel-edit').onclick = () => {
      editArea.style.display = 'none';
    };
  });
}

addBoxBtn.onclick = () => showEditForm();

// 初期表示
renderList();

exportBtn.onclick = async () => {
  const data = await chrome.storage.local.get('searchBoxes');
  const json = JSON.stringify(data.searchBoxes || [], null, 2);
  const blob = new Blob([json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'searchBoxes.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

importFile.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('形式が不正です');
    await chrome.storage.local.set({searchBoxes: arr});
    alert('インポートしました');
    renderList();
  } catch (err) {
    alert('インポートに失敗しました: ' + err.message);
  }
  importFile.value = '';
}; 