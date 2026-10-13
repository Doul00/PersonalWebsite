(function () {
  "use strict";

  const viewer = document.getElementById("photo-lightbox");
  if (!viewer) return;

  const viewport = viewer.querySelector(".photo-lightbox-viewport");
  const image = viewer.querySelector(".photo-lightbox-image");
  const closeButton = viewer.querySelector("[data-lightbox-close]");
  const triggers = document.querySelectorAll("[data-lightbox-src]");
  const pointers = new Map();
  let activeTrigger = null;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let startX = 0;
  let startY = 0;
  let startPanX = 0;
  let startPanY = 0;
  let startDistance = 0;
  let startScale = 1;

  const distance = function (first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  };

  const clampPan = function () {
    const maxX = Math.max(0, (image.offsetWidth * scale - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - viewport.clientHeight) / 2);
    panX = Math.min(maxX, Math.max(-maxX, panX));
    panY = Math.min(maxY, Math.max(-maxY, panY));
  };

  const render = function () {
    clampPan();
    image.style.transform = "translate(-50%, -50%) translate(" + panX + "px, " + panY + "px) scale(" + scale + ")";
  };

  const reset = function () {
    pointers.clear();
    scale = 1;
    panX = 0;
    panY = 0;
    render();
  };

  const open = function (trigger) {
    const preview = trigger.querySelector("img");
    activeTrigger = trigger;
    image.alt = preview ? preview.alt : "";
    image.src = trigger.dataset.lightboxSrc;
    viewer.hidden = false;
    viewer.setAttribute("aria-hidden", "false");
    document.body.classList.add("lightbox-open");
    reset();
    closeButton.focus();
  };

  const close = function () {
    viewer.hidden = true;
    viewer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lightbox-open");
    image.removeAttribute("src");
    reset();
    if (activeTrigger) activeTrigger.focus();
  };

  triggers.forEach(function (trigger) {
    trigger.addEventListener("click", function () { open(trigger); });
  });

  closeButton.addEventListener("click", close);
  document.addEventListener("keydown", function (event) {
    if (viewer.hidden) return;
    if (event.key === "Escape") close();
    else if (event.key === "Tab") {
      event.preventDefault();
      closeButton.focus();
    }
  });

  viewport.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      startX = event.clientX;
      startY = event.clientY;
      startPanX = panX;
      startPanY = panY;
    } else if (pointers.size === 2) {
      const points = Array.from(pointers.values());
      startDistance = distance(points[0], points[1]);
      startScale = scale;
    }
  });

  viewport.addEventListener("pointermove", function (event) {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const points = Array.from(pointers.values());
      scale = Math.min(5, Math.max(1, startScale * distance(points[0], points[1]) / startDistance));
      render();
    } else if (pointers.size === 1 && scale > 1) {
      panX = startPanX + event.clientX - startX;
      panY = startPanY + event.clientY - startY;
      render();
    }
  });

  const releasePointer = function (event) {
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      const remaining = Array.from(pointers.values())[0];
      startX = remaining.x;
      startY = remaining.y;
      startPanX = panX;
      startPanY = panY;
    } else if (pointers.size === 0 && scale <= 1.02) {
      scale = 1;
      panX = 0;
      panY = 0;
      render();
    }
  };

  viewport.addEventListener("pointerup", releasePointer);
  viewport.addEventListener("pointercancel", releasePointer);
  window.addEventListener("resize", render);
})();
