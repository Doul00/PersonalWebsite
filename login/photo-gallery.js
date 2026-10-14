/* Batch photo editor. Keep originals for gallery pages and derive compact,
 * uncropped WebP covers for the photography index.
 */
(function () {
  "use strict";
  const h = window.h;
  const accept = "image/jpeg,image/png,image/webp,image/avif";
  const maxFileSize = 15728640;
  const coverWidth = 1200;
  const coverQuality = 0.82;
  const buttonStyle = { padding: "10px 12px", minHeight: "44px", cursor: "pointer" };
  const asPhotos = value => {
    const photos = value && typeof value.toJS === "function" ? value.toJS() : value;
    return Array.isArray(photos) ? photos : [];
  };
  const fileName = (file, value) => file.name || decodeURIComponent(String(value || "image").split(/[?#]/)[0].split("/").pop());
  const coverName = (file, value) => fileName(file, value).replace(/\.[^.]+$/, "") + "-cover.webp";

  const createCover = async file => {
    const bitmap = await createImageBitmap(file);
    try {
      const width = Math.min(coverWidth, bitmap.width);
      const height = Math.round(bitmap.height * width / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", coverQuality));
      if (!blob) throw new Error("This browser could not create the WebP cover.");
      return blob;
    } finally {
      if (typeof bitmap.close === "function") bitmap.close();
    }
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
    imageBytes: async function (original, file) {
      if (file) return file;
      const asset = this.props.getAsset && this.props.getAsset(original);
      // For cloud assets, prefer the durable public URL stored in the entry.
      // getAsset() can return a temporary/revoked blob URL used by the preview.
      const source = typeof original === "string" && /^https?:\/\//i.test(original)
        ? original
        : asset && asset.url ? asset.url : original;
      let response;
      try {
        response = await fetch(source, { mode: "cors", cache: "no-store", credentials: "omit" });
      } catch (error) {
        const origin = window.location && window.location.origin ? window.location.origin : "this editor";
        throw new Error("Could not download " + source + " from " + origin + ". " + (error.message || "The browser blocked the request."));
      }
      if (!response.ok) throw new Error("Could not download this image from storage (HTTP " + response.status + ").");
      return response.blob();
    },
    addPhoto: async function (original, file) {
      const bytes = await this.imageBytes(original, file);
      const coverBlob = await createCover(bytes);
      const thumbnail = await this.props.addFile(coverBlob, { name: coverName(bytes, original) });
      return { image: original, thumbnail, caption: "" };
    },
    upload: async function (event) {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (!files.length || this.state.busy) return;
      this.setState({ busy: true, message: "Preparing photos and optimized covers…", error: "" });
      const added = [], failed = [];
      // Process sequentially to avoid decoding many large photos at once on phones.
      for (const file of files) {
        try {
          if (!accept.split(",").includes(file.type)) throw new Error("Use JPEG, PNG, WebP or AVIF.");
          if (file.size > maxFileSize) throw new Error("The maximum size is 15 MB per photo.");
          const image = await this.props.addFile(file);
          added.push(await this.addPhoto(image, file));
        } catch (error) {
          failed.push(file.name + ": " + (error.message || "Could not add this photo."));
        }
      }
      const photos = this.photos().concat(added);
      this.setState({
        busy: false,
        message: added.length + " photo(s) added with optimized covers. Save the section to publish.",
        error: failed.join("\n")
      }, () => {
        // The CMS caches validation on draft changes, not React state changes.
        // Clear busy before notifying it, including when every upload failed.
        this.changePhotos(photos);
      });
    },
    choose: async function () {
      if (this.state.busy) return;
      this.setState({ busy: true, error: "", message: "Preparing photos and optimized covers…" });
      let photos = this.photos();
      const failed = [];
      try {
        const picked = await this.props.pickFile({ kind: "image", accept, multiple: true, allowURL: false });
        if (picked) {
          const selected = Array.isArray(picked) ? picked : [picked];
          const added = [];
          for (const item of selected) {
            try {
              added.push(await this.addPhoto(item.value, item.file));
            } catch (error) {
              failed.push(fileName(item.file || {}, item.value) + ": " + (error.message || "Could not prepare this photo."));
            }
          }
          photos = photos.concat(added);
          this.setState({ message: added.length + " photo(s) added with optimized covers. Save the section to publish." });
        }
      } catch (error) {
        failed.push(error.message || "Could not select photos.");
      } finally {
        this.setState({ busy: false, error: failed.join("\n") }, () => this.changePhotos(photos));
      }
    },
    optimizeCover: async function () {
      if (this.state.busy) return;
      const photos = this.photos();
      const cover = photos[0];
      if (!cover || !cover.image) return;
      this.setState({ busy: true, message: "Generating optimized cover…", error: "" });
      try {
        const asset = this.props.getAsset && this.props.getAsset(cover.image);
        const response = await fetch(asset && asset.url ? asset.url : cover.image, { mode: "cors" });
        if (!response.ok) throw new Error("Could not download the current cover (HTTP " + response.status + ").");
        const file = await response.blob();
        const thumbnail = await this.props.addFile(await createCover(file), { name: coverName(file, cover.image) });
        photos[0] = { ...cover, thumbnail };
        this.setState({ busy: false, message: "Optimized cover generated. Save the section to publish." }, () => this.changePhotos(photos));
      } catch (error) {
        this.setState({ busy: false, error: error.message || "Could not generate the optimized cover.", message: "" }, () => this.changePhotos(photos));
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
      this.setState({ message: "Photo removed from this section. Save to update the website. The uploaded files are still in Assets." });
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
        photos.length > 0 && h("button", { type: "button", disabled: busy, onClick: this.optimizeCover,
          style: { ...buttonStyle, marginLeft: "8px" } }, photos[0].thumbnail ? "Regenerate cover thumbnail" : "Generate cover thumbnail"),
        h("p", { style: { fontSize: "14px" } }, "New uploads keep the full original and generate an uncropped WebP cover up to 1200 px wide. Existing covers can be regenerated at any time."),
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
          h("img", { src: photo.thumbnail || photo.image, alt: photo.caption || "Photo " + (index + 1), loading: "lazy",
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
