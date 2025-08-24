import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
    srcDir: "src",
    webExt: {
        startUrls: ["https://docs.f4team.cn"],
    },
    manifest: {
        permissions: ["downloads", "notifications", "storage", "cookies", "webRequest"],
        host_permissions: ["<all_urls>"]
    },
});
