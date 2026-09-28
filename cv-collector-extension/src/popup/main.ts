import { auth, disconnect, pair } from "../lib/auth";
import "./style.css";
const status = document.querySelector<HTMLElement>("#status")!;
const form = document.querySelector<HTMLFormElement>("#pair")!;
const code = document.querySelector<HTMLInputElement>("#code")!;
const error = document.querySelector<HTMLElement>("#error")!;
const disconnectButton = document.querySelector<HTMLButtonElement>("#disconnect")!;

async function render() {
  const current = await auth();
  if (current) { status.textContent = `Đã kết nối: ${current.user?.fullName || current.user?.email || "AssetFlow"}`; form.hidden = true; disconnectButton.hidden = false; }
  else { status.textContent = "Nhập mã được tạo trong Kho Ứng Viên AssetFlow."; form.hidden = false; disconnectButton.hidden = true; }
}
form.addEventListener("submit", async (event) => { event.preventDefault(); error.textContent = ""; try { await pair(code.value.trim().toUpperCase()); await render(); } catch (e) { error.textContent = e instanceof Error ? e.message : "Ghép nối thất bại"; } });
disconnectButton.addEventListener("click", async () => { await disconnect(); await render(); });
void render();
