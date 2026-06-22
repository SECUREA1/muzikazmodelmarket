# MUZIKAZ GitHub Website

A full static website package for the MUZIKAZ merch / mascot brand.

## What is included

- Home page
- Merch shop page
- Individual product pages for:
  - MUZIKAZ Hoodie
  - MUZIKAZ Cap
  - MUZIKAZ Bottle
  - MUZIKAZ Keychain
  - MUZIKAZ Wristband
  - MUZIKAZ Lanyard
- Collections page
- Individual collection pages
- Crew / character trait page
- Asset pack gallery page
- Local cart counter using browser localStorage
- Responsive mobile navigation
- GitHub Pages ready static files
- Render static site ready setup

## Folder structure

```txt
muzikaz_github_website/
  index.html
  merch.html
  collections.html
  crew.html
  assets.html
  products/
    hoodie.html
    cap.html
    bottle.html
    keychain.html
    wristband.html
    lanyard.html
  collections/
    originals.html
    legends.html
    beasts.html
    crew.html
    chaos.html
  assets/
    brand/
    characters/
    products/
    product-pages/
    collections/
    banners/
    backgrounds/
    ui/
    source/
  css/
    styles.css
  js/
    data.js
    main.js
```

## Upload to GitHub Pages

1. Create a new GitHub repository.
2. Upload everything inside this folder into the repo root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/root`.
6. Save.

Your site will publish as a GitHub Pages static website.

## Deploy to Render

Use these settings:

```txt
Service Type: Static Site
Build Command: leave blank
Publish Directory: .
```

## Editing products

Product data is stored in:

```txt
js/data.js
```

Change names, prices, features, images, sizes, and colors there.

## Connecting checkout later

The Add to Cart buttons currently use browser localStorage. To connect real payments, replace the button actions with Stripe Payment Links, Shopify Buy Buttons, or a backend checkout API.
