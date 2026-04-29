import { expect, type TauriPage } from "../fixtures";

export async function clickSelector(
  tauriPage: TauriPage,
  selector: string
): Promise<void> {
  await expect
    .poll(
      () =>
        tauriPage.evaluate<boolean>(
          `(() => !!document.querySelector(${JSON.stringify(selector)}))()`
        ),
      { timeout: 15_000, message: `missing selector: ${selector}` }
    )
    .toBe(true);
  await tauriPage.evaluate(
    `(() => {
       const el = document.querySelector(${JSON.stringify(selector)});
       if (!el) throw new Error('missing selector: ${selector}');
       el.click();
     })()`
  );
}

export async function visibleText(tauriPage: TauriPage): Promise<string> {
  return tauriPage.evaluate<string>(
    `(() => document.body?.innerText ?? "")()`
  );
}

export async function existsSelector(
  tauriPage: TauriPage,
  selector: string
): Promise<boolean> {
  return tauriPage.evaluate<boolean>(
    `(() => !!document.querySelector(${JSON.stringify(selector)}))()`
  );
}

export async function waitForSelector(
  tauriPage: TauriPage,
  selector: string
): Promise<void> {
  await expect
    .poll(() => existsSelector(tauriPage, selector), { timeout: 15_000 })
    .toBe(true);
}
