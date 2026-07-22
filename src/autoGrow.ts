import { useLayoutEffect } from "react";

export function autoGrow(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
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
