# Time Deleted Game. v0.4.0

時間を消していく放置ゲーム（three.js の 3D）。
このゲームは Roblox の「時間を無駄にする」というゲームにインスパイアされています。

- 遊ぶ: https://kaikomziu.github.io/time-deleted-game/
- 操作（PC）: WASD で移動、マウスで視点、E で変換（Shift+E でまとめて）、Esc で一時停止
- 操作（スマホ）: 左下のスティックで移動、画面をなぞって視点、右下のボタンで変換、右上の II で一時停止
- セーブデータは 3 つ（SLOT 01〜03）に分けて保存できます
- しくみ: 1 秒に 1 ti。10 ti → 1 de。1 秒の ti × (1 + 持っている de)
- かるわかGAMES アカウントでログインすると、セーブがクラウドに保存されます（ゲームID `time-deleted-game`）

ファイルは `index.html`（タイトル・UI）と `game.js`（3D 本編）だけです。
