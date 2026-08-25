---
name: pi-statusline-hud-setup
description: 排解 pi-statusline-hud 裝不起來或看不到的問題。當使用者說 HUD 沒出現、footer 是空的、顏色不對、改了設定沒生效、或問怎麼安裝、怎麼更新、怎麼移除時使用;純粹要調外觀請改用 pi-statusline-hud。
---

# pi-statusline-hud 安裝與疑難排解

## 你負責哪一半

這個套件有三條設定路徑,你是**其中一條的一半**:

| 路徑 | 誰在跑 | 管什麼 |
|---|---|---|
| `/pi-statusline-hud` | 套件自己的原生選單 | 逐項點選,最快,不經過 agent |
| `pi-statusline-hud` skill | 另一個 skill | 用對話調外觀 |
| **本 skill** | **你** | **裝不起來、看不到、不生效** |

外觀的問題(要顯示哪幾行、換配色、改座右銘)不是你的守備範圍,交給 `pi-statusline-hud` skill 或叫他跑 `/pi-statusline-hud`。

## 關鍵路徑

`agentDir` 通常是 `~/.pi/agent`。

| 東西 | 位置 |
|---|---|
| 套件清單 | `<agentDir>/settings.json` 的 `packages` |
| 本套件設定 | `<agentDir>/pi-statusline-hud.json` |
| git 套件快取 | `<agentDir>/git/github.com/johnkai-kai/pi-statusline-hud` |
| 安裝時的備份 | `<agentDir>/settings.json.bak-pi-statusline-hud`(已存在會往後加序號) |

## 安裝

```
pi install git:github.com/johnkai-kai/pi-statusline-hud
```

裝完**必須重啟 pi**。

**安裝時不會寫入任何檔案**,只印出偵測到的 footer 衝突與手動步驟。要它自動處理(會先備份 `settings.json`)就帶 `PI_HUD_AUTOFIX=1` 重裝。

## 診斷順序

**一次查一項,查完再往下。** 大多數情況第 1 或第 2 項就結束了。

### 1. 有沒有重啟 pi

**裝套件與更新快取要重啟。改設定不用。**

`/pi-statusline-hud` 選單改的設定即時生效;agent 直接改 JSON 檔則要重啟(或跑一次選單)。所以「改了沒生效」這句話要先問清楚是哪一種——如果他是用選單改的,重啟不是答案,往下查第 2 項。

### 2. footer 被別的套件搶走了

pi 的 footer **一次只能被一個 extension 佔用**,兩邊都裝時只會看到其中一個。

讀 `<agentDir>/settings.json` 的 `packages`,找名字含 `statusline` 或 `footer` 且不是 `pi-statusline-hud` 的條目——例如 `npm:@narumitw/pi-statusline`。有的話請他移除那一行再重啟。

### 3. 套件根本沒在清單裡

`packages` 裡找不到 `pi-statusline-hud` 就是沒裝成功,回去跑安裝指令。

### 4. git 快取停在舊版

**這是 `git:` 來源特有的坑:pi 不會自動更新它。** 上游推了新 commit,本機快取還是舊的,症狀是「你明明修好了但我看到的還是舊行為」。

先比對:

```bash
git -C <agentDir>/git/github.com/johnkai-kai/pi-statusline-hud log --oneline -1
```

跟遠端不一樣就更新:

```bash
git -C <agentDir>/git/github.com/johnkai-kai/pi-statusline-hud fetch origin
git -C <agentDir>/git/github.com/johnkai-kai/pi-statusline-hud reset --hard origin/master
```

然後重啟 pi。

### 5. 設定檔壞掉

`<agentDir>/pi-statusline-hud.json` 不是合法 JSON 時會**整份回退預設值**,而不是讓 footer 崩掉——footer 每回合都在渲染,它一崩整個 pi 就不能用。

所以症狀是「我的設定好像沒吃到」,不是「畫面壞了」。把檔案讀出來確認 JSON 合法。

### 6. 行全被關掉了

`lines` 只剩 `repo` 與 `tools` 時,沒有 git 分支又還沒跑過工具,兩行都會渲染成空字串,看起來就是沒有 HUD。程式有保底(全空時強制畫 `status`),但如果他自己把 `lines` 改成怪東西,先看這裡。

## 顏色不對

**這個套件不嗅探終端能力。** 早期版本會看 `COLORTERM` 與 `WT_SESSION`,兩個都沒設就整份退回 `mono`——但那兩個變數只是慣例,**沒設不代表終端不支援**(Git Bash 的 MinTTY 就兩個都不設,卻完全支援 truecolor)。現在一律上色。

所以整份沒顏色只剩一個可能:**環境變數 `NO_COLOR` 有值**。

```bash
echo "[$NO_COLOR]"          # bash
echo "[$env:NO_COLOR]"      # PowerShell
```

進度條的填滿與未填滿是**兩個不同字元**(`█` 與 `░`),不是同一個方塊換顏色——就算關色也讀得出比例。如果他看到一整條實心方塊,那是舊版,回到第 4 項更新快取。

## session 橫線沒出現

輸入框上方那條帶 session 名的橫線,兩個可能:

1. **`sessionBar` 設成 `off`** —— 看 `<agentDir>/pi-statusline-hud.json`。
2. **終端太窄** —— 寬度不足以畫出可讀的橫線時整條不畫,不畫壞的。

顯示成 `#a3f9c1` 而不是名字**不是壞掉**:那是還沒替這個 session 命名時的退路,取 session id 前六碼。

## 名字裡的怪字元不見了

所有進畫面的外部文字——model id、provider、工具名、MCP 伺服器名、session 名、git 分支、目錄名、motto——都會先剝掉 ANSI 逸出序列、OSC 序列、C0/C1 控制字元與 bidi 方向覆寫。

**這是刻意的,不是 bug。** 那些字串有一部分不是使用者打的:session 名由 agent 寫進 `session_info`,工具名與 MCP 伺服器名來自第三方套件。未經處理送進終端等於把控制通道交出去(OSC 52 能寫剪貼簿、OSC 0 能改視窗標題、CSI 能清畫面),而且 HUD 的寬度計算會把逸出序列當成零寬,**版面完全不會歪,肉眼看不出來**。

中文、emoji、標點、box drawing 字元都不受影響。

## 移除

把那一行從 `packages` 移掉、重啟就乾淨了。設定檔 `pi-statusline-hud.json` 不會自動刪,想留著下次用也行。

安裝時如果動過 `settings.json`,備份在 `<agentDir>/settings.json.bak-pi-statusline-hud`,改回原檔名就還原。

## 邊界

- **改任何檔案之前先讀出來給他看**,尤其是 `settings.json`——那裡面有他其他套件的設定。
- 不要替他決定移除哪個衝突套件,指名是哪一個、問他要不要動。
- 診斷不出來就老實說查到哪一步、還有什麼沒排除,不要猜著改。
