# Connected-alpha woodland UI icons

Generated with the built-in ImageGen tool on 2026-11-03. Replaces the perspective icon atlas. Thirty sprites cover all current UI glyphs, including language, quality, help, close, arrows and gameplay guidance. Each icon uses a straight-on view and a shared woodland palette.

The original atlas is preserved at `art-source/ui-icons-atlas.png`. The previous fixed-grid crop clipped artwork crossing nominal cell boundaries, then carried those fragments into neighboring icons. This revision identifies 8-connected components from the entire alpha channel before assigning complete parts to an icon. Layout is used only to associate parts, never to crop pixels.

Core alpha threshold: 64; isolated components smaller than 40 core pixels are discarded. Connected parts retain their original antialiasing and translucent enclosed areas. Speaker waves (3 parts), pause bars (2), the sun and its rays (9) and other multi-part glyphs remain intact. Each complete icon is fitted within 224 × 224 and centered on a 256 × 256 transparent canvas. No image rotation is applied.

Rebuild with Python and Pillow:

```powershell
python scripts/extract_icons.py art-source/ui-icons-atlas.png public/art/icons-v3
```

The versioned URL avoids reusing cached grid-cropped files.

Final prompt:

Use case: stylized-concept. Asset type: complete production UI icon atlas for a woodland mobile adventure game. ONE transparent PNG atlas, exactly 6 columns by 5 rows, thirty equal square cells, 3072x2560 if possible. Each icon perfectly centered and upright within its cell, occupies 68% of cell width and height, generous clear padding. STRICT straight-on orthographic FRONT VIEW, flat bas relief illustration, NO perspective, NO tilt, NO diagonal rotation, NO skew. The upright vertical symmetry axes must be parallel to the image edges; round objects face directly at viewer and remain circular. Cozy hand-painted cartoon material, dark warm olive outlines, soft carved wood, antique brass borders, green enamel, ivory details. Refined, clean, consistent and readable at 24px, less intricate than inventory concept art. Actual transparent background, no tile backplates, no text, no letters or numerals, no captions or grid. Exact row order left to right: Row 1 circular golden leaf coin; upright red U shaped magnet open upward; upright leaf shield; symmetric green twin rocket booster pack; upright wooden hourglass; upright leather supply satchel. Row 2 symmetric trophy cup; circular brass settings gear; front-facing speaker with right-side sound arcs; front-facing same speaker with small X; two straight parallel pause bars; straight right pointing play triangle. Row 3 front-facing house; circular clockwise restart arrow; round compass with upright needle; single upright leaf crest; two overlapping speech bubbles with small globe meaning language; three stacked landscape cards meaning graphics quality. Row 4 straight X close mark; check mark; small straight downward chevron; straight horizontal right arrow; straight vertical upward jump arrow above sole; straight downward slide arrow beside bent boot. Row 5 circular information badge with small lowercase i symbol only; symmetric sun; upright locked padlock; vertical lightning bolt; circular stopwatch; shield with small sparkle protection symbol. Keep subjects fully isolated, none crossing cell boundaries. No accidental tilt to coin, trophy, speaker, hourglass or gear, no angled three quarter camera. No extra objects, no watermark.

Runtime sprites use WebP quality 85 with transparency at the same 256 × 256 resolution. The extraction command above writes WebP directly.


## Hunting bow, arrows and cluster bomb (2026-11-09)

The hunting bow and cluster bomb use artwork supplied by the user. The built-in ImageGen tool removed the ivory background, including enclosed gaps, with this prompt:

> Use case: background-extraction. Edit target: the provided inventory artwork. Remove ONLY the ivory/off-white background and make it genuinely transparent, including all enclosed holes and gaps inside the artwork. Keep the exact original object, silhouette, dark brown outline, colors, leaf emblems, proportions and painted details unchanged. No redesign, no extra object, no arrow added, no shadow, no glow, no checkerboard. Preserve all opaque artwork and smooth alpha edges. Same square framing.

The separate arrow ammunition icon was generated with built-in ImageGen: a single wooden hunting arrow with a silver arrowhead and cream feather fletching, diagonal silhouette, hand-painted adventure game style, isolated on true transparent background, no text or border.

Full transparent PNG sources are in `art-source/bow-transparent.png`, `art-source/cluster-bomb-transparent.png` and `art-source/arrow-ammo-transparent.png`. Runtime WebP files preserve alpha, use quality 85 and alpha quality 100, fit the complete silhouette within 224 × 224 and center it on a 256 × 256 transparent canvas. The supplied bow and bomb runtime files are 10,606 and 13,428 bytes respectively. They replace the earlier proposed generated designs.
