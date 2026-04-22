import { PLANS, withinLimit } from "../plans";
import { describe, it, expect } from "vitest";

describe("PLANS config", () => {
  it("free plan has project limit of 1", () => {
    expect(PLANS.free.projects).toBe(1);
  });

  it("max plan has Infinity projects", () => {
    expect(PLANS.max.projects).toBe(Infinity);
  });

  it("pro plan price is $29", () => {
    expect(PLANS.pro.monthlyPriceUsd).toBe(29);
  });
});

describe("withinLimit", () => {
  it("returns true when under limit", () => {
    expect(withinLimit(0, 1)).toBe(true);
  });

  it("returns false when at limit", () => {
    expect(withinLimit(1, 1)).toBe(false);
  });

  it("returns true for Infinity limit", () => {
    expect(withinLimit(99999, Infinity)).toBe(true);
  });
});
