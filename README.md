# pi-statusline-hud

給 [pi](https://github.com/earendil-works/pi) coding agent 的多行抬頭顯示器。

## Demo

```
[Qwen3.6-35B-A3B · 256k] │ unsloth │ ⏱ 2h36m │ <motto>          ~/pi-statusline-hud git:(master) ✗
Context ███░░░░░░░ 31% 79.0k/256k │ Session █░░░░░░░░░ 1.3M/10.0M │ Cache ███████░░░ 71% 241k/340k
Env 1 AGENTS.md · 2 MCPs · 8 exts · 4 skills
Tools √ bash ×15 · √ read ×3 · √ mcp ×1
▶▶ 0 agents · 0 running · $0.00
```

輸入框上方另有一條帶 session 名的橫線:

```
────────────────────────────  重構 footer 顏色 ───
> 輸入你的訊息
```

## Quickstart

install

```bash
pi install git:github.com/johnkai-kai/pi-statusline-hud
```

裝完重啟 pi。extension 與 skill 都由 `package.json` 的 `pi` 欄位宣告,不用手動設定。

**安裝時不會寫入任何檔案。** 只會偵測有沒有別的套件在搶 footer,印出來給你自己處理。要它自動處理(會先備份 `settings.json`)就帶 `PI_HUD_AUTOFIX=1` 重裝。

在這個 repo 內開發時請用 `npm install --no-save --ignore-scripts`。

不想要了的話,把那一行從 pi 設定的 `packages` 移掉、重啟就乾淨了。

## Config

三條路都能改:

| 路徑 | 適合什麼 |
|---|---|
| `/pi-statusline-hud` | 原生選單,點一點最快。**改完即時生效,不用重啟** |
| 跟 agent 說「工具行太長了」 | 說不出是哪個鍵時,`pi-statusline-hud` skill 會接手 |
| 跟 agent 說「裝了但沒看到」 | 裝不起來、不生效,`pi-statusline-hud-setup` skill 會接手 |

設定檔在 `~/.pi/agent/pi-statusline-hud.json`,**它才是唯一的真實來源**,自己開來改隨時可以。少寫的鍵取預設值,檔案壞掉整個回退預設而不是讓 footer 崩掉——footer 每回合都在渲染,它一崩整個 pi 就不能用。

| 鍵 | 預設 | 這是什麼 |
|---|---|---|
| `lines` | 七行全開 | 要顯示哪幾行、順序怎麼排 |
| `motto` | `""` | 第一行結尾那句自訂的話 |
| `sessionBudget` | `10000000` | Session 進度條的分母。**純粹是視覺尺規**,超過不會擋你 |
| `maxToolEntries` | `7` | 工具那行最多列幾項 |
| `icons` | `"on"` | 要不要 emoji 與符號 |
| `sessionBar` | `"on"` | 輸入框上方那條橫線。**不在 `lines` 裡**,那是另一個表面 |
| `palettePreset` | `"contra"` | 十種配色:`contra`(互補)、`tokyo-night`(冷色類比)、`ember`(暖色類比)、`split`(分裂互補)、`triad`(三等分)、`single`(單色相)、`tetra`(矩形四色)、`dusk`(低彩度)、`neon`(高彩度)、`mono`(不上色) |

### 七行

| 行 | 內容 |
|---|---|
| `header` | 模型與窗口大小、provider、已耗時、座右銘 |
| `repo` | 目錄名與 git 分支。**併在 header 右側**,不自成一行 |
| `meters` | Context 與 Session 兩組計量 |
| `cache` | 快取命中率。**併在 meters 尾端**,不自成一行 |
| `env` | 載入的 AGENTS.md、MCP、extension、skill 數量 |
| `tools` | 本 session 各工具被呼叫幾次 |
| `status` | 存活的 agent 數、執行中的工具數、累計花費 |

關掉 `repo` 只是拿掉第 1 行右段,關掉 `cache` 只是拿掉第 2 行的第三組,不會多出空行。

### Context、Session、Cache 在算什麼

這三個常被誤會成同一件事的三種寫法。前提是:**模型沒有記憶,每一輪整份對話都要重新送一次。**

| | 問的問題 | 公式 | 行為 |
|---|---|---|---|
| **Context** | 這場對話**現在**有多厚 | pi 回報的當前上下文佔用 | 存量,壓縮時會**掉** |
| **Session** | 模型**總共**讀寫了多少 | `input + output + cacheWrite + cacheRead` | 累計,只增不減 |
| **Cache** | **最近一輪**有多少是重讀的 | `cacheRead ÷ 該輪 prompt` | 比率,上下跳動 |

所以 Session 遠大於 Context 是正常的:問了 30 輪,前面的內容就被重讀了 30 次。`cacheRead` 通常佔九成以上——那不是虛胖,是模型真的讀過,快取只是讓它便宜約十倍。

Session **不是花費**,三種 token 單價差很多。要看錢請看 `status` 行的 `$`。

## Notes

**顏色是訊號,不是裝飾。** Context 條隨用量從綠轉琥珀再轉紅,不用讀百分比就知道快滿了。花費在本地跑是暗灰的 `$0.00`,一接雲端就轉琥珀並亮起 💸。

**進度條的填滿與未填滿是兩個不同字元**,不是同一個方塊換顏色——關掉顏色也讀得出比例。

**不嗅探終端能力,只認 `NO_COLOR`。** `COLORTERM` 與 `WT_SESSION` 只是慣例,沒設不代表不支援(Git Bash 的 MinTTY 兩個都不設卻完全支援 truecolor)。淺色終端會自動改用推導出來的淺色配色。

**進畫面的外部文字都會先消毒。** model id、provider、工具名、MCP 伺服器名、session 名、git 分支、目錄名、`motto` —— 這些有一部分不是你打的(session 名由 agent 寫入,工具名來自第三方套件),所以一律剝掉 ANSI 逸出序列、OSC 序列、控制字元與 bidi 覆寫。這裡的失效模式看不見:寬度計算會把逸出序列當零寬,版面不會歪,你不會發現。

**不顯示完整路徑。** 家目錄底下寫成 `~/專案名`,完整路徑又長又會洩漏使用者名稱。

**已知限制:**`0 agents` 的語意跟你想的可能不同——pi 的 `agent_start` 是每個 agent loop 觸發一次,不是每個子代理一次,所以那個數字比較接近「有沒有在跑」。

## Development

零執行期相依。測試用 Node 內建的 `node:test`。

```bash
npm test                        # 單元測試
node scripts/scan-secrets.mjs   # 確認沒有個人資訊混進去

# 型別檢查需要先拉 peer 依賴(這些不會進 package.json)
npm install --no-save typescript @types/node @earendil-works/pi-coding-agent @earendil-works/pi-tui
npx tsc --noEmit
```

三層,邊界很硬:`collect/` 只累積狀態,`lines/` 是純函式吃資料吐字串完全不碰 pi 的 API,`statusline.ts` 與 `settings-menu.ts` 是唯二跟 pi 執行期打交道的檔案。

還有一條規矩:**寬度一律用純文字算,顏色最後才上。** ANSI 逸出碼會把字串長度撐大,先上色再截斷保證破版。中文字佔兩欄也一併處理了。

## Thanks

Forked from [@narumitw/pi-statusline](https://www.npmjs.com/package/@narumitw/pi-statusline)
(MIT, © 2026 narumiruna). 原始授權完整保留在 `LICENSE-pi-statusline`。它把 pi 的 footer API 摸透了,省了我很多時間。

版面與資訊密度借鏡 [claude-hud](https://github.com/jarrodwatts/claude-hud)
(MIT, © 2026 Jarrod Watts). 原始授權完整保留在 `LICENSE-claude-hud`。

誠實講抄了什麼:**進度條寬度的三個門檻**(100 欄以上 10 格、60 以上 6 格、更窄 4 格)是照它的 `utils/terminal.ts` 抄的數值;**外部文字消毒的處理順序**(OSC 要在剝掉 C0 控制碼之前處理,否則會失去 BEL 終止符)是從它的 `extra-cmd.ts` 學的。其餘是自己實作——兩邊的 agent API 完全不同,程式碼沒有共用的餘地。

## License

MIT — `LICENSE`。
