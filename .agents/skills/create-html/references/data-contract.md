# 辨識與解題的交接資料

分工或需要保留中間成果時，以 UTF-8 JSON 保存下列資訊；可以合併成一個檔案，或按題目拆檔。這是內容契約，不限定產生 HTML 的程式或視覺設計。

## 題目資料

- `id`：字串，包含題型與題號；有小題時也包含小題，例如 `single-14`、`multiple-24`、`calculation-2-b`。同一教材中唯一。
- `questionVersion`：正整數，題目首次辨識定稿時為 `1`；更新與合併規則見下方「版本與交接檢查」。
- `type`：`single_choice`、`multiple_choice`、`numeric` 或 `text`。
- `number`：原卷題號字串。
- `source`：物件，記錄圖片檔名、來源頁，以及必要時的裁切區域。
- `stem`：完整題幹字串，包含跨頁或共用條件。
- `options`：選項代號對文字的物件；非選擇題用空物件。
- `requiredSelections`：應選數量；非選擇題或原題未限定時用 `null`。
- `diagram`：無必要圖形時為 `null`；有圖時使用下方「圖片資料」的物件，記錄圖形條件、來源、處理及比對結果。
- `recognitionEvidence`：關鍵符號辨識的本機暫存紀錄陣列；需要裁圖核對時必填，內容見下方「辨識證據」。不與 `diagram` 混用，不納入教材或 Git。
- `uncertainties`：字串陣列，記錄仍無法確認的辨讀處；已核對無誤時為空陣列。

## 解題資料

- `id`：對應題目識別。
- `questionVersion`：實際採用的定稿題目版本，須與同一 `id` 的題目資料完全相同。
- `topic`、`insight`：主題及讀題切入點字串。
- `steps`：依序排列的推導字串陣列。
- `answerStatus`：`verified`、`ambiguous` 或 `unresolved`。
- `answer`：選擇題一律使用字母陣列，單選也是陣列；未能確定時用 `null`。若只有最近選項，保留 `answer: null`，在 `notes` 說明其差異。
- `answerText`：所有題型均可顯示的結論字串；數值題包含單位與精確／近似值，疑義題列出可確定的計算結果。
- `optionAnalysis`：選項代號對解析的物件，非選擇題為空物件。
- `pitfalls`、`notes`：字串陣列，分別為教學注意事項與題面疑義／適用假設。無內容時為空陣列。
- `practice`：包含 `type`、`stem`、`options`、`requiredSelections`、`answer`、`answerText` 與 `steps`；非選擇題另有 `grading`，明確定義數值容許誤差與單位，或可接受的文字答案。練習需有可確定的正解。

## 辨識證據

`recognitionEvidence` 每筆包含：

- `source`：原圖檔名、來源頁及原圖像素裁切區域 `x`、`y`、`width`、`height`，原點為左上角。
- `path`：本機暫存裁圖路徑，供辨識審核與交接使用。
- `transcription`：裁圖中影響答案的印刷內容與其轉錄，足以對照分數、底數、指數及其他關鍵符號。
- `comparison`：物件，`status` 為 `pending`、`verified` 或 `unresolved`，`notes` 為比對說明字串陣列。所有必需證據均為 `verified` 才可定稿；未解疑義記入 `uncertainties`。

原始含筆跡裁圖不交給首輪解題者；提供解題者的題目資料須移除 `recognitionEvidence` 暫存路徑及原始裁圖，只包含定稿題目、必要乾淨圖片與中性疑義。暫存辨識證據不提交 Git，也不內嵌至教材。

## 圖片資料

`diagram` 包含：

- `description`：必要圖形及條件的文字描述，包括座標、標記、數值與位置關係。
- `source`：原圖檔名、來源頁及裁切區域；裁切區域以原圖像素記錄 `x`、`y`、`width`、`height`，原點為左上角。共用圖仍須能回溯到實際來源。
- `path`：處理後點陣圖片或 SVG 的檔案位置，供製作時讀取並完整內嵌；不是成品 HTML 的外部依賴。
- `presentation`：`cleaned_raster` 或 `svg_redraw`。前者為去除手寫筆跡後的原題裁圖（原圖無筆跡時可直接裁切）；後者僅限簡單圖形，顯示時標示「重繪示意」。
- `comparison`：物件，包含 `status`（`pending`、`verified` 或 `unresolved`）及 `notes`（字串陣列）。記錄與原圖並列比對的結果及具體差異；`verified` 表示必要印刷內容與解題條件完整一致，SVG 亦已核對形狀、位置關係、方向、比例註記與標籤。

若有多張必要圖，另以 `additionalDiagrams` 陣列保存其餘圖片，每筆使用相同結構並一併驗證及內嵌。手寫筆跡遮蔽且無法確認的內容，同時記入題目的 `uncertainties`，圖片比對標為 `unresolved`，暫停該題定稿及解題。

## 版本與交接檢查

- 題目先核對定稿並記錄 `questionVersion`，再交付解題。首輪解題輸入僅含定稿題目、選項、必要乾淨圖片及中性的辨識疑義；原始含批改筆跡的圖片保留供辨識追溯，不作首輪解題輸入。
- 題幹（含共用條件）、選項、題型、應選數或圖中條件更正時，`questionVersion` 遞增；受影響的解答重新驗證後才可記錄新版本。不得只替舊解答改版本號。單純清除筆跡或調整圖片檔案位置且條件未變時，不必遞增版本，但仍須完成圖片比對。
- 舊題目資料先與原卷核對，才能補上初始版本；既有版本則沿用並依更正情況遞增。舊解答須依該版本重新驗證後才可補上版本，不推定其適用新版題目。
- 解題交接與製作合併時逐題核對 `id` 與 `questionVersion`；版本須為正整數且完全相同。缺少版本、版本不同或對應不明時停止合併該題，回交核對，其餘符合條件的題目可繼續。
- 核對題目清單完整、資料型別一致、選項答案存在於該題選項中、多選答案數量符合題面，以及練習題有自己的題型。原題選項有疑義而無確定答案時保留 `answer: null` 與疑義說明，不為符合應選數而硬填答案。
- 有必要圖形的題目，須確認 `diagram` 及 `additionalDiagrams` 的來源可追溯、處理後檔案可讀且 `comparison.status` 均為 `verified`，才可定稿交付解題及合併製作。

製作 agent 必須保留辨識及解題階段已列出的疑義；發現內容問題時回交核對，避免為了介面方便自行改答案。

將資料內嵌至 HTML 時安全處理文字及 script 結束標記，避免題幹中的特殊字元破壞文件或被解讀成可執行程式。可見文字優先以 `textContent` 或適當跳脫後的 HTML 建立。
