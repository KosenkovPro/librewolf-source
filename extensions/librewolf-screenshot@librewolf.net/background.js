// The screenshot tool of the fork. The button of the toolbar captures the
// visible part of the page, the content script lets the user cut a part of it
// out and to draw on it. The whole page is captured by scrolling.

const CAPTURE_OPTIONS = { format: "jpeg", quality: 92 };

/**
 * Captures the visible part of a window.
 *
 * The api of the browser takes the number of the window, not the number of
 * the tab.
 */
async function captureVisible(windowId) {
  return browser.tabs.captureVisibleTab({ ...CAPTURE_OPTIONS, windowId });
}

/** Asks the page for the size of the document. */
async function pageMetrics(tabId) {
  const result = await browser.scripting.executeScript({
    target: { tabId },
    func: () => ({
      width: Math.max(
        document.documentElement.scrollWidth,
        document.body ? document.body.scrollWidth : 0,
      ),
      height: Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0,
      ),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }),
  });
  return result[0]?.result;
}

/** Scrolls the page to a position and waits until the picture is drawn. */
async function scrollTo(tabId, x, y) {
  await browser.scripting.executeScript({
    target: { tabId },
    func: (left, top) => window.scrollTo(left, top),
    args: [x, y],
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
}

/**
 * Captures the whole page and puts the pieces together.
 *
 * The page is scrolled down piece by piece, every piece is a picture of the
 * screen, they are put one under another.
 */
async function captureFullPage(target) {
  const metrics = await pageMetrics(target.tabId);
  if (!metrics) {
    return null;
  }

  const startX = metrics.scrollX;
  const startY = metrics.scrollY;
  const step = Math.max(200, Math.floor(metrics.viewportHeight * 0.9));
  const pieces = [];

  try {
    for (let y = 0; y < metrics.height; y += step) {
      await scrollTo(target.tabId, startX, startY + y);
      const dataUrl = await captureVisible(target.windowId);
      pieces.push({ dataUrl, y });
      if (startY + y + metrics.viewportHeight >= metrics.height) {
        break;
      }
    }
  } finally {
    await scrollTo(target.tabId, startX, startY);
  }

  const images = await Promise.all(
    pieces.map(async (piece) => ({
      y: piece.y,
      image: await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = piece.dataUrl;
      }),
    })),
  );

  const valid = images.filter((piece) => piece.image);
  if (!valid.length) {
    return null;
  }

  // The picture of the browser is in the pixels of the screen, the size of
  // the page is in the pixels of the page.
  const scale = valid[0].image.width / metrics.viewportWidth || 1;
  let width = Math.round(metrics.viewportWidth * scale);
  let height = Math.round(metrics.height * scale);

  // The browser does not take a picture that is bigger than this.
  const limit = 40 * 1000 * 1000;
  if (width * height > limit) {
    const factor = Math.sqrt(limit / (width * height));
    width = Math.max(1, Math.round(width * factor));
    height = Math.max(1, Math.round(height * factor));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  for (const piece of valid) {
    context.drawImage(
      piece.image,
      0,
      Math.round(piece.y * scale),
      piece.image.width,
      piece.image.height,
    );
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

/** Turns a data url into the bytes of a file. */
function dataUrlToBytes(dataUrl) {
  const [header, body] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)[1];
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { mime, bytes };
}

/**
 * Turns a picture into a jpeg.
 *
 * The writer of the pdf files puts the picture into the file as a jpeg, the
 * picture of the page comes as a png.
 */
async function toJpeg(dataUrl) {
  const image = await new Promise((resolve) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => resolve(null);
    element.src = dataUrl;
  });

  if (!image) {
    return { mime: "image/jpeg", bytes: new Uint8Array(0), width: 0, height: 0 };
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  const { mime, bytes } = dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92));
  return { mime, bytes, width: image.width, height: image.height };
}

async function download(dataUrl, name) {
  const { mime, bytes } = dataUrlToBytes(dataUrl);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  await browser.downloads.download({ url, filename: name, saveAs: true });
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Builds a single html file of the page: the markup of the page with the
 * stylesheets and the pictures of the site inside it.
 */
async function buildHtml(tabId, page) {
  const styles = [];
  for (const href of page.stylesheets || []) {
    try {
      const response = await fetch(href, { credentials: "include" });
      if (!response.ok) {
        continue;
      }
      const css = await response.text();
      styles.push(`<style data-source="${href}">\n${css}\n</style>`);
    } catch (error) {
      // The stylesheet is not reachable, the page keeps its own link to it.
    }
  }

  const images = [];
  for (const image of page.images || []) {
    try {
      const response = await fetch(image.src, { credentials: "include" });
      if (!response.ok) {
        continue;
      }
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      images.push({ selector: image.selector, dataUrl });
    } catch (error) {
      // The picture cannot be read, it keeps its link.
    }
  }

  let markup = page.html;
  for (const image of images) {
    markup = markup.split(`src="${image.selector}"`).join(`src="${image.dataUrl}"`);
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${page.title || "LibreWolf capture"}</title>
<base href="${page.base || ""}">
${styles.join("\n")}
</head>
<body>
${markup}
</body>
</html>`;
}

browser.browserAction.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }
  try {
    const dataUrl = await captureVisible(tab.windowId);
    await browser.tabs.sendMessage(tab.id, {
      type: "librewolf-screenshot-show",
      dataUrl,
      page: { title: tab.title, url: tab.url },
    });
  } catch (error) {
    console.error("The page could not be captured", error);
  }
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  const tabId = sender.tab?.id;

  switch (message?.type) {
    case "librewolf-screenshot-full-page": {
      const windowId = { tabId, windowId: sender.tab?.windowId };
      const dataUrl = await captureFullPage(windowId);
      return { dataUrl };
    }

    case "librewolf-screenshot-copy": {
      const { bytes } = dataUrlToBytes(message.dataUrl);
      await browser.clipboard.setImageData({ format: "png", data: bytes.buffer });
      return { ok: true };
    }

    case "librewolf-screenshot-save": {
      await download(message.dataUrl, message.name || "librewolf-screenshot.png");
      return { ok: true };
    }

    case "librewolf-screenshot-pdf": {
      // The writer of the pdf files takes the picture as a jpeg, the picture
      // of the page comes as a png.
      const { bytes, width, height } = await toJpeg(message.dataUrl);
      if (!bytes.length) {
        throw new Error("The picture of the page could not be read");
      }
      const pdf = LibreWolfPdf.buildPdf(
        [{ data: bytes, width, height }],
        [{ width, height }],
      );
      const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      await browser.downloads.download({
        url,
        filename: message.name || "librewolf-screenshot.pdf",
        saveAs: true,
      });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { ok: true };
    }

    case "librewolf-screenshot-html": {
      const page = await browser.tabs.sendMessage(tabId, { type: "librewolf-screenshot-page" });
      const html = await buildHtml(tabId, page);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      await browser.downloads.download({
        url,
        filename: message.name || "librewolf-page.html",
        saveAs: true,
      });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { ok: true };
    }

    default:
      return undefined;
  }
});
