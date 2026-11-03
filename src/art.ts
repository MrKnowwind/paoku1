export const artIcons = new Set([
  "coin",
  "magnet",
  "shield",
  "rocket",
  "hourglass",
  "shop",
  "trophy",
  "settings",
  "sound",
  "mute",
  "pause",
  "play",
  "home",
  "restart",
  "compass",
  "leaf",
]);

export const iconAsset = (name: string) =>
  `${import.meta.env.BASE_URL}art/icons/${name}.png`;
