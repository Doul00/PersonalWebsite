(function () {
  "use strict";

  const dialog = document.getElementById("photo-lightbox");
  if (!dialog) return;

  const viewport = dialog.querySelector(".photo-lightbox-viewport");
  const image = dialog.querySelector(".photo-lightbox-image");
  const caption = dialog.querySelector(".photo-lightbox-caption");
  const zoomOutput = dialog.querySelector("[data-zoom-output]");
  const zoomIn = dialog.querySelector("[data-zoom-in]");
  const zoomOut = dialog.querySelector("[data-zoom-out]");
  const zoomReset = dialog.querySelector("[data-zoom-reset]");
  const closeButton = dialog.querySelector("[data-lightbox-close]");
  const triggers = document.querySelectorAll("[data-lightbox-src]");
  let zoom = 1;
  let fitScale = 1;

  const centreImage = function () {
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
  };

  const renderZoom = function () {
    if (!image.naturalWidth) return;
    image.style.width = Math.round(image.naturalWidth * fitScale * zoom) + "px";
    image.style.height = "auto";
    zoomOutput.value = Math.round(zoom * 100) + "%";
    zoomOutput.textContent = zoomOutput.value;
    zoomOut.disabled = zoom <= 1;
    zoomIn.disabled = zoom >= 4;
    image.classList.toggle("is-zoomed", zoom > 1);
    requestAnimationFrame(centreImage);
  };

  const fitImage = function () {
    if (!image.naturalWidth || !image.naturalHeight) return;
    const availableWidth = Math.max(1, viewport.clientWidth - 48);
    const availableHeight = Math.max(1, viewport.clientHeight - 48);
    fitScale = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight, 1);
    renderZoom();
  };

  const setZoom = function (value) {
    zoom = Math.min(4, Math.max(1, value));
    renderZoom();
  };

  const close = function () {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  triggers.forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      const preview = trigger.querySelector("img");
      zoom = 1;
      image.alt = preview ? preview.alt : "";
      image.src = trigger.dataset.lightboxSrc;
      const text = trigger.dataset.lightboxCaption || "";
      caption.textContent = text;
      caption.hidden = !text;
      document.body.classList.add("lightbox-open");
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      if (image.complete) fitImage();
      closeButton.focus();
    });
  });

  image.addEventListener("load", fitImage);
  image.addEventListener("click", function () { setZoom(zoom === 1 ? 2 : 1); });
  zoomIn.addEventListener("click", function () { setZoom(zoom + 0.5); });
  zoomOut.addEventListener("click", function () { setZoom(zoom - 0.5); });
  zoomReset.addEventListener("click", function () { setZoom(1); });
  closeButton.addEventListener("click", close);

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("close", function () {
    document.body.classList.remove("lightbox-open");
    image.removeAttribute("src");
  });
  dialog.addEventListener("cancel", function () {
    document.body.classList.remove("lightbox-open");
  });
  dialog.addEventListener("keydown", function (event) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setZoom(zoom + 0.5);
    } else if (event.key === "-") {
      event.preventDefault();
      setZoom(zoom - 0.5);
    } else if (event.key === "0") {
      event.preventDefault();
      setZoom(1);
    }
  });
  viewport.addEventListener("wheel", function (event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? 0.5 : -0.5));
  }, { passive: false });
  window.addEventListener("resize", fitImage);
})();
