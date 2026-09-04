import { expect, test } from "@playwright/test";
import { clickSidebarItem, mockModelSearch } from "./helpers";

test.describe("Feedback page", () => {
  test.beforeEach(async ({ page }) => {
    await mockModelSearch(page);
  });

  test("fills and submits the feedback form", async ({ page }) => {
    let feedbackBody: Record<string, unknown> | null = null;
    await page.route("**/api/v1/feedback", (route) => {
      feedbackBody = route.request().postDataJSON();
      return route.fulfill({ json: { id: "fb-1" } });
    });
    await page.route("**/api/v1/analytics/**", (route) =>
      route.fulfill({ json: {} }),
    );

    await page.goto("/");
    await clickSidebarItem(page, "Geri bildirim");
    await expect(page.getByText("Radar’ı birlikte geliştirelim.")).toBeVisible();

    const feedbackForm = page.locator("#feedback form").first();
    await feedbackForm.locator("select").first().selectOption("data_error");

    const picker = feedbackForm.locator(".smart-model-search input");
    await picker.click();
    await picker.fill("gpt");
    await feedbackForm.locator(".smart-model-menu button[role=option]").first().click();
    await expect(feedbackForm.locator(".smart-model-chip")).toHaveCount(1);

    await feedbackForm.locator("textarea").fill("Context window değeri yanlış görünüyor.");

    const submit = feedbackForm.locator("button.feedback-submit");
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(submit).toHaveText(/Gönderildi/);
    expect(feedbackBody).not.toBeNull();
    expect(feedbackBody).toMatchObject({
      feedback_type: "data_error",
      message: "Context window değeri yanlış görünüyor.",
      related_model_id: "11111111-1111-1111-1111-111111111111",
    });
  });

  test("fills and submits the LLMaaS demand form", async ({ page }) => {
    let demandBody: Record<string, unknown> | null = null;
    await page.route("**/api/v1/model-demands", (route) => {
      demandBody = route.request().postDataJSON();
      return route.fulfill({ json: { id: "demand-1" } });
    });
    await page.route("**/api/v1/analytics/**", (route) =>
      route.fulfill({ json: {} }),
    );

    await page.goto("/");
    await clickSidebarItem(page, "Geri bildirim");

    const demandForm = page.locator("#feedback form").nth(1);
    const picker = demandForm.locator(".smart-model-search input");
    await picker.click();
    await picker.fill("claude");
    await demandForm.locator(".smart-model-menu button[role=option]").first().click();
    await expect(demandForm.locator(".smart-model-chip")).toHaveCount(1);

    // Picking a model reveals the progressive detail section.
    await expect(page.locator(".feedback-progressive")).toBeVisible();
    await demandForm.getByText("Startup", { exact: true }).click();
    await demandForm.getByText("Kodlama", { exact: true }).click();

    const submit = demandForm.locator("button.feedback-submit.secondary");
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(submit).toHaveText(/Talep kaydedildi/);
    expect(demandBody).not.toBeNull();
    expect(demandBody).toMatchObject({
      requested_model_ids: ["22222222-2222-2222-2222-222222222222"],
      use_cases: ["coding"],
      user_type: ["startup"],
    });
  });
});
