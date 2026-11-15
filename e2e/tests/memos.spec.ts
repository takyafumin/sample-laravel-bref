import { expect, test } from '@playwright/test';

// These tests may run against a shared, deployed database: every memo they
// create has a unique body and is deleted again by the same test.
function uniqueBody(label: string): string {
    return `e2e ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('shows the memo list served by the Lambda runtime', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Memos' })).toBeVisible();
    await expect(page.locator('dl.runtime dt:text-is("Lambda") + dd')).toHaveText('yes');
});

test('adds a memo and deletes it', async ({ page }) => {
    const body = uniqueBody('crud');
    await page.goto('/');

    await page.getByPlaceholder('メモを入力').fill(body);
    await page.getByRole('button', { name: '追加' }).click();

    await expect(page).toHaveURL(/\/$/);
    const item = page.getByRole('listitem').filter({ hasText: body });
    await expect(item).toHaveCount(1);

    await item.getByRole('button', { name: '削除' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('listitem').filter({ hasText: body })).toHaveCount(0);
});

test('shows a validation error for a too long memo', async ({ page }) => {
    await page.goto('/');
    const input = page.getByPlaceholder('メモを入力');
    // Bypass the browser-side maxlength to exercise the server-side validation.
    await input.evaluate((element) => element.removeAttribute('maxlength'));

    await input.fill('a'.repeat(1001));
    await page.getByRole('button', { name: '追加' }).click();

    await expect(page.locator('p.error')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'a'.repeat(1001) })).toHaveCount(0);
});

test('responds to the health check', async ({ request }) => {
    const response = await request.get('/up');

    expect(response.status()).toBe(200);
});

test('rejects a POST without a CSRF token', async ({ request }) => {
    const response = await request.post('/memos', {
        form: { body: uniqueBody('csrf') },
        maxRedirects: 0,
    });

    expect(response.status()).toBe(419);
});

test('returns 404 for routes that are not defined', async ({ request }) => {
    for (const path of ['/signed-upload-url', '/storage/e2e.txt', '/does-not-exist']) {
        const response = await request.get(path, { maxRedirects: 0 });
        expect(response.status(), path).toBe(404);
    }
});
