import { type Browser, chromium } from "playwright-core";

// One headless browser for the whole server; launching takes ~0.5s.
const g = globalThis as unknown as { __pdfBrowser?: Promise<Browser> };

async function getBrowser(): Promise<Browser> {
  const existing = g.__pdfBrowser && (await g.__pdfBrowser.catch(() => undefined));
  if (existing?.isConnected()) return existing;
  g.__pdfBrowser = chromium.launch().catch((err: Error) => {
    g.__pdfBrowser = undefined;
    throw new Error(
      err.message.includes("Executable doesn't exist")
        ? "PDF renderer not installed. Run: npx playwright-core install chromium-headless-shell"
        : err.message,
    );
  });
  return g.__pdfBrowser;
}

const PX_PER_MM = 96 / 25.4;

/** How many pages a /print/... page fills, as a fraction (e.g. 1.3), given the printable page height in mm. */
export async function measurePages(url: string, printableHeightMm: number): Promise<number> {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    // Measure where the content ends: the article itself is stretched to the viewport by its container.
    const height = await page.evaluate(() => {
      const article = document.querySelector("article");
      const last = article?.lastElementChild;
      return article && last ? last.getBoundingClientRect().bottom - article.getBoundingClientRect().top : 0;
    });
    return height / (printableHeightMm * PX_PER_MM);
  } finally {
    await page.close();
  }
}

/** Prints a page of this app (e.g. /print/cv/master) to an A4 PDF. */
export async function renderPdf(url: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await page.close();
  }
}
