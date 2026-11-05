# Time Deleted Game. v0.5.0

時間を消していく放置ゲーム（three.js の 3D）。
このゲームは Roblox の「時間を無駄にする」というゲームにインスパイアされています。

- 遊ぶ: https://kaikomziu.github.io/time-deleted-game/
- 操作（PC）: WASD で移動、Shift で走る、マウスで視点、E で変換（Shift+E でまとめて）、F で装置のパネル、Esc で一時停止
- 操作（スマホ）: 左下のスティックで移動、「走る」ボタンで走る、画面をなぞって視点、右下のボタンで変換、右上の II で一時停止
- セーブデータは 3 つ（SLOT 01〜03）に分けて保存できます
- しくみ: 1 秒に 1 ti。10 ti → 1 de。1 秒の ti × (1 + 持っている de)
- 100,000 ti → 1 ai。ai で変換装置1を強化（最大 Lv5、強化すると de は 0 に。Lv5 で 90 ti → 10 de）
- かるわかGAMES アカウントでログインすると、セーブがクラウドに保存されます（ゲームID `time-deleted-game`）

ファイルは `index.html`（タイトル・UI）と `game.js`（3D 本編）だけです。
