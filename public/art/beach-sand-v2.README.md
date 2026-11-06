# 专用沙滩贴图 v2

- 工具：内置 ImageGen，2026-11-03生成，非CLI。
- 源文件：`art-source/textures/beach-sand-v2.png`，保留原始输出。
- 用途：海岸、海床及两端地面材质混合。固定世界尺度每3米一片，坡面按弧长展开，镜像平铺处理边缘接缝。
- 原始生成图保留在 Codex generated_images 目录；项目仅引用本地 public/art 副本，保留 `/paoku1/` 基础路径。

## 最终提示词

Create one seamless tileable square albedo texture for the sandy beach and seabed of a polished stylized 3D adventure runner game. Strict straight-down orthographic flat material swatch, full bleed, no perspective, no horizon, no objects, no borders, no text, no shadows or directional lighting baked in. Warm pale natural beige fine-grained sand, subtle irregular small wind/water ripples flowing in varied directions, microscopic mineral grains, extremely sparse tiny cream shell fragments. Attractive painterly physically plausible game texture, organic fine detail readable at world scale, subtle tonal variation, no long strong parallel stripes or large isolated features, no yellow solid areas. Opposite edges should seamlessly tile in both directions; uniform feature density over the entire image. This is a production diffuse/albedo texture, not a scene illustration.


## 加载优化

运行时使用 1024 × 1024、质量 79 的 `beach-sand-v2.webp`，大小为 166,550 字节。原始 PNG 存放在部署目录外。海岸纹理在接近海岸时加载。
