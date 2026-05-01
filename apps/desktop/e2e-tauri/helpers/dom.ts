import { expect, type TauriPage } from "../fixtures";

export async function clickSelector(
  tauriPage: TauriPage,
  selector: string,
  timeout = 30_000
): Promise<void> {
  await expect
    .poll(
      () =>
        tauriPage.evaluate<boolean>(
          `(() => !!document.querySelector(${JSON.stringify(selector)}))()`
        ),
      { timeout, message: `missing selector: ${selector}` }
    )
    .toBe(true);
  await tauriPage.evaluate(
    `(() => {
       const el = document.querySelector(${JSON.stringify(selector)});
       if (!el) throw new Error('missing selector');
       el.click();
     })()`
  );
}

export async function fillSelector(
  tauriPage: TauriPage,
  selector: string,
  value: string
): Promise<void> {
  await waitForSelector(tauriPage, selector);
  await tauriPage.evaluate(
    `(() => {
       const el = document.querySelector(${JSON.stringify(selector)});
       if (!el) throw new Error('missing selector');
       const proto = Object.getPrototypeOf(el);
       const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
       if (descriptor?.set) descriptor.set.call(el, ${JSON.stringify(value)});
       else el.value = ${JSON.stringify(value)};
       el.dispatchEvent(new Event('input', { bubbles: true }));
       el.dispatchEvent(new Event('change', { bubbles: true }));
     })()`
  );
}

export async function clickByText(
  tauriPage: TauriPage,
  selector: string,
  text: string
): Promise<void> {
  await expect
    .poll(
      () =>
        tauriPage.evaluate<boolean>(
          `(() => Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
            .some((el) => (el.textContent ?? '').toLowerCase().includes(${JSON.stringify(text.toLowerCase())})))()`
        ),
      { timeout: 15_000, message: `missing ${selector} containing text: ${text}` }
    )
    .toBe(true);
  await tauriPage.evaluate(
    `(() => {
       const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
         .find((candidate) => (candidate.textContent ?? '').toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
       if (!el) throw new Error('missing text: ${text}');
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
  selector: string,
  timeout = 30_000
): Promise<void> {
  await expect
    .poll(() => existsSelector(tauriPage, selector), { timeout })
    .toBe(true);
}

export async function currentPath(tauriPage: TauriPage): Promise<string> {
  return tauriPage.evaluate<string>(
    `(() => window.location.pathname + window.location.search)()`
  );
}

export async function waitForPath(
  tauriPage: TauriPage,
  pattern: string
): Promise<string> {
  await expect
    .poll(() => currentPath(tauriPage), { timeout: 15_000 })
    .toMatch(new RegExp(pattern));
  return currentPath(tauriPage);
}
