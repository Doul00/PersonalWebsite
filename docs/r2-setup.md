# Connect the photography editor to R2

The pinned Sveltia CMS version has native Cloudflare R2 support for uploading,
selecting and deleting assets. No Worker is required for this owner-only editor.
The connection is deliberately inactive until the real bucket details are set.

## Cloudflare setup

1. In R2 Object Storage, create a dedicated bucket, for example
   `personalwebsite-photos`. Use the default jurisdiction unless you specifically
   require EU residency.
2. In the bucket Settings, connect a public custom domain, ideally
   `photos.abdoulazizamadou.com`. This requires the domain to be in the same
   Cloudflare account. If it is not, the public `r2.dev` URL can be used for a
   connection test; Cloudflare limits that endpoint and does not recommend it
   for production. The authenticated S3 API endpoint is not a public image URL.
3. In Settings > CORS Policy, paste the contents of `docs/r2-cors.json`.
   Add another exact website origin only if you actually use it to open the editor.
4. In R2 > Manage API Tokens, create an **Object Read & Write** token restricted
   to this bucket. Save its **Access Key ID** and **Secret Access Key**. The latter
   is shown only once. Do not use an account-wide administrator token.

Share only these non-secret settings to finish configuring the repository:

- Cloudflare account ID
- Bucket name
- Public image base URL
- Access Key ID (identifier, not the Secret Access Key)
- Jurisdiction: default or EU (the pinned CMS also supports FedRAMP)

Do not paste the Secret Access Key or token value into chat or commit either.
After activation, enter the Secret Access Key directly into the editor under
Settings > Media > Cloud Storage > Cloudflare R2. The CMS keeps it in your browser;
each editing device needs its own setup.

## Repository activation

Replace `null` in `login/r2-config.js` with the actual public metadata:

```js
window.PHOTO_R2_CONFIG = {
  account_id: "YOUR_ACCOUNT_ID",
  bucket: "personalwebsite-photos",
  access_key_id: "YOUR_ACCESS_KEY_ID",
  jurisdiction: "default",
  public_url: "https://photos.abdoulazizamadou.com",
  prefix: "assets/photos/",
  force_path_style: true
};
```

The editor will then offer **Upload or choose R2 photos**, including multiple
selection. Uploads go to the external library; only URLs, captions and section
metadata are committed to GitHub. The GitHub media library is disabled for new
uploads once R2 is active. R2 uploads happen before saving the section, so an
abandoned draft can leave an unused file in the bucket.

## Migrate existing photos without broken links

1. Copy every existing file under `assets/photos/` (except `.gitkeep`) to R2 with
   the same complete key, for example `assets/photos/img_2241.jpeg`.
2. Verify file sizes and SHA-256 checksums against the originals and check that
   each public URL returns the original image without authentication.
3. Replace only the corresponding image values in `_photo_sections/*.md` with
   the public R2 URLs. Preserve section filenames, titles, order and captions.
4. Activate R2, enter the secret in Settings, and test upload, select, save and
   reopen with a temporary image. Verify the public gallery after deployment.
5. Remove the GitHub copies only after R2 files and deployed URLs are verified.
   Keep the originals backed up. Removing files does not remove Git history.

## Remove photos and uploaded files

- **Remove from section** removes a photo from that gallery after Save.
- **Remove all photos from section** clears the gallery after confirmation and
  Save. An empty section is hidden from the public photography index.
- **Manage / delete uploaded assets** opens the built-in asset library in a
  separate tab. Select one or more unused files, choose Delete and confirm.
  With R2 active, select the Cloudflare R2 location. DELETE is included in the
  CORS policy above.
- File deletion does not automatically remove references in other galleries.
  Remove the photo from every section and save those changes before deleting
  the underlying asset. Public CDN/browser caches may retain an already served
  image temporarily even after the storage object is deleted.

References: [R2 credentials](https://developers.cloudflare.com/r2/api/tokens/),
[CORS](https://developers.cloudflare.com/r2/buckets/cors/),
[public image domains](https://developers.cloudflare.com/r2/buckets/public-buckets/).
