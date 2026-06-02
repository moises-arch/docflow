"use client";

import { AppProgressBar } from "next-nprogress-bar";

export function ProgressBar() {
  return (
    <AppProgressBar
      height="2px"
      color="#1a1a1a"
      options={{ showSpinner: false, trickleSpeed: 200 }}
      shallowRouting
    />
  );
}
