package com.fado.solacepos

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity

/**
 * App vỏ bọc cho mPOS Kozen P8: nạp webapp Solace + tiêm cầu in `window.NativePrinter`.
 * Webapp (printInvoice.ts) sẽ tự gọi cầu in này để in thẳng đầu in tích hợp.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false   // cho phép âm báo / giọng đọc tự phát
        }
        web.webViewClient = WebViewClient()            // giữ điều hướng trong app
        // Chỉ biến thể "p8" tiêm cầu in; bản "tablet" KHÔNG → webapp tự in qua trình duyệt.
        if (BuildConfig.FLAVOR == "p8") {
            web.addJavascriptInterface(PrinterBridge(this), "NativePrinter")
        }
        web.loadUrl("https://assetflow.fadoai.com/solace-pos")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}

/** Cầu in: web gọi window.NativePrinter.* — KHỚP hợp đồng trong README. */
class PrinterBridge(private val ctx: Context) {

    @JavascriptInterface
    fun isAvailable(): Boolean = true

    @JavascriptInterface
    fun printText(text: String) {
        // ───────────────────────────────────────────────────────────────
        // Máy: KOZEN P8 (Manufacturer "Mpos", Brand "Kozen", chip MT6762).
        // SDK in của Kozen = package `com.pos.sdk.printer` (có sẵn trên firmware máy).
        // Luồng chuẩn (theo plugin kozen_printer / cordova-plugin-kozen-p8-printer):
        //   open()  →  addPrintLine(từng dòng)  →  beginPrint()  →  close()
        //
        // GHÉP SDK (sau khi thêm jar/aar Kozen vào app/libs + build.gradle):
        //   try {
        //     val printer = com.pos.sdk.printer.POSPrinterManager(ctx) // tên class theo SDK Kozen
        //     printer.open()
        //     for (line in text.split("\n")) printer.addPrintLine(line)
        //     printer.beginPrint()
        //     printer.close()
        //   } catch (e: Exception) { Toast.makeText(ctx, "Lỗi in: "+e.message, Toast.LENGTH_LONG).show() }
        //
        // Tham khảo code sẵn có (port sang đây là chạy):
        //   - Cordova: cordova-plugin-kozen-p8-printer
        //   - Flutter: pub.dev/packages/kozen_printer  (open/addPrintLine/beginPrint/close)
        //   - SDK chính chủ: kozenenterprise.com/sdk  (printer_v3.0.aar, hỗ trợ thẻ <C><L><R><B>, width=24)
        //
        // KHÔNG cần NextPay — đây là SDK của hãng Kozen / có sẵn trên máy.
        // Tạm thời (chưa ghép SDK): Toast để kiểm cầu in đã thông.
        // ───────────────────────────────────────────────────────────────
        Toast.makeText(ctx, "IN BILL:\n" + text.take(120), Toast.LENGTH_LONG).show()
    }

    @JavascriptInterface
    fun cut() {
        // TODO P8 SDK: printer.cutPaper() — nếu máy hỗ trợ cắt giấy.
    }
}
