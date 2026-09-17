# Personal website

Jekyll website hosted on GitHub Pages at https://abdoulazizamadou.com.

- `/`: landing page.
- `/research/`: existing research content.
- `/photo/`: photography sections, empty until content is published.
- `/photo/<section-slug>/`: full-width, uncropped photos in the chosen order.
- `/login/`: Sveltia CMS sign-in and authenticated photography editor.

## Add photography content

1. Open https://github.com/settings/personal-access-tokens/new as the repository owner.
2. Create a fine-grained token with an expiration, **only** the `PersonalWebsite` repository, and **Contents: Read and write** permission. Metadata read access is included automatically.
3. Open https://abdoulazizamadou.com/login/ and choose **Sign In Using Access Token**. Paste it there, never into a chat or repository file.
4. In **Photography sections**, create a **Section**. Enter its name and display order, then add photos and image descriptions. Captions are optional.
5. Drag photos into the desired order. The first photo automatically becomes the cover.
6. Save/publish the section. GitHub Pages rebuilds the website; allow a short delay before the public page updates.

GitHub checks write permissions on every save. Sveltia remembers sign-in using browser local storage; use your own device and sign out on shared devices. Renew expired tokens through GitHub.

No separate server or password database is required. One-click GitHub OAuth sign-in can be added later with an external OAuth service.

## Maintenance

Sections are Markdown files with YAML front matter in `_photo_sections/`; photos are stored in `assets/photos/`. Jekyll builds a real static page for each section, so direct links and refreshes work.

Upload JPEG, PNG, WebP or AVIF images up to 15 MB. Covers use 4:3 thumbnails; the gallery preserves original proportions at full page width. Web-sized images are preferable to original scans.

Sveltia CMS is pinned to 0.213.4. Update script and schema versions together after testing. Never commit access tokens.
