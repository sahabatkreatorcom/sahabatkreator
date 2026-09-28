import { describe, expect, it } from "vitest";
import { sanitizeBlogHtml } from "./blog-sanitizer";

describe("sanitizeBlogHtml — bypass XSS", () => {
  it("membuang <script> beserta isinya", () => {
    expect(sanitizeBlogHtml("<p>hai</p><script>alert(1)</script><p>ya</p>")).toBe(
      "<p>hai</p><p>ya</p>",
    );
  });

  it("membuang event handler on*", () => {
    expect(sanitizeBlogHtml('<img src="x" onerror="alert(1)">')).toBe('<img src="x" />');
    expect(sanitizeBlogHtml('<div onclick="evil()">x</div>')).toBe("<div>x</div>");
  });

  it("menolak skema javascript: pada href", () => {
    expect(sanitizeBlogHtml('<a href="javascript:alert(1)">klik</a>')).toBe("<a>klik</a>");
  });

  it("menolak entity-encoded javascript:", () => {
    expect(sanitizeBlogHtml('<a href="&#106;avascript:alert(1)">klik</a>')).toBe("<a>klik</a>");
    expect(sanitizeBlogHtml('<a href="&#x6A;avascript:alert(1)">klik</a>')).toBe("<a>klik</a>");
  });

  it("menolak tab/NUL yang disisipkan di dalam URL", () => {
    expect(sanitizeBlogHtml('<a href="java\tscript:alert(1)">klik</a>')).toBe("<a>klik</a>");
    expect(sanitizeBlogHtml('<a href="jav&#x09;ascript:alert(1)">klik</a>')).toBe("<a>klik</a>");
  });

  it("menolak tag yang tidak ada di allowlist", () => {
    expect(sanitizeBlogHtml('<iframe src="https://evil"></iframe>')).toBe("");
    expect(sanitizeBlogHtml('<svg onload="alert(1)"></svg>')).toBe("");
    expect(sanitizeBlogHtml('<form action="https://evil"><input name="x"></form>')).toBe("");
  });

  it("membuang komentar HTML", () => {
    expect(sanitizeBlogHtml("<p>a</p><!-- <script>alert(1)</script> --><p>b</p>")).toBe(
      "<p>a</p><p>b</p>",
    );
  });

  it("membuang <style> dan CSS berbahaya", () => {
    expect(sanitizeBlogHtml("<style>body{}</style><p>x</p>")).toBe("<p>x</p>");
    expect(sanitizeBlogHtml('<div style="background:url(javascript:alert(1))">x</div>')).toBe(
      "<div>x</div>",
    );
    expect(sanitizeBlogHtml('<div style="width:expression(alert(1))">x</div>')).toBe(
      "<div>x</div>",
    );
  });

  it("escape teks literal < yang bukan tag", () => {
    expect(sanitizeBlogHtml("5 < 6 dan 7 > 4")).toBe("5 &lt; 6 dan 7 &gt; 4");
    expect(sanitizeBlogHtml("a < b c")).toBe("a &lt; b c");
  });

  it("tidak crash pada input tidak tertutup", () => {
    expect(sanitizeBlogHtml("<p>teks")).toBe("<p>teks");
    expect(sanitizeBlogHtml("<p>teks<span>bold")).toBe("<p>teks<span>bold");
  });

  it("menangani atribut tanpa nilai dan tanpa kutipan", () => {
    expect(sanitizeBlogHtml("<a href=https://sahabatkreator.com target=_blank>link</a>")).toBe(
      '<a href="https://sahabatkreator.com" target="_blank" rel="noopener noreferrer">link</a>',
    );
  });

  it("mempertahankan atribut yang aman", () => {
    expect(
      sanitizeBlogHtml(
        '<img src="https://cdn.example.com/a.png" alt="A" width="100" loading="lazy">',
      ),
    ).toBe('<img src="https://cdn.example.com/a.png" alt="A" width="100" loading="lazy" />');
    expect(sanitizeBlogHtml('<p class="prose-lg">x</p>')).toBe('<p class="prose-lg">x</p>');
    expect(sanitizeBlogHtml('<ol start="3"><li>a</li></ol>')).toBe('<ol start="3"><li>a</li></ol>');
  });

  it("menambah rel=noopener untuk target=_blank", () => {
    expect(sanitizeBlogHtml('<a href="https://x.com" target="_blank">x</a>')).toContain(
      'rel="noopener noreferrer"',
    );
  });

  it("membiarkan URL relatif dan anchor", () => {
    expect(sanitizeBlogHtml('<a href="/blog/apa-itu">x</a>')).toBe('<a href="/blog/apa-itu">x</a>');
    expect(sanitizeBlogHtml('<a href="#section">x</a>')).toBe('<a href="#section">x</a>');
  });

  it("mempertahankan struktur tabel dan list", () => {
    expect(
      sanitizeBlogHtml(
        "<ul><li><strong>tebal</strong> + <em>miring</em></li></ul><table><tr><td>sel</td></tr></table>",
      ),
    ).toBe(
      "<ul><li><strong>tebal</strong> + <em>miring</em></li></ul><table><tr><td>sel</td></tr></table>",
    );
  });

  it("menolak data: URI pada gambar", () => {
    expect(sanitizeBlogHtml('<img src="data:image/svg+xml;base64,PHN2Zy8+">')).toBe("<img />");
  });

  it("escape & di teks", () => {
    expect(sanitizeBlogHtml("<p>A & B</p>")).toBe("<p>A &amp; B</p>");
  });

  it("membuang atribut di luar allowlist per tag", () => {
    expect(sanitizeBlogHtml('<a href="/x" src="/y">x</a>')).toBe('<a href="/x">x</a>');
  });

  it("menerima input non-string dengan aman (fail-closed)", () => {
    // @ts-expect-error -- sengaja salah tipe untuk cek fail-closed
    expect(sanitizeBlogHtml(undefined)).toBe("");
    // @ts-expect-error
    expect(sanitizeBlogHtml(null)).toBe("");
  });

  it("menolak konten lebih besar dari 500rb karakter (DoS guard)", () => {
    expect(() => sanitizeBlogHtml("<p>".repeat(300_000))).toThrow(/500.000/);
  });
});
