# 森野疾行 · Wild Dash

使用 Babylon.js 9、TypeScript 和 Vite 制作的网页 H5 3D 跑酷游戏。所有场景与角色模型均由代码生成，不依赖在线模型、贴图或字体服务。

试玩地址：https://mrknowwind.github.io/paoku1/

## 基础玩法

- 三条跑道自动前进，随距离逐渐加速。
- 手机：左右滑动换道、上滑跳跃、下滑滑铲，游戏中没有虚拟方向按钮。
- 电脑：方向键或 WASD，空格跳跃，P / Esc 暂停。
- 木桩需要跳跃，横杆需要滑铲，大石块需要换道。
- 每枚金币加 50 分，每米距离加 2 分；碰撞后结算，可重新挑战。
- 默认简体中文；设置中可切换 English / 日本語 / 한국어，并调整音效及画质。
- 最佳纪录和设置保存在当前浏览器；切到后台自动暂停。

## 本地运行

需要 Node.js 24 或更新版本。

```sh
npm ci
npm run dev
```

打开终端输出的本地地址（默认 http://localhost:5173/paoku1/）。同一 Wi-Fi 下的手机可通过终端输出的局域网地址访问。

```sh
npm test       # 玩法及四语完整性测试
npm run build # TypeScript 检查与生产构建
npm run preview # 预览 dist 中的生产版本
```

## GitHub Pages 自动部署

`.github/workflows/deploy.yml` 在每次推送到 `main` 时自动运行：安装依赖 → 测试 → 构建 → 发布 GitHub Pages。也可在 Actions 页手动运行。

仓库 Settings → Pages → Source 使用 **GitHub Actions**。Vite 的 `base` 已设置为 `/paoku1/`，资源路径适配项目型 Pages 地址。更改仓库名称时需同步修改 `vite.config.ts` 的 `base`。

```sh
git add .
git commit -m "Update game"
git push origin main
```

## 代码位置

- `src/game.ts`：独立的跑酷规则、物理、碰撞、关卡生成。
- `src/scene.ts`：Babylon.js 场景、角色动画与特效。
- `src/main.ts`：界面、手势、键盘、音效和本地保存。
- `src/i18n.ts`：中英日韩文案。
- `src/style.css`：桌面及手机界面。

需要支持 WebGL 的现代浏览器。目前为无尽跑酷基础版本，尚未加入账号、联网排行榜或付费系统。
