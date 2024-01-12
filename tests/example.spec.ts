import { test, expect } from '@playwright/test';

// test('has title', async ({ page }) => {
//   await page.goto('https://playwright.dev/');
//
//   // Expect a title "to contain" a substring.
//   await expect(page).toHaveTitle(/Playwright/);
// });
//
// test('get started link', async ({ page }) => {
//   await page.goto('https://playwright.dev/');
//
//   // Click the get started link.
//   await page.getByRole('link', { name: 'Get started' }).click();
//
//   // Expects page to have a heading with the name of Installation.
//   await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
// });


test('Get performance metrics', async ({ page, browser }) => {
  //Create a new connection to an existing CDP session to enable performance Metrics
  const session = await page.context().newCDPSession(page)
  //To tell the CDPsession to record performance metrics.
  await session.send("Performance.enable")
  await browser.startTracing(page, { path: './perfTraces.json', screenshots: true })
  await page.goto("http://localhost:7000/bench.html")




  await page.evaluate(() => (window.performance.mark('vue:start')))
  await page.evaluate(() => (window.pushVue1()))
  await page.evaluate(() => (window.performance.mark('vue:end')))
  await page.evaluate(() => (window.performance.measure("push-vue", "vue:start", "vue:end")))


  await page.evaluate(() => window.performance.mark('x2:start'))
  await page.evaluate(() => window.pushX21())
  await page.evaluate(() => (window.performance.mark('x2:end')))
  await page.evaluate(() => (window.performance.measure("push-x2", "x2:start", "x2:end")))


  await page.evaluate(() => window.performance.mark('x3:start'))
  await page.evaluate(() => window.pushX31())
  await page.evaluate(() => window.performance.mark('x3:end'))
  await page.evaluate(() => window.performance.measure("push-x3", "x3:start", "x3:end"))




  await page.evaluate(() => (window.performance.mark('vue:start')))
  await page.evaluate(() => (window.unshiftVue1()))
  await page.evaluate(() => (window.performance.mark('vue:end')))
  await page.evaluate(() => (window.performance.measure("unshift-vue", "vue:start", "vue:end")))


  await page.evaluate(() => window.performance.mark('x2:start'))
  await page.evaluate(() => window.unshiftX21())
  await page.evaluate(() => (window.performance.mark('x2:end')))
  await page.evaluate(() => (window.performance.measure("unshift-x2", "x2:start", "x2:end")))


  await page.evaluate(() => window.performance.mark('x3:start'))
  await page.evaluate(() => window.unshiftX31())
  await page.evaluate(() => window.performance.mark('x3:end'))
  await page.evaluate(() => window.performance.measure("unshift-x3", "x3:start", "x3:end"))


  //To get all performance marks
  // const getAllMarksJson = await page.evaluate(() => (JSON.stringify(window.performance.getEntriesByType("mark"))))
  // const getAllMarks = await JSON.parse(getAllMarksJson)
  // console.log('window.performance.getEntriesByType("mark")', getAllMarks)

  const getAllMeasuresJson = await page.evaluate(() => (JSON.stringify(window.performance.getEntriesByType("measure"))))
  const getAllMeasures = await JSON.parse(getAllMeasuresJson)
  console.log('window.performance.getEntriesByType("measure")', getAllMeasures)

})