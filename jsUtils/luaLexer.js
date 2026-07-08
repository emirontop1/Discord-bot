// ==================== jsUtils/luaLexer.js ====================
// Compiler ve Deobfuscator'ın ikisinin de kullandığı ortak Lua
// tokenize/maskeleme yardımcıları. Tarayıcıda <script> ile yüklenir,
// window.LuaLexer altında global olarak erişilebilir olur.
(function (global) {
  // String literal'leri ve yorumları boşlukla maskeler (uzunluk korunur).
  // Böylece keyword/sayı eşlemesi bunların İÇİNE yanlışlıkla girmez.
  function maskStringsAndComments(code) {
    const out = code.split("");
    const n = code.length;
    let i = 0;
    let state = "normal";
    let longLevel = 0;

    function isLongBracketOpen(pos) {
      if (code[pos] !== "[") return null;
      let j = pos + 1;
      let level = 0;
      while (code[j] === "=") {
        level++;
        j++;
      }
      if (code[j] === "[") return { level, len: j - pos + 1 };
      return null;
    }

    function isLongBracketClose(pos, level) {
      if (code[pos] !== "]") return null;
      let j = pos + 1;
      let l = 0;
      while (code[j] === "=") {
        l++;
        j++;
      }
      if (code[j] === "]" && l === level) return j - pos + 1;
      return null;
    }

    while (i < n) {
      const c = code[i];
      if (state === "normal") {
        if (c === "-" && code[i + 1] === "-") {
          const lb = isLongBracketOpen(i + 2);
          if (lb) {
            state = "longcomment";
            longLevel = lb.level;
            for (let k = i; k < i + 2 + lb.len; k++) out[k] = " ";
            i = i + 2 + lb.len;
            continue;
          } else {
            state = "linecomment";
            out[i] = " ";
            out[i + 1] = " ";
            i += 2;
            continue;
          }
        } else if (c === '"') {
          state = "dqstr";
          out[i] = " ";
          i++;
          continue;
        } else if (c === "'") {
          state = "sqstr";
          out[i] = " ";
          i++;
          continue;
        } else if (c === "[") {
          const lb = isLongBracketOpen(i);
          if (lb) {
            state = "longstr";
            longLevel = lb.level;
            for (let k = i; k < i + lb.len; k++) out[k] = " ";
            i += lb.len;
            continue;
          }
        }
        i++;
      } else if (state === "dqstr") {
        if (c === "\\") {
          out[i] = " ";
          out[i + 1] = " ";
          i += 2;
          continue;
        }
        if (c === '"') state = "normal";
        out[i] = " ";
        i++;
      } else if (state === "sqstr") {
        if (c === "\\") {
          out[i] = " ";
          out[i + 1] = " ";
          i += 2;
          continue;
        }
        if (c === "'") state = "normal";
        out[i] = " ";
        i++;
      } else if (state === "linecomment") {
        if (c === "\n") state = "normal";
        else out[i] = " ";
        i++;
      } else if (state === "longstr" || state === "longcomment") {
        const close = isLongBracketClose(i, longLevel);
        if (close) {
          for (let k = i; k < i + close; k++) out[k] = " ";
          i += close;
          state = "normal";
          continue;
        }
        if (out[i] !== "\n") out[i] = " ";
        i++;
      }
    }
    return out.join("");
  }

  // Kod içindeki string literal aralıklarını [start,end) olarak döndürür
  // (tırnaklar dahil), maskStringsAndComments ile aynı state-machine'i kullanır.
  function findStringRanges(code) {
    const masked = maskStringsAndComments(code);
    const ranges = [];
    let i = 0;
    while (i < code.length) {
      if (masked[i] === " " && code[i] !== " " && (code[i] === '"' || code[i] === "'" || code[i] === "[")) {
        // start of a masked (string/comment) region
        let j = i;
        while (j < code.length && masked[j] === " " && code[j] !== "\n") j++;
        // heuristic boundary; refined below by re-scanning with quote awareness
        ranges.push([i, j]);
        i = j;
      } else {
        i++;
      }
    }
    return ranges;
  }

  const RESERVED = new Set([
    "and","break","do","else","elseif","end","false","for","function","goto",
    "if","in","local","nil","not","or","repeat","return","then","true",
    "until","while"
  ]);

  function randomName(len) {
    len = len || 6 + Math.floor(Math.random() * 4);
    const first = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
    const rest = first + "0123456789";
    let s = first[Math.floor(Math.random() * first.length)];
    for (let i = 1; i < len; i++) s += rest[Math.floor(Math.random() * rest.length)];
    return s;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Sayiyi "(A-B)" seklinde esdeger bir aritmetik ifadeye cevirir
  function obfuscateNumber(numStr) {
    if (/^0[xX]/.test(numStr)) return numStr;
    const n = parseFloat(numStr);
    if (isNaN(n)) return numStr;
    const big = randInt(100000, 999999);
    if (Math.random() < 0.5) {
      const a = n + big;
      return `(${a}-${big})`;
    } else {
      const a = big;
      const b = big - n;
      return `(${a}-${b})`;
    }
  }

  // Lua string literal'ini (tirnaklar dahil) gercek byte dizisine cozer
  function decodeLuaStringLiteral(raw) {
    const inner = raw.slice(1, -1);
    const bytes = [];
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === "\\") {
        const next = inner[i + 1];
        const simple = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, "\\": 92, '"': 34, "'": 39 };
        if (next in simple) {
          bytes.push(simple[next]);
          i++;
        } else if (/[0-9]/.test(next)) {
          let j = i + 1, digits = "";
          while (j < inner.length && /[0-9]/.test(inner[j]) && digits.length < 3) {
            digits += inner[j];
            j++;
          }
          bytes.push(parseInt(digits, 10));
          i = j - 1;
        } else {
          bytes.push(next.charCodeAt(0));
          i++;
        }
      } else {
        bytes.push(c.charCodeAt(0));
      }
    }
    return bytes;
  }

  function obfuscateStringLiteral(raw) {
    const bytes = decodeLuaStringLiteral(raw);
    return '"' + bytes.map((b) => "\\" + String(b).padStart(3, "0")).join("") + '"';
  }

  global.LuaLexer = {
    maskStringsAndComments,
    findStringRanges,
    RESERVED,
    randomName,
    randInt,
    obfuscateNumber,
    obfuscateStringLiteral,
    decodeLuaStringLiteral,
  };
})(typeof window !== "undefined" ? window : globalThis);
