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
    photos: function () {
      // Sveltia flattens arrays of objects in its draft store. Read the assembled
      // entry data when available, since the custom field value can be [] even
      // while photos.0.image and photos.0.caption exist in that store.
      const entry = this.props.entry;
      if (entry && typeof entry.getIn === "function") {
        const photos = entry.getIn(["data", "photos"]);
        if (photos !== undefined) return asPhotos(photos);
      }
      return asPhotos(this.props.value);
    },
    getInitialState: function () { return { busy: false, message: "", error: "" }; },
    changePhotos: function (photos) {
      this.props.onChange(photos);
    },
    isValid: function () {
      if (this.state.busy) return { error: { message: "Wait for the photos to finish preparing." } };
      // Empty sections are valid: removing the final photo must be saveable.
      // The public photography index hides sections without a cover photo.
      return true;
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
      const photos = this.photos().concat(added);
      this.setState({
        busy: false,
        message: added.length + " photo(s) added. Save the section to publish.",
        error: failed.join("\n")
      }, () => {
        // The CMS caches validation on draft changes, not React state changes.
        // Clear busy before notifying it, including when every upload failed.
        this.changePhotos(photos);
      });
    },
    choose: async function () {
      if (this.state.busy) return;
      this.setState({ busy: true, error: "", message: "" });
      let photos = this.photos();
      try {
        const picked = await this.props.pickFile({ kind: "image", accept, multiple: true, allowURL: false });
        if (picked) {
          const added = (Array.isArray(picked) ? picked : [picked]).map(file => ({ image: file.value, caption: "" }));
          photos = photos.concat(added);
          this.setState({ message: added.length + " photo(s) added. Save the section to publish." });
        }
      } catch (error) {
        this.setState({ error: error.message || "Could not select photos." });
      } finally {
        this.setState({ busy: false }, () => this.changePhotos(photos));
      }
    },
    caption: function (index, caption) {
      this.changePhotos(this.photos().map((photo, i) => i === index ? { ...photo, caption } : photo));
    },
    move: function (index, direction) {
      const photos = this.photos().slice(), target = index + direction;
      if (target < 0 || target >= photos.length) return;
      [photos[index], photos[target]] = [photos[target], photos[index]];
      this.changePhotos(photos);
    },
    remove: function (index) {
      this.changePhotos(this.photos().filter((photo, i) => i !== index));
      this.setState({ message: "Photo removed from this section. Save to update the website. The uploaded file is still in Assets." });
    },
    removeAll: function () {
      if (!window.confirm("Remove all photos from this section? Save afterwards to update the website. Uploaded files will remain in Assets.")) return;
      this.changePhotos([]);
      this.setState({ message: "All photos removed from this section. Save to update the website." });
    },
    render: function () {
      const photos = this.photos(), busy = this.state.busy;
      return h("div", { "aria-busy": busy },
        !window.PHOTO_R2_CONFIG && h("label", { htmlFor: this.props.forID, style: { display: "block", marginBottom: "8px", fontWeight: 600 } }, "Upload photos"),
        !window.PHOTO_R2_CONFIG && h("input", { id: this.props.forID, type: "file", multiple: true, accept, disabled: busy, onChange: this.upload,
          style: { display: "block", maxWidth: "100%", marginBottom: "12px" } }),
        h("button", { type: "button", disabled: busy, onClick: this.choose, style: buttonStyle }, window.PHOTO_R2_CONFIG ? "Upload or choose R2 photos" : "Choose existing photos"),
        h("p", null, h("a", { href: "#/assets", target: "_blank", rel: "noopener" }, "Manage / delete uploaded assets")),
        h("p", { style: { fontSize: "14px" } }, "To delete an uploaded file, first remove it from every section and save. Then select it in Assets and choose Delete. The asset library opens in a new tab."),
        photos.length > 0 && h("button", { type: "button", disabled: busy, onClick: this.removeAll, style: buttonStyle }, "Remove all photos from section"),
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
              onClick: () => this.remove(index), "aria-label": "Remove photo " + (index + 1) }, "Remove from section")
          )))
        )
      );
    }
  });
  window.CMS.registerFieldType("photo-gallery", PhotoGallery);
})();
