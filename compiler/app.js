// jsUtils/luaLexer.js -> window.LuaLexer kullanılıyor

function obfuscateCode(code, opts) {
  const { maskStringsAndComments, obfuscateNumber, obfuscateStringLiteral, randomName } = window.LuaLexer;
  const masked = maskStringsAndComments(code);
  let result = "";
  let i = 0;
  const n = code.length;

  while (i < n) {
    // string literal (maskede boşluk ama orijinalde tırnak/köşeli parantez)
    if ((code[i] === '"' || code[i] === "'") && masked[i] === " ") {
      const q = code[i];
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === q) { j++; break; }
        j++;
      }
      const raw = code.slice(i, j);
      result += opts.strings ? obfuscateStringLiteral(raw) : raw;
      i = j;
      continue;
    }

    // sayı literali (maskelenmemiş / gerçek kod bölgesinde)
    if (
      opts.numbers &&
      masked[i] !== " " &&
      /[0-9]/.test(code[i]) &&
      !/[0-9a-zA-Z_]/.test(code[i - 1] || "")
    ) {
      const m = /^(0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)/.exec(code.slice(i));
      if (m) {
        result += obfuscateNumber(m[1]);
        i += m[1].length;
        continue;
      }
    }

    result += code[i];
    i++;
  }

  if (opts.junk) {
    const junkLines = [];
    const count = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < count; k++) {
      junkLines.push(`local ${randomName()} = ${obfuscateNumber(String(Math.floor(Math.random() * 1000)))}`);
    }
    result = junkLines.join("\n") + "\n" + result;
  }

  if (opts.wrap) {
    result = `return (function(...)\n${result}\nend)(...)`;
  }

  return result;
}

const inputEl = document.getElementById("input");
const runBtn = document.getElementById("run");
const statusEl = document.getElementById("status");
const resultWrap = document.getElementById("resultWrap");
const outputPre = document.getElementById("outputPre");
const copyBtn = document.getElementById("copy");

let lastResult = "";

runBtn.addEventListener("click", () => {
  const code = inputEl.value.trim();
  statusEl.className = "";
  statusEl.textContent = "";
  resultWrap.style.display = "none";

  if (!code) {
    statusEl.className = "err";
    statusEl.textContent = "Önce Lua kodunu yapıştır.";
    return;
  }

  const opts = {
    strings: document.getElementById("optStrings").checked,
    numbers: document.getElementById("optNumbers").checked,
    junk: document.getElementById("optJunk").checked,
    wrap: document.getElementById("optWrap").checked,
  };

  try {
    lastResult = obfuscateCode(code, opts);
    outputPre.textContent = lastResult;
    statusEl.className = "ok";
    statusEl.textContent = "✅ Obfuscate edildi.";
    resultWrap.style.display = "block";
  } catch (err) {
    statusEl.className = "err";
    statusEl.textContent = "❌ " + err.message;
  }
});

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(lastResult).then(() => {
    copyBtn.textContent = "Kopyalandı ✅";
    setTimeout(() => (copyBtn.textContent = "Kopyala"), 1500);
  });
});
