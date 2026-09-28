// Sanitizer HTML untuk konten blog yang ditulis lewat contentEditable admin.
//
// Mengapa: `blog_post.content_html` dirender dengan `dangerouslySetInnerHTML`
// di blog-post.tsx. Tanpa sanitasi di sisi server, akun admin yang dibajak
// (atau token yang bocor) bisa menanam <script>/on* handler dan menjalankan
// JS di browser setiap pembaca. Karena output editor adalah HTML mentah bebas
// (bukan markdown yang diparse), satu-satunya tempat memfilternya adalah
// tepat sebelum tulis ke DB — ini fail-closed: apa yang tidak ada di
// allowlist tidak akan pernah tersimpan.
//
// Implementasi tokenizer state-machine (bukan regex) supaya nilai atribut
// yang berisi `>`/spasi dan entity encoding (`&#x6A;avascript:`) tidak bisa
// menipu parser. Lihat blog-sanitizer.test.ts untuk pola bypass yang dicakup.

const TEXT_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

/** Tag yang boleh ada di konten blog. */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "span",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "u",
  "s",
  "del",
  "ins",
  "sub",
  "sup",
  "mark",
  "small",
  "abbr",
  "blockquote",
  "q",
  "cite",
  "pre",
  "code",
  "kbd",
  "samp",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "a",
  "img",
  "figure",
  "figcaption",
  "table",
  "caption",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "details",
  "summary",
]);

/** Atribut yang diperbolehkan, per tag. */
const ALLOWED_ATTRS: Record<string, readonly string[]> = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
  td: ["colspan", "rowspan", "align"],
  th: ["colspan", "rowspan", "align", "scope"],
  ol: ["start", "reversed", "type"],
  li: ["value"],
  code: ["class"],
  pre: ["class"],
  span: ["class", "style"],
  div: ["class", "style"],
  p: ["class", "style"],
  h1: ["class", "style"],
  h2: ["class", "style"],
  h3: ["class", "style"],
  h4: ["class", "style"],
  h5: ["class", "style"],
  h6: ["class", "style"],
  blockquote: ["cite", "class", "style"],
  figure: ["class", "style"],
  figcaption: ["class", "style"],
  details: ["open"],
  abbr: ["title"],
  q: ["cite"],
};

/** Skema URL yang dianggap aman untuk href/src/cite. */
const SAFE_URL_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Named entity yang umum (numeric decode ditangani terpisah). */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  tab: "\t",
  newline: "\n",
  colon: ":",
  sol: "/",
  semi: ";",
};

/**
 * Buang karakter kontrol. Browser sendiri membuang TAB/CR/LF (dan NUL) di
 * dalam URL sebelum parse — kalau tidak kita buang juga di sini, payload
 * `java<TAB>script:` lolos cek skema.
 */
function stripControlChars(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code > 0x1f && code !== 0x7f) out += char;
  }
  return out;
}
const STYLE_DANGER =
  /expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding|url\s*\(/i;
const VOID_TAGS = new Set(["br", "hr", "img"]);
const TAG_NAME = /^[a-zA-Z]$/;

/** Decode karakter reference (&amp; &#65; &#x41;) — browser melakukan ini juga. */
function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, name) => {
    const lower = String(name).toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isSafeInteger(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isSafeInteger(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[lower] ?? match;
  });
}

/**
 * Validasi URL. Browser membuang TAB/CR/LF di dalam URL, jadi kita juga harus
 * membuangnya sebelum cek skema, jika tidak `java&#9;script:` lolos.
 */
function isSafeUrl(raw: string): boolean {
  const cleaned = stripControlChars(decodeEntities(raw)).trim().toLowerCase();
  if (cleaned === "") return true; // atribut kosong, biarkan
  if (cleaned.startsWith("#") || cleaned.startsWith("/") || cleaned.startsWith("?")) return true;
  try {
    const url = new URL(cleaned);
    return SAFE_URL_SCHEMES.has(url.protocol);
  } catch {
    // Bukan URL absolut (mis. "foo.html") — relatif terhadap halaman, aman.
    return !/^[a-z][a-z0-9+.-]*:/i.test(cleaned);
  }
}

function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (char) => TEXT_ESCAPE[char] ?? char);
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface ParsedTag {
  name: string;
  isClosing: boolean;
  attrs: Array<{ name: string; value: string }>;
  /** true jika tag beserta isinya tidak boleh dirender (script, iframe, ...) */
  dropped: boolean;
}

const NEVER_ALLOWED = new Set([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "noframes",
  "object",
  "embed",
  "applet",
  "param",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "select",
  "option",
  "textarea",
  "label",
  "fieldset",
  "legend",
  "svg",
  "math",
  "noscript",
  "template",
  "portal",
  "dialog",
  "audio",
  "video",
  "source",
  "track",
  "canvas",
  "map",
  "area",
  "marquee",
  "bgsound",
]);

