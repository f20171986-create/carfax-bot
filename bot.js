import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const vin = process.env.VIN;
const reportId = process.env.REPORT_ID;

async function run() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    await page.goto("https://shafaqalkhaleej.com/admin", { waitUntil: "networkidle", timeout: 30000 });

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
    const fileBuffer = fs.readFileSync(filePath);

    const { error: uploadError } = await supabase.storage
      .from("carfax-reports")
      .upload(`${reportId}.pdf`, fileBuffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) throw uploadError;

    await supabase.from("carfax_reports").update({ status: "completed" }).eq("id", reportId);
    console.log("Success:", vin);
  } catch (err) {
    console.error("Error:", err);
    await supabase.from("carfax_reports").update({ status: "failed" }).eq("id", reportId);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

run();
