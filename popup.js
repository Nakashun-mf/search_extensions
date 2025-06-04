// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('search-boxes');
  const addBoxBtn = document.getElementById('add-box');
  const editArea = document.getElementById('edit-area');

  // ドラッグ＆ドロップ用変数
  let dragSrcIdx = null;

  async function renderList() {
    const data = await chrome.storage.local.get('searchBoxes');
    const boxes = data.searchBoxes || [];
    container.innerHTML = '';
    boxes.forEach((box, idx) => {
      const div = document.createElement('div');
      div.className = 'search-box';
      div.setAttribute('draggable', 'true');
      div.setAttribute('data-idx', idx);
      div.innerHTML = `
        <div class="btn-row">
          <input type="text" id="input-${idx}" placeholder="${box.label} を入力">
          <button id="btn-${idx}" title="検索"><span style="vertical-align:middle;">🔍</span></button>
          <button class="edit-btn" data-edit="${idx}" title="編集"><span style="vertical-align:middle;">✏️</span></button>
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
        container.querySelectorAll('.search-box').forEach(el => el.classList.remove('dragging', 'drag-over'));
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
          const moved = boxes.splice(dragSrcIdx, 1)[0];
          boxes.splice(idx, 0, moved);
          await chrome.storage.local.set({searchBoxes: boxes});
          renderList();
        }
      };
      container.appendChild(div);
    });
    // 検索ボタン・エンターキー
    boxes.forEach((box, idx) => {
      const input = document.getElementById(`input-${idx}`);
      const search = () => {
        const query = input.value;
        if (!query) return;
        const url = box.url.split('{query}').join(encodeURIComponent(query));
        window.open(url, '_blank');
      };
      document.getElementById(`btn-${idx}`).onclick = search;
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') search();
      });
    });
    // 編集ボタン
    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = () => showEditForm(btn.dataset.edit);
    });
  }

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
        ${idx !== undefined ? '<button id="del-box" style="background:#e53935;">削除</button>' : ''}
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
      if (idx !== undefined) {
        document.getElementById('del-box').onclick = async () => {
          boxes.splice(idx, 1);
          await chrome.storage.local.set({searchBoxes: boxes});
          editArea.style.display = 'none';
          renderList();
        };
      }
      document.getElementById('cancel-edit').onclick = () => {
        editArea.style.display = 'none';
      };
    });
  }

  addBoxBtn.onclick = () => showEditForm();

  renderList();
}); 