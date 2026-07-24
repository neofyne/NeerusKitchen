import { useLayoutEffect } from "react";

export function autoGrow(element: HTMLTextAreaElement) {
  // iOS Safari measures scrollHeight inside the borders. Add them back and
  // make the inline height authoritative so no form-specific height clips it.
  element.style.setProperty("height", "auto", "important");
  const styles = window.getComputedStyle(element);
  const borderHeight = (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
  const nextHeight = Math.ceil(element.scrollHeight + borderHeight);
  element.style.setProperty("height", `${nextHeight}px`, "important");
}

export function useAutoGrowingTextareas() {
  useLayoutEffect(() => {
    const resizeAll = () => {
      document.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(autoGrow);
    };
    const onInput = (event: Event) => {
      if (event.target instanceof HTMLTextAreaElement) autoGrow(event.target);
    };
    resizeAll();
    void document.fonts?.ready.then(resizeAll);
    document.addEventListener("input", onInput);
    window.addEventListener("resize", resizeAll);
    const observer = new MutationObserver(resizeAll);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("input", onInput);
      window.removeEventListener("resize", resizeAll);
      observer.disconnect();
    };
  }, []);
}
