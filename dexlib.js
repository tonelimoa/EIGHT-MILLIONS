// dexlib.js - 神話図鑑のデータ処理(DOMに触らない)。dex/ref/dexref.py と同じ仕様:
// payload(78バイト, CRC16) / Base43 / パスワード。変更したら dex/web/test/test.html で基準実装と照合すること。
(function (root) {
  'use strict';

  var B43 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:';
  var PW_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  // ROMの dex_secret と同じ値(src/dex_tables.h)。ここに入るので、JSを読めば誰でもパスワードを計算できる
  // (「うっかり共有・使い回しを防ぐ」程度の仕組み。改造・解析への耐性は無い)。
  var SECRET = [0x5A, 0xC3, 0x1E, 0x97, 0x42, 0xB8, 0x6D, 0xF1];
  var N_ENTRIES = 64;
  var PAYLOAD_LEN = 78;

  function crc16(bytes, n) {
    var crc = 0xFFFF;
    for (var i = 0; i < n; i++) {
      crc ^= bytes[i] << 8;
      for (var b = 0; b < 8; b++) {
        crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
      }
    }
    return crc;
  }

  function DexError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  // Base43 (2バイト→3文字、下位の桁が先)。不正なら DexError
  function base43Decode(s) {
    if (s.length !== 117) throw DexError('length', 'データの長さが違います(' + s.length + '文字、117文字のはず)');
    var out = new Array(78), o = 0;
    for (var i = 0; i < s.length; i += 3) {
      var a = B43.indexOf(s.charAt(i)), b = B43.indexOf(s.charAt(i + 1)), c = B43.indexOf(s.charAt(i + 2));
      if (a < 0 || b < 0 || c < 0) throw DexError('chars', 'データに使えない文字が含まれています');
      var v = a + 43 * b + 1849 * c;
      if (v > 0xFFFF) throw DexError('range', 'データが壊れています');
      out[o++] = v >> 8;
      out[o++] = v & 255;
    }
    return out;
  }

  // 78バイト → {saveId, met[64], kills[64]}。不正なら DexError(code: crc / version)
  function unpackPayload(b) {
    if (b.length !== PAYLOAD_LEN) throw DexError('length', 'データの長さが違います');
    var crc = (b[76] << 8) | b[77];
    if (crc16(b, 76) !== crc) throw DexError('crc', 'データが壊れています(チェックサムが合いません)。QRをもう一度読み取ってください');
    if (b[0] !== 1) throw DexError('version', 'この図鑑ページが知らない形式です(形式 ' + b[0] + ')。ページが古いか、ゲームが新しいかもしれません');
    var met = [], kills = [];
    for (var i = 0; i < N_ENTRIES; i++) {
      met.push(((b[4 + (i >> 3)] >> (i & 7)) & 1) === 1);
      kills.push(b[12 + i]);
    }
    return { saveId: (b[1] << 16) | (b[2] << 8) | b[3], met: met, kills: kills };
  }

  // URLの # 以降(または全文)からデータを取り出す
  function parseFragment(frag) {
    var s = String(frag || '');
    var h = s.indexOf('#');
    if (h >= 0) s = s.slice(h + 1);
    try { s = decodeURIComponent(s); } catch (e) { /* そのまま */ }
    s = s.replace(/\s+/g, '').toUpperCase();
    if (!s) throw DexError('empty', 'データがありません');
    return unpackPayload(base43Decode(s));
  }

  function rol(x, n) { return ((x << n) | (x >>> (16 - n))) & 0xFFFF; }

  // 16bitの加算・回転・XORだけのミキサー(SNES側 dex.c pw_hash と同一)。5バイトを返す
  function passwordBits(saveId, dexId) {
    var s = [SECRET[0] | (SECRET[1] << 8), SECRET[2] | (SECRET[3] << 8), SECRET[4] | (SECRET[5] << 8), SECRET[6] | (SECRET[7] << 8)];
    var msg = [saveId & 0xFFFF, (((saveId >>> 16) & 255) << 8 | dexId) & 0xFFFF, 0x4B44];
    for (var r = 0; r < 16; r++) {
      s[r & 3] = (s[r & 3] + msg[r % 3]) & 0xFFFF;
      var a = s[0], b = s[1], c = s[2], d = s[3];
      a = (a + b) & 0xFFFF; d = rol(d ^ a, 7);
      c = (c + d) & 0xFFFF; b = rol(b ^ c, 9);
      a = (a + b) & 0xFFFF; d = rol(d ^ a, 13);
      c = (c + d) & 0xFFFF; b = rol(b ^ c, 5);
      s = [a, b, c, d];
    }
    return [s[0] & 255, s[0] >> 8, s[1] & 255, s[1] >> 8, s[2] & 255, 0];
  }

  function password(saveId, dexId) {
    var h = passwordBits(saveId, dexId), out = '';
    for (var i = 0; i < 8; i++) {
      var p = i * 5;
      var w = h[p >> 3] | (h[(p >> 3) + 1] << 8);
      out += PW_ALPHABET.charAt((w >> (p & 7)) & 31);
    }
    return out.slice(0, 4) + '-' + out.slice(4);
  }

  // 開放段階: しきい値のうち何個に届いたか(0〜しきい値の数)
  function tier(kills, thresholds) {
    var t = 0;
    for (var i = 0; i < thresholds.length; i++) if (kills >= thresholds[i]) t++;
    return t;
  }

  // 次のしきい値(全部超えていれば null)
  function nextThreshold(kills, thresholds) {
    for (var i = 0; i < thresholds.length; i++) if (kills < thresholds[i]) return thresholds[i];
    return null;
  }

  root.DexLib = {
    crc16: crc16, base43Decode: base43Decode, unpackPayload: unpackPayload, parseFragment: parseFragment,
    password: password, passwordBits: passwordBits, tier: tier, nextThreshold: nextThreshold, DexError: DexError,
    N_ENTRIES: N_ENTRIES
  };
})(typeof window !== 'undefined' ? window : this);
