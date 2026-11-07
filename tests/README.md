# 教材瀏覽器檢查

在儲存庫根目錄首次執行 `npm ci` 與 `npm run test:setup`，之後使用 `npm test`。需要 Linux 系統套件時可使用 `npx playwright install --with-deps chromium`。測試直接開啟本機 HTML，失敗時將截圖及錯誤資訊寫入 `test-results/`。

`lessons.json` 的 `basic` 僅列已存在、尚未採用完整測試介面的教材；每份新教材須加入 `full`，否則測試會失敗。`full` 每筆的 `path` 是相對儲存庫根目錄的教材路徑，`questions` 依題目順序列出：

- `id`：題目識別，對應導覽按鈕、文章與表單的 `data-qid`。
- `type`：變化練習題型，為 `numeric`、`text`、`single_choice` 或 `multiple_choice`。
- `correct`、`wrong`：獨立驗算的正確與錯誤輸入；文字／數值為字串，選擇題為選項值陣列。
- `partial`：多選題非空、但不完整的答案陣列。
- `unit`、`tolerance`：數值題畫面顯示的單位及容許誤差文字。

完整測試使用按鈕 `data-action` 的 `prev-step`、`next-step`、`show-all`、`submit-practice`、`retry-practice`；文章包含 `.solution-steps .step`、`.original-answer`、`.practice-solution`、`.feedback`，數值題包含 `.unit` 和 `.grading-hint`。回饋以 `data-state` 的 `empty`、`wrong`、`correct` 表示判定。全頁的 `#prev-question`、`#next-question`、`#reset-question` 與 `#completion-count` 提供跨題操作及統計。只有一題時，測試檢查前後題按鈕不可用。

測試檢查介面與離線行為；題面辨識、學科推導和測試答案仍須人工或獨立推導核對。
