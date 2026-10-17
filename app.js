// app.js - 神話図鑑ページ。ゲームのQR(URLの # 以降にデータ)を読み、出会ったキャラだけを並べる。
(function () {
  'use strict';
  var L = window.DexLib;
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function showError(msg) {
    var box = $('error');
    box.textContent = msg;
    box.hidden = false;
    $('dex').hidden = true;
    $('summary').hidden = true;
  }

  function entryOf(dexJson, id) {
    for (var i = 0; i < dexJson.entries.length; i++) if (dexJson.entries[i].id === id) return dexJson.entries[i];
    return null;
  }

  function card(dexJson, id, kills, saveId) {
    var ent = entryOf(dexJson, id);
    var th = (ent && ent.thresholds) || dexJson.thresholds;
    var t = L.tier(kills, th);
    var c = el('article', 'card tier' + t);
    c.setAttribute('data-id', id);

    var pic = el('div', 'pic');
    if (ent && ent.image && t >= 1) {
      var img = el('img');
      img.alt = '';
      img.src = ent.image;
      img.onerror = function () { img.remove(); pic.classList.add('noimg'); };
      pic.appendChild(img);
    } else {
      pic.classList.add('noimg');
    }
    c.appendChild(pic);

    var body = el('div', 'body');
    var title = (ent && t >= 1) ? ent.name : '？？？';
    body.appendChild(el('h2', null, title));
    if (!ent) {
      body.appendChild(el('p', 'note', '(この図鑑ページにはまだ載っていません。ページを更新するとわかるかもしれません)'));
    } else if (t >= 1) {
      body.appendChild(el('p', 'kami', ent.kamiName));
    } else {
      body.appendChild(el('p', 'note', 'まだ たおしていない。' + th[0] + '体たおすと名前がわかる。'));
    }

    // 進捗: 次のしきい値に対する「27/30体」
    var next = L.nextThreshold(kills, th);
    var prog = el('div', 'progress');
    var bar = el('div', 'bar');
    var fill = el('div', 'fill');
    var goal = next === null ? th[th.length - 1] : next;
    fill.style.width = Math.min(100, Math.round(100 * kills / goal)) + '%';
    bar.appendChild(fill);
    prog.appendChild(bar);
    prog.appendChild(el('span', 'count', next === null ? kills + '体 (全部ひらいた)' : kills + '/' + next + '体'));
    body.appendChild(prog);

    if (ent && t >= 2) {
      var sec = el('div', 'sec');
      sec.appendChild(el('h3', null, '神話での背景'));
      sec.appendChild(el('p', null, ent.background));
      if (ent.shrine) {
        sec.appendChild(el('h3', null, '祀られている神社'));
        sec.appendChild(el('p', null, ent.shrine));
      }
      body.appendChild(sec);
    }
    if (ent && t >= 3) {
      var sec3 = el('div', 'sec');
      sec3.appendChild(el('h3', null, '秘話・小ネタ'));
      sec3.appendChild(el('p', null, ent.trivia));
      body.appendChild(sec3);
    }
    if (t >= th.length) {
      var pw = el('div', 'pw');
      pw.appendChild(el('span', 'pwlabel', 'パスワード'));
      pw.appendChild(el('span', 'pwcode', L.password(saveId, id)));
      pw.appendChild(el('span', 'pwhelp', 'ゲームでセーブしたあと「パスワード」を選んで入力すると、ごほうびがもらえます。'));
      body.appendChild(pw);
    }
    c.appendChild(body);
    return c;
  }

  function render(dexJson, p) {
    $('error').hidden = true;
    $('intro').hidden = true;
    var list = $('dex');
    list.textContent = '';
    var known = 0, unknown = 0, totalKills = 0, total = dexJson.entries.length;
    for (var i = 0; i < L.N_ENTRIES; i++) {
      totalKills += p.kills[i];
      if (!p.met[i] && p.kills[i] === 0) continue;
      list.appendChild(card(dexJson, i, p.kills[i], p.saveId));
      if (entryOf(dexJson, i)) known++; else unknown++;
    }
    var shown = known + unknown;
    list.hidden = false;
    var sum = $('summary');
    sum.hidden = false;
    sum.textContent = '';
    sum.appendChild(el('span', 'big', known + ' / ' + total));
    sum.appendChild(el('span', null, ' 体に出会った  ・  たおした数 ' + totalKills + '体'));
    if (unknown) sum.appendChild(el('span', 'sid', 'このページに載っていない ' + unknown + '体にも出会っています(ページが古いかもしれません)'));
    sum.appendChild(el('span', 'sid', 'セーブID ' + ('00000' + p.saveId.toString(16).toUpperCase()).slice(-6)));
    if (shown === 0) list.appendChild(el('p', 'note', 'まだ だれにも出会っていません。'));
  }

  function load(dexJson, text) {
    try {
      render(dexJson, L.parseFragment(text));
    } catch (e) {
      showError(e.code ? e.message : 'うまく読み取れませんでした: ' + e.message);
    }
  }

  function start() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'dex.json?v=' + Date.now());
    xhr.onload = function () {
      var dexJson;
      try { dexJson = JSON.parse(xhr.responseText); } catch (e) { return showError('dex.json を読み込めませんでした'); }
      var hash = location.hash;
      if (hash && hash.length > 1) load(dexJson, hash);
      else $('intro').hidden = false;
      // QRを使わず、URL全体を貼り付けて開く(PCなど)
      $('paste-form').onsubmit = function (ev) {
        ev.preventDefault();
        $('intro').hidden = true;
        load(dexJson, $('paste').value);
      };
      window.addEventListener('hashchange', function () { if (location.hash.length > 1) load(dexJson, location.hash); });
    };
    xhr.onerror = function () { showError('dex.json を読み込めませんでした(ファイルを直接開かず、ページとして公開した場所で開いてください)'); };
    xhr.send();
  }

  start();
})();
