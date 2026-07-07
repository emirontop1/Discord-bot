// ==================== LUA KAYNAK MASKELEME ====================
// String literal'leri ve yorumları boşlukla maskeler (uzunluk korunur),
// böylece keyword eşlemesi (return/function/do/end...) bunların İÇİNE
// yanlışlıkla girmez. Kod pozisyonları (index) bozulmaz.
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

// ==================== ÖN-BÖLÜM (PREAMBLE) TESPİTİ ====================
// WeAreDevs obfuscator çıktısı hep şu şekli izliyor:
//   return(function(...)
//     local Q = { ...string sabitleri... }
//     local function N(N) ... end
//     for N,T in ipairs({...}) do ... end   <- karıştırma (shuffle)
//     do local N = {...alfabe...} ... end   <- string çözme
//     return(function(Q,V,J,...)            <- ASIL VM (bunu ÇALIŞTIRMIYORUZ)
//       ...binlerce satır VM kodu...
//     end)(...)
//   end)(...)
//
// "return(function(" ifadesi tam olarak 2 kez geçer: biri en baştaki
// dış sarmalayıcı, biri de VM'i çağıran asıl satır. İkincisini bulup
// kodu oradan kesiyoruz, VM hiç çalıştırılmıyor.
function findPreamble(code) {
  const masked = maskStringsAndComments(code);
  const re = /return\s*\(\s*function\s*\(/g;
  const matches = [];
  let m;
  while ((m = re.exec(masked)) !== null) matches.push(m.index);

  if (matches.length < 2) {
    throw new Error(
      "Bu, tanıdığım WeAreDevs Obfuscator yapısına benzemiyor (\"return(function(\" en az 2 kez geçmeli). Farklı bir obfuscator/versiyon olabilir."
    );
  }

  const cutIndex = matches[1];
  const tableNameMatch = /local\s+([A-Za-z_]\w*)\s*=\s*\{/.exec(masked);
  if (!tableNameMatch) {
    throw new Error("String tablosu (ör. local Q = {...}) bulunamadı.");
  }
  const tableName = tableNameMatch[1];

  const preamble = code.slice(0, cutIndex);
  const finalScript =
    preamble +
    `\nlocal __out = {}\n` +
    `for i,v in ipairs(${tableName}) do __out[#__out+1] = tostring(i)..'\\t'..tostring(v) end\n` +
    `print(table.concat(__out, '\\n'))\n` +
    `end)(...)`;
  return { finalScript, tableName };
}

// ==================== FENGARI İLE ÇALIŞTIRMA ====================
function runLuaCapture(luaSource) {
  const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  let captured = "";

  function luaPrint(L) {
    const n = lua.lua_gettop(L);
    const parts = [];
    for (let i = 1; i <= n; i++) {
      parts.push(to_jsstring(lauxlib.luaL_tolstring(L, i)));
      lua.lua_pop(L, 1);
    }
    captured += parts.join("\t") + "\n";
    return 0;
  }

  lua.lua_pushjsfunction(L, luaPrint);
  lua.lua_setglobal(L, to_luastring("print"));

  const status = lauxlib.luaL_dostring(L, to_luastring(luaSource));
  if (status !== lua.LUA_OK) {
    const err = to_jsstring(lua.lua_tojsstring(L, -1));
    throw new Error("Lua çalıştırma hatası: " + err);
  }
  return captured;
}

// ==================== UI ====================
const inputEl = document.getElementById("input");
const runBtn = document.getElementById("run");
const statusEl = document.getElementById("status");
const resultWrap = document.getElementById("resultWrap");
const resultTableBody = document.querySelector("#resultTable tbody");
const copyBtn = document.getElementById("copy");

let lastResultText = "";

runBtn.addEventListener("click", () => {
  const code = inputEl.value.trim();
  statusEl.className = "";
  statusEl.textContent = "";
  resultWrap.style.display = "none";
  resultTableBody.innerHTML = "";

  if (!code) {
    statusEl.className = "err";
    statusEl.textContent = "Önce obfuscated Lua kodunu yapıştır.";
    return;
  }

  runBtn.disabled = true;
  statusEl.textContent = "Çözülüyor...";

  // UI donmasın diye bir tık sonra çalıştır
  setTimeout(() => {
    try {
      const { finalScript, tableName } = findPreamble(code);
      const output = runLuaCapture(finalScript);

      lastResultText = output;
      const lines = output.split("\n").filter((l) => l.length > 0);
      for (const line of lines) {
        const idx = line.indexOf("\t");
        const num = idx >= 0 ? line.slice(0, idx) : "";
        const val = idx >= 0 ? line.slice(idx + 1) : line;
        const tr = document.createElement("tr");
        const tdNum = document.createElement("td");
        tdNum.textContent = num;
        const tdVal = document.createElement("td");
        tdVal.textContent = val;
        tr.appendChild(tdNum);
        tr.appendChild(tdVal);
        resultTableBody.appendChild(tr);
      }

      statusEl.className = "ok";
      statusEl.textContent = `✅ "${tableName}" string tablosu çözüldü (${lines.length} değer).`;
      resultWrap.style.display = "block";
    } catch (err) {
      statusEl.className = "err";
      statusEl.textContent = "❌ " + err.message;
    } finally {
      runBtn.disabled = false;
    }
  }, 30);
});

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(lastResultText).then(() => {
    copyBtn.textContent = "Kopyalandı ✅";
    setTimeout(() => (copyBtn.textContent = "Sonucu Kopyala"), 1500);
  });
});
