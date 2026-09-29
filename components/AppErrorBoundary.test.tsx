import React, { Suspense, lazy } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows a reload action instead of a blank screen after a lazy page fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const BrokenPage = lazy(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
  const reload = vi.fn();
  render(
    <AppErrorBoundary reload={reload}>
      <Suspense fallback={<p>Loading</p>}><BrokenPage /></Suspense>
    </AppErrorBoundary>,
  );
  const button = await screen.findByRole("button", { name: "Reload app" });
  expect(screen.getByRole("alert")).toHaveTextContent("This page couldn't load");
  fireEvent.click(button);
  expect(reload).toHaveBeenCalledOnce();
});

it("renders working pages normally", () => {
  render(<AppErrorBoundary><h1>Records</h1></AppErrorBoundary>);
  expect(screen.getByRole("heading", { name: "Records" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});
