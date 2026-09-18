# Personal website

Jekyll website hosted on GitHub Pages at https://abdoulazizamadou.com.

- `/`: landing page.
- `/research/`: existing research content.
- `/photo/`: photography sections, empty until content is published.
- `/photo/<section-slug>/`: full-width, uncropped photos in the chosen order.

## Add photography content

1. In **Photography sections**, create a **Section**. Enter its name and display order, then use **Upload photos** to select multiple photos at once, or **Choose existing photos** to select from the asset library. Each photo has an optional caption; no description is required.
2. Use **Move up** and **Move down** to arrange photos. The first photo automatically becomes the cover. Removing a photo here removes it from the section, not from the asset library.
3. Save/publish the section. GitHub Pages rebuilds the website; allow a short delay before the public page updates.

## Maintenance

Sections are Markdown files with YAML front matter in `_photo_sections/`; photos are stored in `assets/photos/`. Jekyll builds a real static page for each section, so direct links and refreshes work.

Upload JPEG, PNG, WebP or AVIF images up to 15 MB. Covers use 4:3 thumbnails; the gallery preserves original proportions at full page width. Web-sized images are preferable to original scans.

Sveltia CMS is pinned to 0.213.4. Update script and schema versions together after testing.
