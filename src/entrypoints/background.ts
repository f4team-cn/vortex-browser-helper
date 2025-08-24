const requestHeadersCache = new Map<string, Array<{ key: string; value: string }>>();
const filenameCache = new Map<number, string>();
const callbackDownloadUrls = new Set<string>();

setInterval(() => {
  requestHeadersCache.clear();
  filenameCache.clear();
}, 10 * 60 * 1000); // 10 分钟清理一次

function extractFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").pop();
    return name && name.length > 0 ? name : "unknown";
  } catch {
    return "unknown";
  }
}

// 规定
const CLIENT_HOST = 'localhost.vortex.f4team.cn';
const CLIENT_PORTS = [51220, 51221, 51222, 51223, 51224, 51225];

const sendTaskToClient = async (
    task: NewTaskBuilder,
    onFail?: () => void
) => {
  const abortControllers = CLIENT_PORTS.map(() => new AbortController());
  let success = false;

  await Promise.all(
      CLIENT_PORTS.map((port, index) =>
          fetch(`http://${CLIENT_HOST}:${port}/new-task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task),
            signal: abortControllers[index].signal
          })
              .then((res) => {
                if (res.status === 201) {
                  success = true;
                  // 成功后取消其他请求
                  abortControllers.forEach((controller, i) => i !== index && controller.abort());
                }
              })
              .catch(() => { }) // 忽略单个请求错误
      )
  );

  if (!success && onFail) onFail();
};

export default defineBackground(() => {
  let scriptStartupTime = Date.now();
  // 缓存请求 Headers
  browser.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        requestHeadersCache.set(
            details.url,
            details.requestHeaders?.map((h) => ({ key: h.name, value: h.value || "" })) || []
        );
        return {};
      },
      { urls: ["<all_urls>"] },
      ["requestHeaders"]
  );

  browser.runtime.onStartup.addListener(() => {
    scriptStartupTime = Date.now();
  });

  // 缓存下载文件名
  browser.downloads.onDeterminingFilename.addListener((item, suggest) => {
    if (item.filename) filenameCache.set(item.id, item.filename);
    suggest({ filename: item.filename });
  });

  // 下载拦截
  browser.downloads.onCreated.addListener((item) => {
    (async () => {

      if (new Date(item.startTime).getTime() < scriptStartupTime) return;

      // 回调下载直接放行
      if (callbackDownloadUrls.has(item.url)) {
        callbackDownloadUrls.delete(item.url);
        return;
      }

      // 取消原始下载
      browser.downloads.cancel(item.id).catch(() => { });

      const url = item.url;
      const filename =
          filenameCache.get(item.id) ||
          (item.filename && item.filename.length > 0 ? item.filename : extractFilenameFromUrl(url));
      const headers = requestHeadersCache.get(url) || [];

      // 并行获取 cookies
      const cookie = await browser.cookies.getAll({ url }).then((cookies) =>
          cookies.map((c) => `${c.name}=${c.value}`).join("; ")
      );

      // 构建任务对象
      const task: NewTaskBuilder = {
        links: url,
        filename,
        split: 5,
        userAgent: headers.find(h => h.key.toLowerCase() === "user-agent")?.value || '',
        referer: headers.find(h => h.key.toLowerCase() === "referer")?.value || '',
        headers,
        cookie
      };

      // 发送任务到客户端，失败则回调浏览器下载
      await sendTaskToClient(task, async () => {
        console.warn('[Vortex Web Extension] Fallback to browser download for', url);
        try {
          callbackDownloadUrls.add(url);
          await browser.downloads.download({url, filename});
        } catch (e) {
          console.error(e);
        }
      });
    })();
  });
});
