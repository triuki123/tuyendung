const TOKEN_KEY = "assetflow_cv_token";
const USER_KEY = "assetflow_cv_user";

export async function pair(code: string) {
  const response = await fetch("https://assetflow.fadoai.com/api/extension/pair", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, deviceName: navigator.userAgent.includes("Windows") ? "Chrome Windows" : "Chrome Extension" }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.data?.token) throw new Error(json.error || "Ghép nối thất bại");
  await chrome.storage.local.set({ [TOKEN_KEY]: json.data.token, [USER_KEY]: json.data.user });
  return json.data.user;
}

export async function auth() {
  const data = await chrome.storage.local.get([TOKEN_KEY, USER_KEY]);
  return data[TOKEN_KEY] ? { token: data[TOKEN_KEY] as string, user: data[USER_KEY] } : null;
}

export async function disconnect() { await chrome.storage.local.remove([TOKEN_KEY, USER_KEY]); }
