// ==================== GÜVENLİ SANDBOX + TRACE ÖN-KODU ====================
// Kullanıcı kodu bir fonksiyona sarılır (obfuscated kodlar genelde en üst
// seviyede "return" ile bittiği için, chunk'in sonuna bir şey eklenemez).
// Roblox globalleri (game, workspace vb.) sahte objelerle taklit edilir ve
// her çağrıldıklarında (matematiği çözülmüş) argümanlarıyla loglanır.
// print/warn da hem gerçekten "çalışır" hem de trace'e satır olarak düşer.
const SANDBOX_PREAMBLE = `
local function __fmt(v)
  local t = type(v)
  if t == "string" then return string.format("%q", v)
  elseif t == "nil" then return "nil"
  elseif t == "table" then return "{...}"
  else return tostring(v) end
end

local function __logCall(name, ...)
  local n = select('#', ...)
  local parts = {}
  for i = 1, n do parts[i] = __fmt(select(i, ...)) end
  __pushTrace(name .. "(" .. table.concat(parts, ", ") .. ")")
end

local function __makeMock(name)
  local mock = {}
  local mt = {}
  mt.__index = function(t, k) return __makeMock((name or "?") .. "." .. tostring(k)) end
  mt.__call = function(t, ...)
    __logCall(name, ...)
    return __makeMock(name)
  end
  mt.__tostring = function(t) return "[mock:" .. name .. "]" end
  mt.__newindex = function() end
  mt.__concat = function(a, b)
    if type(a) == "table" then a = "[mock]" end
    if type(b) == "table" then b = "[mock]" end
    return tostring(a) .. tostring(b)
  end
  setmetatable(mock, mt)
  return mock
end

local __origPrint = print
print = function(...)
  __logCall("print", ...)
  return __realPrintJS(...)
end
warn = function(...)
  __logCall("warn", ...)
end

local __knownGlobals = {
  "game","workspace","script","Instance","task","wait","spawn","delay","tick",
  "Enum","UserInputService","Players","RunService","ReplicatedStorage",
  "TweenService","Vector3","CFrame","Color3","UDim2","Region3","BrickColor",
  "HttpService","DataStoreService","Debris","SoundService","Lighting"
}
for _, __n in ipairs(__knownGlobals) do
  if _G[__n] == nil then _G[__n] = __makeMock(__n) end
end

local __start = os.clock and os.clock() or 0
if debug and debug.sethook then
  debug.sethook(function()
    if os.clock() - __start > 3 then
      error("__TIMEOUT__: script cok uzun calisti (3sn siniri asildi)")
    end
  end, "", 200000)
end
`;

function wrapUserCode(userCode) {
  return (
    SANDBOX_PREAMBLE +
    "\nlocal function __userChunk(...)\n" +
    userCode +
    "\nend\nlocal __ok, __err = pcall(__userChunk, ...)\n" +
    "if not __ok then __pushTrace('-- HATA: ' .. tostring(__err)) end\n"
  );
}

// ==================== FENGARI İLE ÇALIŞTIRMA ====================
function runLuaSandbox(userCode) {
  const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  let realOutput = "";
  const traceLines = [];

  function realPrintHook(L) {
    const n = lua.lua_gettop(L);
    const parts = [];
    for (let i = 1; i <= n; i++) {
      parts.push(to_jsstring(lauxlib.luaL_tolstring(L, i)));
      lua.lua_pop(L, 1);
    }
    realOutput += parts.join("\t") + "\n";
    return 0;
  }

  function pushTraceHook(L) {
    const line = to_jsstring(lauxlib.luaL_tolstring(L, 1));
    lua.lua_pop(L, 1);
    traceLines.push(line);
    return 0;
  }

  lua.lua_pushjsfunction(L, realPrintHook);
  lua.lua_setglobal(L, to_luastring("__realPrintJS"));
  lua.lua_pushjsfunction(L, pushTraceHook);
  lua.lua_setglobal(L, to_luastring("__pushTrace"));

  const fullScript = wrapUserCode(userCode);
  const status = lauxlib.luaL_dostring(L, to_luastring(fullScript));

  if (status !== lua.LUA_OK) {
    const err = to_jsstring(lua.lua_tojsstring(L, -1));
    const timeoutHit = err.includes("__TIMEOUT__");
    const e = new Error(
      timeoutHit
        ? "Script 3 saniyeden uzun sürdü, güvenlik için durduruldu (sonsuz döngü olabilir)."
        : "Lua çalıştırma hatası: " + err
    );
    e.partialTrace = traceLines;
    e.partialOutput = realOutput;
    throw e;
  }

  return { trace: traceLines, output: realOutput };
}

// ==================== UI ====================
const inputEl = document.getElementById("input");
const runBtn = document.getElementById("run");
const statusEl = document.getElementById("status");
const resultWrap = document.getElementById("resultWrap");
const tracePre = document.getElementById("tracePre");
const outputPre = document.getElementById("outputPre");
const copyBtn = document.getElementById("copy");

let lastTraceText = "";

runBtn.addEventListener("click", () => {
  const code = inputEl.value.trim();
  statusEl.className = "";
  statusEl.textContent = "";
  resultWrap.style.display = "none";
  tracePre.textContent = "";
  outputPre.textContent = "";

  if (!code) {
    statusEl.className = "err";
    statusEl.textContent = "Önce obfuscated Lua kodunu yapıştır.";
    return;
  }

  runBtn.disabled = true;
  statusEl.textContent = "Çalıştırılıyor...";

  setTimeout(() => {
    try {
      const { trace, output } = runLuaSandbox(code);
      lastTraceText = trace.join("\n") || "(hiç fonksiyon çağrısı yakalanmadı)";
      tracePre.textContent = lastTraceText;
      outputPre.textContent = output || "(print/warn çıktısı yok)";
      statusEl.className = "ok";
      statusEl.textContent = "✅ Script çalıştırıldı, yeniden oluşturulan kod aşağıda.";
      resultWrap.style.display = "block";
    } catch (err) {
      statusEl.className = "err";
      statusEl.textContent = "❌ " + err.message;
      if (err.partialTrace && err.partialTrace.length) {
        lastTraceText = err.partialTrace.join("\n");
        tracePre.textContent = lastTraceText + "\n-- (hatadan önceki kısım)";
        outputPre.textContent = err.partialOutput || "";
        resultWrap.style.display = "block";
      }
    } finally {
      runBtn.disabled = false;
    }
  }, 30);
});

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(lastTraceText).then(() => {
    copyBtn.textContent = "Kopyalandı ✅";
    setTimeout(() => (copyBtn.textContent = "Sonucu Kopyala"), 1500);
  });
});
