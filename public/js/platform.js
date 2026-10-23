/**
 * 运行平台适配。网页里什么也不做，保持原有行为；Android App（Capacitor）里加载随 APK 打包的
 * /js/native-bridge.js（由 mobile/build-web.js 生成，网页部署里没有这个文件），接管返回键、键盘、
 * 系统栏与启动页，导出文件改走系统分享。
 */

// Capacitor 在页面脚本运行前注入 window.Capacitor；网页里没有
export const isNativeApp = globalThis.Capacitor?.isNativePlatform?.() === true;

let bridge = null;

/** App 里加载原生桥并接管系统返回；onBack 在用户按返回键或做返回手势时调用。 */
export async function initPlatform({ onBack }) {
  if (!isNativeApp) return;
  bridge = await import("/js/native-bridge.js");
  await bridge.init({ onBack });
}

/** 把应用切到后台（安卓在首页按返回的惯例）；网页里无操作。 */
export function minimizeApp() {
  void bridge?.minimizeApp();
}

/**
 * 保存文本文件：网页里触发下载；App 里写入缓存目录后调起系统分享（存到“文件”或发给别的应用）。
 * @returns {Promise<boolean>} 用户在分享面板里取消时为 false
 */
export async function saveTextFile(name, text, type) {
  if (bridge) return bridge.shareTextFile(name, text);
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
