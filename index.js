import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Carfax Robot is running!");
});

app.post("/fetch-carfax", async (req, res) => {
  const { vin } = req.body;
  if (!vin) return res.status(400).json({ error: "رقم الشاصي مطلوب" });

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    await page.goto("https://shafaqalkhaleej.com/admin", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill(process.env.SHAFAQ_EMAIL);
      await page.fill('input[type="password"]', process.env.SHAFAQ_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForLoadState("networkidle", { timeout: 30000 });
    }

    const vinInput = page.locator('input[maxlength="17"], input[type="text"]').first();
    await vinInput.waitFor({ state: "visible", timeout: 15000 });
    await vinInput.fill(vin);
    await page.getByRole("button", { name: "طلب" }).click();

    const downloadBtn = page
      .getByRole("button", { name: /تحميل ملف PDF/i })
      .or(page.locator('a:has-text("تحميل ملف PDF"), button:has-text("تحميل ملف PDF")'));
    await downloadBtn.first().waitFor({ state: "visible", timeout: 60000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.first().click(),
    ]);

    const filePath = `/tmp/carfax_${vin}.pdf`;
    await download.saveAs(filePath);
    const pdfBase64 = fs.readFileSync(filePath).toString("base64");
    fs.unlinkSync(filePath);

    res.json({ success: true, pdfBase64 });
  } catch (err) {
    console.error("Robot Error:", err);
    res.status(500).json({ error: "تعذر جلب التقرير من المصدر حالياً" });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Carfax Robot listening on port ${PORT}`));
