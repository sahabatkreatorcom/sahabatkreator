// PasswordInput — tombol "lihat password" harus benar-benar mengganti tipe
// input (bukan cuma mengganti ikon), dan TIDAK boleh mengirim form saat diklik
// (kalau `type="button"` hilang, klik mata akan men-submit form reset password).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordInput } from "./password-input";

afterEach(cleanup);

describe("PasswordInput", () => {
  it("menyembunyikan password secara default", () => {
    render(<PasswordInput aria-label="Password" defaultValue="rahasia" />);
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
  });

  it("klik tombol mata menampilkan password, klik lagi menyembunyikan", () => {
    render(<PasswordInput aria-label="Password" defaultValue="rahasia" />);
    const input = screen.getByLabelText("Password");

    fireEvent.click(screen.getByRole("button", { name: "Tampilkan password" }));
    expect(input.getAttribute("type")).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Sembunyikan password" }));
    expect(input.getAttribute("type")).toBe("password");
  });

  it("menandai status tombol lewat aria-pressed", () => {
    render(<PasswordInput aria-label="Password" />);
    const button = screen.getByRole("button", { name: "Tampilkan password" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(
      screen.getByRole("button", { name: "Sembunyikan password" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("tidak men-submit form saat tombol mata diklik", () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput aria-label="Password" />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tampilkan password" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("meneruskan props ke elemen input", () => {
    render(
      <PasswordInput
        aria-label="Konfirmasi password"
        id="confirm"
        autoComplete="new-password"
        placeholder="Ulangi password"
        required
      />,
    );
    const input = screen.getByLabelText("Konfirmasi password");
    expect(input.getAttribute("id")).toBe("confirm");
    expect(input.getAttribute("autocomplete")).toBe("new-password");
    expect(input.getAttribute("placeholder")).toBe("Ulangi password");
    expect(input.hasAttribute("required")).toBe(true);
  });
});
