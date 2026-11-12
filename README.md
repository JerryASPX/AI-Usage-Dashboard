# AI 用量儀表板

Chrome／Edge 擴充套件（Manifest V3），用「小瑪姬／低逃」手繪風介面，一次查看 **ChatGPT、Gemini、Grok、Claude** 的官方用量頁進度。

目前版本：**v1.6.9**（Claude 未使用工作階段與 Fable、彈窗高度自動適應）。

倉庫：https://github.com/JerryASPX/AI-Usage-Dashboard

## 功能

- 點擴充套件圖示即開啟 popup，背景暫開各服務用量頁、讀完自動關閉
- 四家可獨立顯示／隱藏（ChatGPT／Gemini／Grok／Claude）
- 本機解析頁面百分比，資料存在 `chrome.storage.local`，不上傳外部伺服器
- Grok：加強 Imagine／Grok Bot 等產品列、關鍵字對照，背景讀取最長約 12 秒

## 安裝（開發者模式）

1. Clone 或下載本倉庫：
   ```bash
   git clone https://github.com/JerryASPX/AI-Usage-Dashboard.git
   ```
2. 開啟 Chrome 或 Edge 擴充功能管理頁：`chrome://extensions` 或 `edge://extensions`
3. 打開右上角「開發人員模式」
4. 點「載入未封裝項目」，選本倉庫根目錄（含 `manifest.json` 的那層）
5. 若先前已安裝舊版，可直接「重新載入」該擴充功能

## 使用

1. 先在瀏覽器登入你要查的 AI 帳號（ChatGPT／Gemini／Grok／Claude）
2. 點工具列上的擴充圖示（低逃）
3. Popup 會對勾選的服務背景讀取用量；狀態列會顯示同步時間
4. 用上方按鈕切換要顯示的服務

若某家顯示「請再開」或讀不到數字：確認該站已登入、用量頁可開，再點一次圖示。

## 專案結構

| 檔案 | 說明 |
|------|------|
| `manifest.json` | MV3 設定、權限、content scripts |
| `background.js` | Service worker：開暫存分頁、讀取、寫入 storage |
| `content.js` / `parser.js` | 在用量頁解析文字與 progress bar |
| `popup.html` / `popup.js` / `popup.css` | 儀表板 UI |
| `icons/` | 擴充圖示與各服務 SVG |

## 權限說明

- `tabs`／`scripting`：背景開用量頁並注入讀取腳本
- `storage`：快取上次讀到的用量
- 主機權限僅限：`chatgpt.com`、`chat.openai.com`、`gemini.google.com`、`grok.com`、`claude.ai`

## 維護

- 本機開發目錄參考：`D:\Projects\AI-Usage-Dashboard-v1.6.7-Fixed`（JerryROG）
- 之後改程式請以本 GitHub repo 為準；改完再同步回本機或由本機推送
- 改版本時記得同步更新 `manifest.json` 的 `version` 與 `background.js`／`content.js` 內的 `readerVersion`

## 已知限制

- 依賴各站官方用量頁 DOM／文案；對方改版可能導致解析失敗，需再調 `parser.js`／Grok 讀取邏輯
- 需已登入對應帳號；未登入時讀不到用量
- 非 Chrome Web Store 上架包，僅開發者模式載入

## Changelog（摘要）

### v1.6.9
- Claude 尚未開始使用時，工作階段記為已使用 0%；在送出第一則訊息前不顯示 5 小時重設時間
- 「本週」標題可搭配下拉箭頭正確辨識，工作階段與每週用量都讀到才關分頁
- 展開「本週」後會另列 Fable 用量（上限為每週的 50%）
- 彈窗與卡片高度自動適應內容，含 Fable 時不再出現捲軸

### v1.6.8
- 用量抓取改為等到抓到數字才關分頁，沒抓到會 reload 最多 3 次
- Grok 不再把「額外點數／額外使用額度」等標籤當成用量
- Claude 用量頁開好後先等 5 秒再開始抓，減少還沒出數字就被判定失敗

### v1.6.7
- 修復 Grok 用量讀取（Imagine／Grok Bot 等）
- 放寬 Grok 關鍵字對照
- 背景讀取逾時延長至約 12 秒
- content.js 同步：已開著的 Grok 頁也可即時讀「使用情況」

## License

私人／個人使用專案；未另標授權時請勿擅自再發行。
