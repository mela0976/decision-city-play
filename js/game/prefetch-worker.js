// P1 perf：在 worker 執行緒把檔案下載進瀏覽器的 HTTP 快取。主執行緒建城市時是一連串長任務，
// 在主執行緒讀回應會讓下載跟著停住；放在 worker 讀，網路在建城市期間也一直有在用。
// 每則訊息是一組：{ id, priority: 'high' | 'low', urls: [...] }；一組下載完才開始下一組，完成回傳 id。
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    await Promise.all((data?.urls || []).map((url) => fetch(url, { priority: data.priority || 'low' }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)));
    self.postMessage(data?.id);
  });
};
