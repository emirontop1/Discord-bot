// ==================== GÜVENLİ SANDBOX ÖN-KODU ====================
// Roblox'a özgü globaller (game, workspace, script vb.) gerçek ortam
// olmadığı için hataya düşmesin diye "kendini döndüren" sahte objelerle
// dolduruluyor. Ayrıca sonsuz döngülere karşı zaman aşımı koruması var.
const SANDBOX_PREAMBLE = `
local function __makeMock(name)
  local mock = {}
  local mt = {}
  mt.__index = function(t, k) return __makeMock((name or "?") .. "." .. tostring(k)) end
  mt.__call = function(t, ...) return __makeMock(name) end
  mt.__tostring = function(t) return "[mock:" .. name .. "]" end
  mt.__newindex = function(t, k, v) end
  mt.__concat = function(a, b)
    if type(a) == "table" then a = "[mock]" end
    if type(b) == "table" then b = "[mock]" end
    return tostring(a) .. tostring(b)
  end
  setmetatable(mock, mt)
  return mock
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

// ==================== FENGARI İLE ÇALIŞTIRMA ====================
function runLuaSandbox(userCode) {
  const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  let captured = "";

  function hookedPrint(L) {
    const n = lua.lua_gettop(L);
    const parts = [];
    for (let i = 1; i <= n; i++) {
      parts.push(to_jsstring(lauxlib.luaL_tolstring(L, i)));
      lua.lua_pop(L, 1);
    }
    captured += parts.join("\t") + "\n";
    return 0;
  }

  function hookedWarn(L) {
    const n = lua.lua_gettop(L);
    const parts = [];
    for (let i = 1; i <= n; i++) {
      parts.push(to_jsstring(lauxlib.luaL_tolstring(L, i)));
      lua.lua_pop(L, 1);
    }
    captured += "[warn] " + parts.join("\t") + "\n";
    return 0;
  }

  lua.lua_pushjsfunction(L, hookedPrint);
  lua.lua_setglobal(L, to_luastring("print"));
  lua.lua_pushjsfunction(L, hookedWarn);
  lua.lua_setglobal(L, to_luastring("warn"));

  const fullScript = SANDBOX_PREAMBLE + "\n" + userCode;
  const status = lauxlib.luaL_dostring(L, to_luastring(fullScript));
  if (status !== lua.LUA_OK) {
    const err = to_jsstring(lua.lua_tojsstring(L, -1));
    const timeoutHit = err.includes("__TIMEOUT__");
    const e = new Error(
      timeoutHit
        ? "Script 3 saniyeden uzun sürdü, güvenlik için durduruldu (sonsuz döngü olabilir)."
        : "Lua çalıştırma hatası: " + err
    );
    e.partialOutput = captured;
    throw e;
  }
  return captured;
}

// ==================== UI ====================
const inputEl = document.getElementById("input");
const runBtn = document.getElementById("run");
const statusEl = document.getElementById("status");
const resultWrap = document.getElementById("resultWrap");
const outputPre = document.getElementById("outputPre");
const copyBtn = document.getElementById("copy");

let lastResultText = "";

runBtn.addEventListener("click", () => {
  const code = inputEl.value.trim();
  statusEl.className = "";
  statusEl.textContent = "";
  resultWrap.style.display = "none";
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
      const output = runLuaSandbox(code);
      lastResultText = output || "(çıktı yok — script hiç print/warn çağırmadı)";
      outputPre.textContent = lastResultText;
      statusEl.className = "ok";
      statusEl.textContent = "✅ Script çalıştırıldı, çıktı aşağıda.";
      resultWrap.style.display = "block";
    } catch (err) {
      statusEl.className = "err";
      statusEl.textContent = "❌ " + err.message;
      if (err.partialOutput) {
        lastResultText = err.partialOutput;
        outputPre.textContent = err.partialOutput + "\n\n(hatadan önceki kısmi çıktı)";
        resultWrap.style.display = "block";
      }
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
