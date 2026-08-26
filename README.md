# pi-statusline-hud

[pi](https://github.com/earendil-works/pi) coding agent statusline


## Demo

```
[Qwen3.6-35B-A3B · 256k] │ 🧠 medium │ unsloth │ ⏱ 2h36m │ <motto>          ~/pi-statusline-hud git:(master) ✗
Context ███░░░░░░░ 31% ↓1 79.0k/256k │ Session █░░░░░░░░░ 1.3M/10.0M │ Cache ███████░░░ 71% 241k/340k
Env 1 AGENTS.md · 2 MCPs · 8 exts · 4 skills
Tools √ bash ×15 !2 · √ read ×3 · √ mcp ×1
▶▶ 0 agents · 0 running · ⚡ 33 tok/s · $0.00
```


## Quickstart

install

```bash
pi install git:github.com/johnkai-kai/pi-statusline-hud
```

uninstall

```bash
pi uninstall git:github.com/johnkai-kai/pi-statusline-hud
```

設定檔 `~/.pi/agent/pi-statusline-hud.json` 不會跟著被刪,重裝時原本的配色跟座右銘還在。真的不要了就自己刪。


## Config


| 方式 | 說明 |
|---|---|
| `/pi-statusline-hud` | 原生選單**改完即時生效,不用重啟** |
| 使用agent進行相關設定 | `pi-statusline-hud` skill 會接手 |
| 使用Agent排查設定問題及初始化設定 | `pi-statusline-hud-setup` skill 會接手 |

設定檔為 `~/.pi/agent/pi-statusline-hud.json`


| 鍵 | 預設 | 說明 |
|---|---|---|
| `lines` | 七行全開 | 要顯示哪幾行、順序怎麼排 |
| `motto` | `""` | 第一行結尾那句自訂的話 |
| `sessionBudget` | `10000000` | Session 進度條的分母 |
| `maxToolEntries` | `7` | 工具行最多列幾項 |
| `icons` | `"on"` | 要不要 emoji 與符號 |
| `sessionBar` | `"on"` | 輸入框上方橫線 |
| `palettePreset` | `"contra"` | 十種配色:`contra`(互補)、`tokyo-night`(冷色類比)、`ember`(暖色類比)、`split`(分裂互補)、`triad`(三等分)、`single`(單色相)、`tetra`(矩形四色)、`dusk`(低彩度)、`neon`(高彩度)、`mono`(不上色) |

### 七行

| 行 | 內容 |
|---|---|
| `header` | 模型與窗口大小、思考檔位、provider、已耗時、座右銘 |
| `repo` | 目錄名與 git 分支。**併在 header 右側**,不自成一行 |
| `meters` | Context 與 Session 兩組計量。上下文被縮小過就在 Context 百分比後面標 `↓N`。**不綁定壓縮機制**:pi 內建壓縮走 `session_compact` 事件,剪枝式 extension(會取消內建壓縮、事件不發的那類)則靠「實際送進模型的 payload 踩下一階」偵測,兩條路共用同一個計數且互相去重。`overflow`(撞到窗口才被迫壓)標紅,其餘標琥珀 |
| `cache` | 快取命中率。**併在 meters 尾端**,不自成一行 |
| `env` | 載入的 AGENTS.md、MCP、extension、skill 數量 |
| `tools` | 本 session 各工具被呼叫幾次,失敗過的另標紅色 `!N` |
| `status` | 存活的 agent 數、執行中的工具數、生成速度、累計花費 |


### Context、Session、Cache 

| | 問的問題 | 公式 | 行為 |
|---|---|---|---|
| **Context** | 這場對話**現在**有多厚 | pi 回報的當前上下文佔用 | 存量,壓縮時會**掉** |
| **Session** | 模型**總共**讀寫了多少 | `input + output + cacheWrite + cacheRead` | 累計,只增不減 |
| **Cache** | **最近一輪**有多少是重讀的 | `cacheRead ÷ 該輪 prompt` | 比率,上下跳動 |



### 生成速度 (tok/s)

串流途中 provider 不給 token 數(實測一段 117 秒的串流,885 次取樣裡 `usage.output` 全程是 0,最後一個事件才跳成 3938),所以這個數字有兩種身分:

| 樣子 | 意思 | 怎麼算的 |
|---|---|---|
| `~41 tok/s`(dim) | 串流中的**估計值** | 最近 5 秒的 delta 事件數。實測 delta 與 token 幾乎 1:1(3709 : 3938) |
| `33 tok/s`(正常色) | 訊息落地後的**精確值** | `usage.output ÷ 生成時長` |

兩件事值得知道:

- **時長從第一個 token 起算,不含首 token 延遲**。實測前 11.6 秒只有 1 個 delta——把等待算進生成會讓短訊息看起來莫名其妙地慢,也會讓落地瞬間的數字往下跳一階。
- **delta 與 token 的比例不寫死**。那是 tokenizer 的性質,每則訊息落地時都知道真實 token 數與 delta 數,拿它回頭校準,所以換模型、換語言都會自己修正。校準是平滑的,單一則的抖動不會整個帶走下一則的估計值。
- **首 token 延遲另外報一格**(`⏱️ 0.95s`)。那一段是等待不是生成,混進速度會讓短訊息看起來莫名其妙地慢。它**包含排隊時間**——本地後端實測 20 秒的延遲裡有 19 秒是在排隊等 GPU。刻意不拆成「排隊」與「prefill」:那要 provider 回傳自己的 timings,只有 llama.cpp 這類本地後端有,雲端一律沒有。
- **整批到齊的 delta 不算量測**。工具呼叫的參數不是逐字滴下來的:實測模型跑了 5 秒,42 個 delta 卻在 5 毫秒內全部到齊,拿那 5 毫秒去除 63 個 token 會算出 12600 tok/s。樣本數與時間跨度不夠就不報,讓上一則的數字多留一會兒。


## 除錯

HUD 的渲染整段包在 try/catch 裡——渲染出事不該帶走 pi,代價是壞掉時只看得到一片空白。
設 `PI_HUD_DEBUG` 就會把被吃掉的例外寫下來:

```bash
PI_HUD_DEBUG=on pi        # 寫到 ~/.pi/agent/pi-statusline-hud.log
PI_HUD_DEBUG=/tmp/hud.log pi   # 或自己指定路徑
```

沒設就完全不碰磁碟。記錄檔上限 256 KB,滿了從頭寫。


## Thanks

Forked from [@narumitw/pi-statusline](https://www.npmjs.com/package/@narumitw/pi-statusline)
(MIT, © 2026 narumiruna). 原始授權完整保留在 `LICENSE-pi-statusline`。

版面與資訊密度借鏡 [claude-hud](https://github.com/jarrodwatts/claude-hud)
(MIT, © 2026 Jarrod Watts). 原始授權完整保留在 `LICENSE-claude-hud`。

## License

MIT — `LICENSE`。
