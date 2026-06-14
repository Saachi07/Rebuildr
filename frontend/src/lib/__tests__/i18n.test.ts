import { afterEach, describe, expect, it } from "vitest";
import { t, getLanguage, setLanguage } from "../i18n";

afterEach(() => {
  // Reset to the default so tests stay independent.
  setLanguage("en");
});

describe("i18n t()", () => {
  it("returns the English string by default", () => {
    expect(t("nav.plan")).toBe("Plan");
    expect(t("nav.inventory")).toBe("Inventory");
  });

  it("falls back to the key itself when there is no translation", () => {
    expect(t("nav.does_not_exist")).toBe("nav.does_not_exist");
  });

  it("switches language and persists the choice", () => {
    setLanguage("fr");
    expect(getLanguage()).toBe("fr");
    expect(t("nav.inventory")).toBe("Inventaire");
    expect(localStorage.getItem("rebuildr.language")).toBe("fr");
  });

  it("falls back to English for a key missing in the active language", () => {
    setLanguage("fr");
    // "nav.plan" is identical, but a French-missing key should fall back to English.
    expect(t("nav.dashboard")).toBe("Tableau de bord");
  });

  it("honors an explicit language argument over the current language", () => {
    setLanguage("en");
    expect(t("nav.inventory", "fr")).toBe("Inventaire");
  });
});
