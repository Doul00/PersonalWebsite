/* Batch photo editor. Keep the existing [{ image, caption }] content format.
 * Sveltia owns authentication, file validation, uploads and publication.
 */
(function () {
  "use strict";
  const h = window.h;
  const accept = "image/jpeg,image/png,image/webp,image/avif";
  const buttonStyle = { padding: "10px 12px", minHeight: "44px", cursor: "pointer" };
  const asPhotos = value => {
    const photos = value && typeof value.toJS === "function" ? value.toJS() : value;
    return Array.isArray(photos) ? photos : [];
  };

  const PhotoGallery = window.createClass({
    getInitialState: function () { return { busy: false, message: "", error: "" }; },
    isValid: function () {
      if (this.state.busy) return { error: { message: "Wait for the photos to finish preparing." } };
      return asPhotos(this.props.value).length > 0 || { error: { message: "Add at least one photo." } };
    },
    upload: async function (event) {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (!files.length || this.state.busy) return;
      this.setState({ busy: true, message: "Preparing photos…", error: "" });
      const added = [], failed = [];
      // Process sequentially to avoid decoding many large photos at once on phones.
      for (const file of files) {
        try {
          if (!accept.split(",").includes(file.type)) throw new Error("Use JPEG, PNG, WebP or AVIF.");
          if (file.size > 15728640) throw new Error("The maximum size is 15 MB per photo.");
          const image = await this.props.addFile(file);
          added.push({ image, caption: "" });
        } catch (error) {
          failed.push(file.name + ": " + (error.message || "Could not add this photo."));
        }
      }
      if (added.length) this.props.onChange(asPhotos(this.props.value).concat(added));
      this.setState({
        busy: false,
        message: added.length + " photo(s) added. Save the section to publish.",
        error: failed.join("\n")
      });
    },
    choose: async function () {
      if (this.state.busy) return;
      this.setState({ busy: true, error: "", message: "" });
      try {
        const picked = await this.props.pickFile({ kind: "image", accept, multiple: true, allowURL: false });
        if (picked) {
          const added = (Array.isArray(picked) ? picked : [picked]).map(file => ({ image: file.value, caption: "" }));
          this.props.onChange(asPhotos(this.props.value).concat(added));
          this.setState({ message: added.length + " photo(s) added. Save the section to publish." });
        }
      } catch (error) {
        this.setState({ error: error.message || "Could not select photos." });
      } finally {
        this.setState({ busy: false });
      }
    },
    caption: function (index, caption) {
      this.props.onChange(asPhotos(this.props.value).map((photo, i) => i === index ? { ...photo, caption } : photo));
    },
    move: function (index, direction) {
      const photos = asPhotos(this.props.value).slice(), target = index + direction;
      if (target < 0 || target >= photos.length) return;
      [photos[index], photos[target]] = [photos[target], photos[index]];
      this.props.onChange(photos);
    },
    remove: function (index) {
      this.props.onChange(asPhotos(this.props.value).filter((photo, i) => i !== index));
    },
    render: function () {
      const photos = asPhotos(this.props.value), busy = this.state.busy;
      return h("div", { "aria-busy": busy },
        h("label", { htmlFor: this.props.forID, style: { display: "block", marginBottom: "8px", fontWeight: 600 } }, "Upload photos"),
        h("input", { id: this.props.forID, type: "file", multiple: true, accept, disabled: busy, onChange: this.upload,
          style: { display: "block", maxWidth: "100%", marginBottom: "12px" } }),
        h("button", { type: "button", disabled: busy, onClick: this.choose, style: buttonStyle }, "Choose existing photos"),
        h("p", { role: "status", style: { fontSize: "14px" } }, this.state.message),
        this.state.error && h("p", { role: "alert", style: { color: "#bf3838", whiteSpace: "pre-wrap" } }, this.state.error),
        h("div", { style: { display: "grid", gap: "20px" } },
          photos.map((photo, index) => h("div", {
            key: photo.image + ":" + index,
            style: { border: "1px solid #999", borderRadius: "6px", padding: "12px", minWidth: 0 }
          },
          h("p", { style: { margin: "0 0 8px", fontWeight: 600 } }, index === 0 ? "Photo 1 · Section cover" : "Photo " + (index + 1)),
          h("img", { src: photo.image, alt: photo.caption || "Photo " + (index + 1), loading: "lazy",
            style: { display: "block", maxWidth: "100%", maxHeight: "220px", marginBottom: "12px" } }),
          h("label", { htmlFor: this.props.forID + "-caption-" + index }, "Caption (optional)"),
          h("input", { id: this.props.forID + "-caption-" + index, type: "text", value: photo.caption || "", disabled: busy,
            onChange: event => this.caption(index, event.target.value),
            style: { display: "block", boxSizing: "border-box", width: "100%", padding: "10px", margin: "6px 0 12px" } }),
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" } },
            h("button", { type: "button", style: buttonStyle, disabled: busy || index === 0,
              onClick: () => this.move(index, -1), "aria-label": "Move photo " + (index + 1) + " up" }, "Move up"),
            h("button", { type: "button", style: buttonStyle, disabled: busy || index === photos.length - 1,
              onClick: () => this.move(index, 1), "aria-label": "Move photo " + (index + 1) + " down" }, "Move down"),
            h("button", { type: "button", style: buttonStyle, disabled: busy,
              onClick: () => this.remove(index), "aria-label": "Remove photo " + (index + 1) }, "Remove")
          )))
        )
      );
    }
  });
  window.CMS.registerFieldType("photo-gallery", PhotoGallery);
})();