function parseTag(html: string, start: number): { tag: ParsedTag | null; next: number } {
  let pos = start;
  const isClosing = html[pos] === "/";
  if (isClosing) pos += 1;

  let name = "";
  while (pos < html.length && /[a-zA-Z0-9]/.test(html[pos] as string)) {
    name += html[pos++];
  }
  name = name.toLowerCase();

  // Komentar <!-- -->, <!doctype>, <![CDATA[ ... : buang seluruhnya.
  if (!name && html[start] === "!") {
    const isComment = html.startsWith("<!--", start - 1);
    const end = isComment ? html.indexOf("-->", start) : html.indexOf(">", start);
    return { tag: null, next: end === -1 ? html.length : end + (isComment ? 3 : 1) };
  }
  // <?xml ... ?> : buang.
  if (!name && html[start] === "?") {
    const end = html.indexOf(">", start);
    return { tag: null, next: end === -1 ? html.length : end + 1 };
  }
  if (!name) return { tag: null, next: start }; // bukan tag valid, biarkan caller escape

  const attrs: ParsedTag["attrs"] = [];

  while (pos < html.length) {
    while (pos < html.length && /\s/.test(html[pos] as string)) pos++;
    if (pos >= html.length) break;

    if (html[pos] === ">") {
      pos++;
      break;
    }
    if (html[pos] === "/" && html[pos + 1] === ">") {
      pos += 2;
      break;
    }

    let attrName = "";
    while (pos < html.length && /[a-zA-Z0-9_:.-]/.test(html[pos] as string)) {
      attrName += html[pos++];
    }
    attrName = attrName.toLowerCase();
    if (!attrName) {
      pos++;
      continue;
    } // karakter aneh, skip

    let attrValue = "";
    if (html[pos] === "=") {
      pos++;
      while (pos < html.length && /\s/.test(html[pos] as string)) pos++;
      const quote = html[pos];
      if (quote === '"' || quote === "'") {
        pos++;
        const endQuote = html.indexOf(quote, pos);
        if (endQuote === -1) {
          attrValue = html.slice(pos);
          pos = html.length;
        } else {
          attrValue = html.slice(pos, endQuote);
          pos = endQuote + 1;
        }
      } else {
        const valueStart = pos;
        while (pos < html.length && !/[\s>]/.test(html[pos] as string)) pos++;
        attrValue = html.slice(valueStart, pos);
        // Jangan break di sini: iterasi loop berikutnya menemui pengecekan
        // ">" di atas dan menutup tag — break di sini malah melewatkan push
        // atribut ini.
      }
    }

    if (attrName.startsWith("on")) continue; // on* event handler
    if (attrName === "srcdoc") continue; // iframe escape hatch

    const allowed = ALLOWED_ATTRS[name];
    // allowed undefined = tag tidak punya allowlist atribut sama sekali.
    if (!allowed?.includes(attrName)) continue;

    if (attrName === "href" || attrName === "src" || attrName === "cite" || attrName === "action") {
      if (!isSafeUrl(attrValue)) continue;
    }
    if (attrName === "style") {
      if (STYLE_DANGER.test(decodeEntities(attrValue))) continue;
    }
    if (attrName === "class") {
      // Kelas hanya dipakai untuk styling editor; buang karakter yang bisa
      // keluar dari konteks atribut.
      if (!/^[a-zA-Z0-9_-]*$/.test(decodeEntities(attrValue).trim())) continue;
    }
    if (attrName === "target") {
      const val = decodeEntities(attrValue).trim().toLowerCase();
      if (val !== "_blank" && val !== "_self" && val !== "_top") continue;
    }

    attrs.push({ name: attrName, value: decodeEntities(attrValue) });
  }

  return {
    tag: { name, isClosing, attrs, dropped: NEVER_ALLOWED.has(name) },
    next: pos,
  };
}

/** Sanitasi HTML mentah menjadi subset aman untuk dirender. */
export function sanitizeBlogHtml(html: string): string {
  if (typeof html !== "string") return "";
  if (html.length > 500_000) {
    throw new Error("Konten artikel melebihi 500.000 karakter.");
  }

  let out = "";
  let pos = 0;

  while (pos < html.length) {
    const lt = html.indexOf("<", pos);
    if (lt === -1) {
      out += escapeText(html.slice(pos));
      break;
    }
    if (lt > pos) out += escapeText(html.slice(pos, lt));

    const after = html[lt + 1];
    if (after !== "/" && after !== "!" && after !== "?" && !TAG_NAME.test(after ?? "")) {
      // "<" yang tidak diikuti nama tag adalah teks literal (mis. "5 < 6").
      out += "&lt;";
      pos = lt + 1;
      continue;
    }

    const parsed = parseTag(html, lt + 1);
    if (!parsed.tag) {
      if (parsed.next <= lt + 1) {
        out += "&lt;";
        pos = lt + 1;
      } else {
        pos = parsed.next;
      }
      continue;
    }

    pos = parsed.next;
    const { name, isClosing, attrs, dropped } = parsed.tag;
    if (dropped) {
      // script/style/form dkk: buang juga isi sampai closing tag-nya, jika
      // tidak body <script>alert(1)</script> malah muncul sebagai teks.
      // Hanya untuk opening tag — closing tag tidak ada isi untuk dibuang.
      if (!isClosing) {
        const closeIdx = html.indexOf(`</${name}`, pos);
        pos = closeIdx === -1 ? html.length : closeIdx;
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(name)) continue;
    if (isClosing) {
      out += `</${name}>`;
      continue;
    }

    let rendered = `<${name}`;
    let hasTarget = false;
    for (const attr of attrs) {
      if (attr.name === "target") hasTarget = true;
      rendered += ` ${attr.name}="${escapeAttr(attr.value)}"`;
    }
    if (name === "a" && hasTarget) {
      // _blank tanpa noopener = leak referer + tabnabbing balik.
      rendered += ' rel="noopener noreferrer"';
    }
    if (VOID_TAGS.has(name)) rendered += " /";
    out += `${rendered}>`;
  }

  return out;
}
