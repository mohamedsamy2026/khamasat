import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import type { Report } from "../../shared/athlete";
import { renderVerifiedReportHtml } from "./verifiedReportExport";

const BROWSER_TIMEOUT_MS = 15_000;
const PDF_TIMEOUT_MS = 20_000;
const CLOSE_TIMEOUT_MS = 4_000;
let renderInProgress = false;

export class PdfReportRenderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfReportRenderError";
  }
}

/** A small testable guard before a response is ever sent as application/pdf. */
export function hasPdfMagic(document: Uint8Array): boolean {
  return (
    document.length >= 5 &&
    document[0] === 0x25 &&
    document[1] === 0x50 &&
    document[2] === 0x44 &&
    document[3] === 0x46 &&
    document[4] === 0x2d
  );
}

function localWoffBase64(filename: string): string {
  // The report has no external font URLs: only shipped @fontsource Cairo assets
  // are read into CSS data URIs at render time.
  const file = path.resolve(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "cairo",
    "files",
    filename
  );
  return readFileSync(file).toString("base64");
}

function embeddedCairoCss(): string {
  const regular = localWoffBase64("cairo-arabic-400-normal.woff");
  const bold = localWoffBase64("cairo-arabic-700-normal.woff");
  return `@font-face{font-family:"Cairo Export Arabic";font-style:normal;font-weight:400;font-display:block;src:url("data:font/woff;base64,${regular}") format("woff")}@font-face{font-family:"Cairo Export Arabic";font-style:normal;font-weight:700;font-display:block;src:url("data:font/woff;base64,${bold}") format("woff")}`;
}

async function within<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new PdfReportRenderError(timeoutMessage)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function closeBrowser(browser: Browser | undefined): Promise<void> {
  if (!browser) return;
  try {
    await within(browser.close(), CLOSE_TIMEOUT_MS, "انتهت مهلة إغلاق Chromium");
  } catch {
    // Rendering has already either completed or been reported; never hide that
    // state with a best-effort cleanup error.
  }
}

/**
 * Renders the saved-report HTML to a real PDF. It deliberately receives no URL,
 * permits no JavaScript, and aborts every network request (data URIs need none).
 */
export async function renderVerifiedReportPdf(report: Report): Promise<Buffer> {
  if (renderInProgress)
    throw new PdfReportRenderError("يجري إنشاء تقرير PDF آخر؛ أعد المحاولة بعد اكتماله.");
  renderInProgress = true;
  let browser: Browser | undefined;
  try {
    const html = renderVerifiedReportHtml(report, {
      embeddedFontCss: embeddedCairoCss(),
      printMode: true,
    });
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      headless: true,
      timeout: BROWSER_TIMEOUT_MS,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await within(
      browser.newContext({
        javaScriptEnabled: false,
        viewport: { width: 1240, height: 1754 },
        deviceScaleFactor: 1,
      }),
      BROWSER_TIMEOUT_MS,
      "انتهت مهلة تهيئة صفحة PDF"
    );
    try {
      await context.route("**/*", route => route.abort());
      const page = await within(
        context.newPage(),
        BROWSER_TIMEOUT_MS,
        "انتهت مهلة فتح صفحة PDF"
      );
      page.setDefaultTimeout(BROWSER_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(BROWSER_TIMEOUT_MS);
      await within(
        page.setContent(html, { waitUntil: "load" }),
        BROWSER_TIMEOUT_MS,
        "انتهت مهلة تجهيز محتوى تقرير PDF"
      );
      const document = await within(
        page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
        }),
        PDF_TIMEOUT_MS,
        "انتهت مهلة إنشاء ملف PDF"
      );
      if (!hasPdfMagic(document))
        throw new PdfReportRenderError(
          "أعاد Chromium ملفًا غير صالح بدل مستند PDF؛ لم يتم إرساله"
        );
      return document;
    } finally {
      await context.close().catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof PdfReportRenderError) throw error;
    throw new PdfReportRenderError(
      "تعذر إنشاء ملف PDF بواسطة Chromium حاليًا؛ لم يتم إنشاء ملف بديل.",
      { cause: error }
    );
  } finally {
    await closeBrowser(browser);
    renderInProgress = false;
  }
}
