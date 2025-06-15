# RTSP 轉 MJPEG 轉換器

這是一個簡單易用的 Node.js 應用程式，可以將 RTSP 視訊串流轉換為 MJPEG 格式，並透過 HTTP 提供服務。我們使用 FFmpeg 來處理視訊轉碼，並提供一個直覺的網頁介面讓您輕鬆查看串流內容。

## 功能特色

- 輕鬆將 RTSP 串流轉換為 MJPEG 格式
- 透過網頁方便查看串流
- 支援自訂 RTSP URL，

## 系統需求

- Node.js（建議使用 12.x 或更新版本）
- npm（安裝 Node.js 時會自動安裝）

## 安裝步驟

1. 複製此儲存庫或下載原始碼
2. 進入專案目錄
3. 執行以下指令安裝所需套件：

```bash
npm install
```

## 使用方式

1. 啟動伺服器：

```bash
npm start
```

2. 用瀏覽器開啟 `http://localhost:3000`

3. 在輸入欄位中輸入您的 RTSP URL（如果沒有輸入，將使用預設值）

4. 點擊「開始串流」即可查看視訊內容

## 環境變數設定

您可以透過以下環境變數來自訂應用程式的行為：

- `PORT`：設定伺服器監聽的連接埠（預設值：3000）
- `RTSP_URL`：設定預設的 RTSP URL

使用範例：

```bash
PORT=8080 RTSP_URL=rtsp://your-camera.example.com/stream npm start
```

## 運作原理

1. 使用 `fluent-ffmpeg` 和 `ffmpeg-static` 來處理 RTSP 串流
2. 系統會將 RTSP 串流解碼並轉換為 MJPEG 格式
3. 轉換後的 MJPEG 串流會透過 Express.js HTTP 端點提供服務
4. 網頁介面使用 HTML `<img>` 標籤來顯示串流內容

## 故障排除

如果遇到問題，請參考以下建議：

- 如果看不到視訊串流，請確認 RTSP URL 是否正確，以及伺服器是否能夠正常存取
- 檢查您的防火牆設定，確保允許連接到 RTSP 來源
- 查看主控台輸出，檢查是否有 FFmpeg 相關的錯誤訊息
