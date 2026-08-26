---
name: pi-statusline-hud
description: 以對話方式調整 pi-statusline-hud 抬頭顯示器的外觀。當使用者用自然語言說要改 statusline、HUD、footer、狀態列的顯示內容、配色、行數、座右銘時使用;若他只想點選單,請他跑 /pi-statusline-hud;裝不起來或看不到 HUD 請改用 pi-statusline-hud-setup。
---

# pi-statusline-hud 外觀設定

## 你負責哪一半

這個套件有三條設定路徑,你是其中一條:

| 路徑 | 誰在跑 | 管什麼 |
|---|---|---|
| `/pi-statusline-hud` | 套件自己的原生選單 | 逐項點選,最快,不經過 agent |
| **本 skill** | **你** | **用對話調外觀** |
| `pi-statusline-hud-setup` skill | 另一個 skill | 裝不起來、看不到、不生效 |

**你負責的是自然語言那一半**:使用者不想點選單,而是說「太吵了」「我看不到花費」「幫我把顏色關掉」。這時你用對話帶他調,不是丟選單給他點。

如果他要的是逐項點選,提醒他跑 `/pi-statusline-hud` 更快。**如果他說的是「裝了但沒看到」「改了沒生效」「顏色整個是白的」,那是 `pi-statusline-hud-setup` 的守備範圍,交給它。**

## 設定檔

`<agentDir>/pi-statusline-hud.json`。`agentDir` 通常是 `~/.pi/agent`。
讀不到就當作全部預設值。改完直接覆寫整個檔案。

## Schema

| 鍵 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `lines` | string[] | 全七行 | footer 顯示哪幾行,依陣列順序排列。合法值:`header`、`repo`、`meters`、`cache`、`env`、`tools`、`status` |
| `motto` | string | `""` | 第一行結尾的自訂文字 |
| `sessionBudget` | number | 10000000 | Session 進度條的分母,僅為視覺尺規。Session 是**總處理量**(見下節),數值會比使用者直覺的大很多,設太小會整天滿格 |
| `maxToolEntries` | number | 7 | 工具行最多列幾項 |
| `icons` | `"on"` / `"off"` | `"on"` | 是否使用 emoji 與符號。**在設定檔與精靈裡都寫成 `on` / `off`**,那比 true / false 直觀;舊的布林值仍讀得進來 |
| `sessionBar` | `"on"` / `"off"` | `"on"` | 輸入框上方那條帶 session 名的橫線。**不在 `lines` 裡**——`lines` 是 footer 的七行,這是另一個表面 |
| `rainbow` | `RainbowTarget[]` | `[]` | 哪些元素改成逐字流動的彩虹。與 `palettePreset` **正交**:主題照樣管其他所有東西。空陣列 = 全關,連動畫節拍都不會裝 |
| `palettePreset` | string | `tokyo-night` | 配色,十六種合法值:`tokyo-night`(冷色類比,預設)、`ember`(暖色類比)、`triad`(三等分)、`dusk`(低彩度)、`neon`(高彩度)、`deep-sea`(深海青)、`jade`(翡翠綠)、`amber-crt`(琥珀單色機)、`lava`(熔岩橙紅)、`synthwave`(合成波洋紅)、`ash`(灰燼近無彩)、`min-paper`(極簡紙白)、`min-night`(極簡夜)、`min-zero`(極簡全灰,語意色也不上色)、`min-alert-dark`(極簡,只有壞消息才上色)、`mono`(完全不輸出顏色碼);未知值回退 `tokyo-night`(舊的 `contra`、`split`、`single`、`tetra` 已移除,設定檔留著也會自動回退)。設了 `NO_COLOR` 環境變數時執行期強制 `mono`,除此之外一律上色(不嗅探終端) |

## 兩個表面

畫面上會動的東西分屬兩個地方,別搞混:

**footer(底部)** —— `lines` 收七個名稱,但畫面只有五行:`repo` 併進 `header` 右側,`cache` 併進 `meters` 尾端。

