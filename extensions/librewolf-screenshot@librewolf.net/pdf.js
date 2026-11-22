// A small writer of pdf files. The picture is put into the pdf as a jpeg, so
// the file stays small and every reader can show it.

/**
 * Builds a pdf with one page per picture.
 *
 * @param {Array<{data: Uint8Array, width: number, height: number}>} images
 *   The pictures as jpeg data with their size in pixels.
 * @param {Array<{width: number, height: number}>} [sizes]
 *   The size of the pages in points, the size of the picture by default.
 * @returns {Uint8Array} the content of the pdf file
 */
function buildPdf(images, sizes) {
  const encoder = new TextEncoder();

  // Every object is a header and, for the objects with a stream, the data of
  // the stream. The cross references are written at the end, when the offsets
  // of the objects are known.
  const objects = [];
  const addObject = (header, stream) => {
    objects.push({ header, stream: stream || null });
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 0 0 R >>");
  const pagesId = addObject("<< /Type /Pages /Kids [] /Count 0 >>");

  const pageIds = [];

  for (const image of images) {
    const imageId = addObject(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${image.data.length} >>`,
      image.data,
    );

    const content = `q\n${image.width} 0 0 ${image.height} 0 0 cm\n/Im0 Do\nQ\n`;
    const contentId = addObject(
      `<< /Length ${encoder.encode(content).length} >>`,
      encoder.encode(content),
    );

    const size = (sizes && sizes[pageIds.length]) || {
      width: image.width,
      height: image.height,
    };

    pageIds.push(
      addObject(
        `<< /Type /Page /Parent ${pagesId} 0 R ` +
          `/MediaBox [0 0 ${size.width} ${size.height}] ` +
          `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> ` +
          `/Contents ${contentId} 0 R >>`,
      ),
    );
  }

  objects[catalogId - 1].header = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1].header =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  const chunks = [];
  let length = 0;

  const push = (data) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  const offsets = [];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(length);
    const object = objects[index];
    push(`${index + 1} 0 obj\n${object.header}\n`);
    if (object.stream) {
      push("stream\n");
      push(object.stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  }

  const xrefOffset = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`,
  );

  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

if (typeof globalThis !== "undefined") {
  globalThis.LibreWolfPdf = { buildPdf };
}
