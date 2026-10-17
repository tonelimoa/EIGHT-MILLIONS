// app.js - 神話図鑑ページ。ゲームのQR(URLの # 以降にデータ)を読み、出会ったキャラだけを並べる。
// 文字は ｜漢字《かんじ》 の形式でふりがなが入っている(dex.json は tools/add_ruby.py、UIの文字は ui.js)。
(function () {
  'use strict';
  var L = window.DexLib;
  var UI = window.UI || {};
  var $ = function (id) { return document.getElementById(id); };

  // text を parent に追加。 ｜漢字《かんじ》 は <ruby> にする(innerHTMLは使わない)
  function rich(parent, text) {
    var re = /｜([^《]+)《([^》]+)》/g, last = 0, m;
    text = String(text);
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var r = document.createElement('ruby');
      r.appendChild(document.createTextNode(m[1]));
      var rt = document.createElement('rt');
      rt.textContent = m[2];
      r.appendChild(rt);
      parent.appendChild(r);
      last = re.lastIndex;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    return parent;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) rich(e, text);
    return e;
  }

  function showError(msg) {
    var box = $('error');
    box.textContent = '';
    rich(box, msg);
    box.hidden = false;
    $('dex').hidden = true;
    $('summary').hidden = true;
  }

  function entryOf(dexJson, id) {
    for (var i = 0; i < dexJson.entries.length; i++) if (dexJson.entries[i].id === id) return dexJson.entries[i];
    return null;
  }

  // ゲームの中の姿(ドット絵)。ぼやけないよう、整数倍に拡大して image-rendering: pixelated で表示する。
  // クリック(タップ)で、待機→構え→攻撃…と動く。
  function dotBox(id) {
    var box = el('div', 'dotbox');
    var dot = el('div', 'dot');
    dot.title = 'タップで動く';
    box.appendChild(dot);
    box.appendChild(el('div', 'dotcap', UI.dot_label || ''));
    var im = new Image();
    im.onload = function () {
      var fw = (im.height === 48 || im.height === 64) ? 48 : im.width;     // 1コマの幅
      var frames = Math.max(1, Math.round(im.width / fw));
      var s = fw === 48 ? 2 : 3;                                          // 整数倍(96px幅)
      dot.style.width = fw * s + 'px';
      dot.style.height = im.height * s + 'px';
      dot.style.backgroundImage = 'url(' + im.src + ')';
      dot.style.backgroundSize = (im.width * s) + 'px ' + (im.height * s) + 'px';
      dot.style.setProperty('--end', (-frames * fw * s) + 'px');
      dot.style.setProperty('--frames', frames);
      if (frames > 1) {
        dot.classList.add('canplay');
        dot.onclick = function () {
          dot.classList.remove('play');
          void dot.offsetWidth;
          dot.classList.add('play');
        };
      }
    };
    im.onerror = function () { box.remove(); };
    im.src = 'img/dot/' + id + '.png';
    return box;
  }

  function card(dexJson, id, kills, saveId) {
    var ent = entryOf(dexJson, id);
    var th = (ent && ent.thresholds) || dexJson.thresholds;
    var t = L.tier(kills, th);
    var c = el('article', 'card tier' + t);
    c.setAttribute('data-id', id);

    var left = el('div', 'left');
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
    left.appendChild(pic);
    if (ent && t >= 1) left.appendChild(dotBox(id));
    c.appendChild(left);

    var body = el('div', 'body');
    var title = (ent && t >= 1) ? ent.name : '？？？';
    body.appendChild(el('h2', null, title));
    if (!ent) {
      body.appendChild(el('p', 'note', UI.not_listed));
    } else if (t >= 1) {
      body.appendChild(el('p', 'kami', ent.kamiName));
    } else if (th[0] <= 1) {
      body.appendChild(el('p', 'note', UI.locked_boss));
    } else {
      var n = el('p', 'note', UI.locked_pre);
      rich(n, th[0] + (UI.locked_post || ''));
      body.appendChild(n);
    }

    // 進捗: 次のしきい値に対する「27/30体」(しきい値が全部1のボスは、1回倒せば全部ひらく)
    var next = L.nextThreshold(kills, th);
    var prog = el('div', 'progress');
    var bar = el('div', 'bar');
    var fill = el('div', 'fill');
    var goal = next === null ? th[th.length - 1] : next;
    fill.style.width = Math.min(100, Math.round(100 * kills / goal)) + '%';
    bar.appendChild(fill);
    prog.appendChild(bar);
    var cnt = el('span', 'count');
    if (next === null) rich(cnt, kills + UI.count_all);
    else rich(cnt, kills + '/' + next + UI.unit);
    prog.appendChild(cnt);
    body.appendChild(prog);

    if (ent && t >= 2) {
      var sec = el('div', 'sec');
      sec.appendChild(el('h3', null, UI.sec_bg));
      sec.appendChild(el('p', null, ent.background));
      if (ent.shrine) {
        sec.appendChild(el('h3', null, UI.sec_shrine));
        sec.appendChild(el('p', null, ent.shrine));
      }
      body.appendChild(sec);
    }
    if (ent && t >= 3) {
      var sec3 = el('div', 'sec');
      sec3.appendChild(el('h3', null, UI.sec_trivia));
      sec3.appendChild(el('p', null, ent.trivia));
      body.appendChild(sec3);
    }
    if (t >= th.length) {
      var pw = el('div', 'pw');
      pw.appendChild(el('span', 'pwlabel', 'パスワード'));
      pw.appendChild(el('span', 'pwcode', L.password(saveId, id)));
      pw.appendChild(el('span', 'pwhelp', UI.pw_help));
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
    sum.appendChild(el('span', null, ' ' + UI.sum_met + '  ・  ' + UI.sum_kills + ' ' + totalKills + UI.unit));
    if (unknown) sum.appendChild(el('span', 'sid', UI.sum_unknown_pre + ' ' + unknown + UI.sum_unknown_post));
    sum.appendChild(el('span', 'sid', 'セーブID ' + ('00000' + p.saveId.toString(16).toUpperCase()).slice(-6)));
    if (shown === 0) list.appendChild(el('p', 'note', UI.none_met));
  }

  function load(dexJson, text) {
    try {
      render(dexJson, L.parseFragment(text));
    } catch (e) {
      showError(e.code ? (UI['err_' + e.code] || e.message) : (UI.err_generic || '') + ': ' + e.message);
    }
  }

  // 固定の文字(data-ui="キー")にふりがなつきの文を入れる
  function fillStatic() {
    var nodes = document.querySelectorAll('[data-ui]');
    for (var i = 0; i < nodes.length; i++) {
      var k = nodes[i].getAttribute('data-ui');
      if (UI[k]) { nodes[i].textContent = ''; rich(nodes[i], UI[k]); }
    }
  }

  function start() {
    fillStatic();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'dex.json?v=' + Date.now());
    xhr.onload = function () {
      var dexJson;
      try { dexJson = JSON.parse(xhr.responseText); } catch (e) { return showError(UI.err_json); }
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
    xhr.onerror = function () { showError(UI.err_file); };
    xhr.send();
  }

  start();
})();