1. `header` — `[模型 · 窗口] │ 思考檔位 │ provider │ 已耗時 │ motto`;思考檔位取自 pi 的 `thinkingLevel`,為 `off` 或這版 pi 沒有這個概念時整組不佔位,`icons` 關掉時前綴由 🧠 改成 `think`,右端靠齊顯示 repo
2. `repo` — header 右段的 `目錄名 git:(分支)`,後面接改動明細 `+3 ~5 ?2 !1`(已暫存／工作區改過／未追蹤／衝突,零的不列;第一行擠到放不下模型名稱時明細先讓位);目錄在家目錄底下時顯示成 `~/最末一段`,不外洩帳號名
3. `meters` — Context 與 Session 兩組橫排計量條;上下文被縮小過就在 Context 百分比後面加 `↓N`(N 為本 session 縮小次數),最後一次是 `overflow`(撞到窗口才被迫壓)標紅,其餘標琥珀。**兩條偵測路徑,與機制無關**:(a) pi 內建壓縮發 `session_compact`,理由取自事件;(b) 剪枝式 extension 可以取消內建壓縮讓事件永不發生,且 pi 回報的 context 估計值在那種情況下照樣往上爬,所以另外盯「上一輪實際送進模型的 payload」(`input + cacheRead + cacheWrite`),踩下一階就算一次(理由記為 `prune`)。兩條路共用計數並去重,所以裝了或拆了剪枝插件行為都一致。門檻是同時要跌掉一成且至少 1000 token,擋掉正常波動
4. `cache` — meters 行尾端的第三組:快取命中率
5. `env` — AGENTS.md / MCPs / extensions / skills 計數(extensions 與 skills 含使用者層 `<agentDir>/settings.json` 與專案層 `<cwd>/.pi/settings.json` 兩層;MCPs 合併六個共用與 pi 專屬設定檔、各檔自己的相容匯入 `imports`(不受 `hostConfigDiscovery` 影響)、`settings.hostConfigDiscovery` 為 `on` 時對全部 host 種類的自動探索,以及套件 `pi.mcp`,依伺服器名稱去重)
6. `tools` — 本 session 各工具呼叫次數;該工具回報過失敗就在次數後面加紅色 `!N`,`icons` 關掉時這個記號仍在(它不是裝飾)
7. `status` — 存活 agent 數、執行中工具數、生成速度、首 token 延遲、累計花費。前兩項為零時整組不畫;窄終端下的丟棄順序是花費 → 速度 → 延遲 → 那兩項,不照版面順序。速度後面跟著最近幾則的走勢 `▁▄▆█`(尺度取視窗內的 min-max,少於兩筆不畫,位置不夠時第一個消失)。速度有兩種身分:串流中是 `~41 tok/s`(dim,最近 5 秒的 delta 事件數估的),訊息落地後換成 `33 tok/s`(正常色,`usage.output ÷ 生成時長`)。時長從第一個 token 起算不含首 token 延遲;delta 與 token 的比例每則訊息落地時自我校準,不寫死。被問「為什麼串流中是估的」就答:provider 在串流途中不回報 token 數,實測 885 次取樣裡 `usage.output` 全程是 0

關掉 `repo` 只是拿掉第 1 行右段,關掉 `cache` 只是拿掉第 2 行的第三組,不會多出空行。

**session 橫線(輸入框上方)** —— 由 `sessionBar` 單獨控制,跟 `lines` 無關。session 名取自 pi 的 `session_info`;還沒命名時顯示 `#` 加 session id 前六碼。

## Context、Session、Cache 的差別(使用者常問)

前提:**模型沒有記憶,每一輪整份對話都要重新送一次給它。**

| | 問的問題 | 公式 | 行為 |
|---|---|---|---|
| Context | 這場對話**現在**有多厚 | pi 回報的當前上下文佔用 | 存量,壓縮時會掉 |
| Session | 模型**總共**讀寫了多少 | `input + output + cacheWrite + cacheRead` | 累計,只增不減 |
| Cache | **最近一輪**有多少是重讀的 | `cacheRead ÷ 該輪 prompt` | 比率,上下跳動 |

被問「為什麼 Session 比 Context 大這麼多」時這樣答:問了 30 輪,前面的內容就被重讀了 30 次,`cacheRead` 通常佔 Session 九成以上。那不是虛胖,是模型真的讀過,快取只是讓它便宜約十倍。

**Session 不是花費。**三種 token 單價差很多,要看錢請看 `status` 行的 `$`。使用者若把 `sessionBudget` 設成跟 context window 同量級(例如 256k),進度條會整天滿格。實測一整天的對話約 1.3M,預設的一千萬是合理起點。

## 對話流程

**一次問一件事,不要一口氣丟七個問題。不要端預設組給他挑——逐項問比較準。**

1. 先讀現有設定,把當前版面**畫給使用者看**,問哪裡不滿意。
2. 依他的回答改對應的鍵。他說「太吵」就問要砍哪幾行;說「看不到花費」就確認 `status` 有沒有在 `lines` 裡。
3. 每改一項,把改完的版面重畫一次讓他確認。
4. **全部確認後才寫檔**,寫之前把完整的前後對照列出來:

   ```
   lines:         七行全開 → header, meters, status
   palettePreset: tokyo-night → ember
   sessionBar:    on(未變更)
   ```

   他點頭才寫。中途喊停就什麼都不寫——**改到一半的設定檔比沒改更糟**。
5. 寫完提醒他**重啟 pi 才會生效**——你是直接改 JSON 檔,沒有 watcher 會通知執行中的 pi。(`/pi-statusline-hud` 選單走的是另一條路,那條即時生效。)

## 邊界

- `motto` 是使用者的自訂文字,原樣寫入,不要替他潤飾或翻譯。**唯一的例外是控制字元**:所有進畫面的外部文字都會先剝掉 ANSI / OSC / C0-C1 / bidi 覆寫,那不是潤飾,是不讓字串奪走終端的控制通道。
- `lines` 寫成空陣列或全是錯字時,會自動回退預設七行;使用者看到行數沒變,先檢查行名是不是拼錯。
- 只寫他確認過的鍵,其餘原樣保留——設定檔裡可能有你不認得的東西。
- 不確定使用者要什麼就問,不要猜著改。
