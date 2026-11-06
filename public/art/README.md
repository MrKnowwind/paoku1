# Woodland trail texture

`woodland-trail.jpg` is generated with the built-in ImageGen tool and compressed to JPEG quality 85 for the game (about 278 KB). The original generated image is preserved outside the repository. This texture is loaded locally through Vite's base URL, with no external image host.

Final prompt:

> Use case: stylized-concept, game-ready seamless texture. Create a seamless repeating square albedo texture for the sandy woodland running trail of a polished cozy 3D mobile runner game, soft storybook hand-painted art style. Orthographic straight-down surface only, fills entire image edge to edge. Warm muted ochre beige packed earth, subtle softly brushed granular sand, a scattering of tiny pale sandstone pebbles and sparse faded golden leaf fragments, very low contrast and large quiet areas for gameplay readability. Uniform diffuse ambient lighting, no directional shadows, no gradients, no horizon, no path boundaries, no grass borders, no objects casting shadows, no text, no logo, no border, no perspective, no UI. Edges must visually tile cleanly on all four sides. Output a single texture asset, landscape game art palette of sage forest and terracotta. 1024x1024.

## Woodland grass texture

`woodland-grass.jpg` is generated with the built-in ImageGen tool, then resized to 1024 × 1024 and encoded as JPEG quality 86 (about 479 kB) for the forest floor. Grass and moss use their own albedo instead of borrowing the tree foliage texture. Each tile covers 2.5 × 2.5 world units, uses mipmaps and anisotropic filtering, and scrolls with the track.

Final prompt:

> Create a seamless square tileable diffuse/albedo texture image to be used on the grassy forest floor on both sides of a running trail in a polished cozy 3D mobile runner game. Single game texture, orthographic straight down view, 1024x1024, surface fills the whole image. Hand-painted storybook woodland style, matching warm sandy ochre trail and muted sage and olive forest trees. Dense fine short meadow grass blades and soft moss growing across gently mottled dark sage-green soil, a few tiny dried straw blades and minute leaf fragments. Readable fine grass blade strokes visible at close range, organic variation at medium scale, no large isolated objects, no decorative flowers, no rocks, no recognizable repeating clusters, no bald circles, no perfect geometric shapes. Balanced muted natural greens, richer olive green than gray, subtle brown-green earth glimpses; avoid neon green. Uniform soft diffuse illumination, no sunlight hotspots, no baked directional shadows, no gradient, no perspective, no horizon. All four borders must seamlessly join opposite borders without seams, repeated tiles should blend evenly with no grid. No text, logos, watermarks, frame, UI, scenery, trees or character. Output a single production-ready full-bleed tileable ground texture.

## Web delivery

Runtime terrain textures use WebP quality 82 at the original resolution. Original JPEGs are preserved in `art-source/textures/` outside the deployed public directory. To regenerate, open each original with Pillow and save to `public/art/<stem>.webp` with `quality=82, method=6`.

## Terrain guide backgrounds

`guide-ocean.webp` and `guide-snow.webp` were made with the built-in ImageGen tool, resized to 1080 × 720, and encoded as WebP quality 82. The game loads each background on demand behind its own static 3D tutorial models and diagrams.

- Ocean brief. A static stylized 3D underwater basin with a petrol-blue open center, soft sunbeams, and sculpted rocks, kelp, and coral framing the edges.
- Snow brief. A static snowy clearing with a steel-blue open center, distant glacial ridgelines, and snow-covered pines and rocks framing the edges.
