# 材质包目录

把材质包文件放在这里,并创建一个 `manifest.json`,游戏启动时会自动加载。

## 当前内置:Hand Painted Pack(CC0 1.0)

| 项 | 值 |
|---|---|
| 名称 | Hand Painted Pack by Drummyfish |
| 许可 | **CC0 1.0**(公有领域,免署名、可商用、可修改) |
| 来源 | https://content.minetest.net/packages/drummyfish/drummyfish/ |
| 原始尺寸 | 128×128 PNG |
| 文件 | `hand_painted/default_*.png`(原样提取,未修改) |
| 许可页 | `hand_painted/LICENSE.txt` |

映射到本游戏的语义贴图:

| 语义名 | 文件 | 说明 |
|---|---|---|
| grass_top | default_grass.png | |
| grass_side | default_grass_side.png | 透明叠加层,先铺 dirt 再叠 |
| dirt | default_dirt.png | |
| stone | default_stone.png | |
| sand | default_sand.png | |
| tree_side | default_tree.png | |
| tree_top | default_tree_top.png | |
| leaves | default_leaves.png | |
| planks | default_wood.png | |
| cobble | default_cobble.png | |
| brick | default_brick.png | |
| glass | default_glass.png | 带透明 |

包里没有的三个方块,用包自己的底图程序化合成(仍有 CC0 底图风格):

- `coal_ore` = default_stone + 程序化煤点
- `iron_ore` = default_stone + 程序化铁点
- `workbench` = default_wood + 程序化 3×3 网格与边框

启动页三个按钮切换:`圆润(原创)` / `手绘 CC0` / `经典 CC`,也可用
`index.html?theme=round|pack|classic` 直接进。

## manifest.json 格式

```json
{
  "name": "我的材质包",
  "author": "作者名",
  "license": "CC BY-SA 4.0",
  "tiles": {
    "grass_top": "grass_top.png",
    "grass_side": "grass_side.png",
    "dirt": "dirt.png",
    "stone": "stone.png",
    "sand": "sand.png",
    "tree_side": "tree_side.png",
    "tree_top": "tree_top.png",
    "leaves": "leaves.png",
    "planks": "planks.png",
    "cobble": "cobble.png",
    "workbench": "workbench.png",
    "brick": "brick.png",
    "glass": "glass.png",
    "coal_ore": "coal_ore.png",
    "iron_ore": "iron_ore.png"
  }
}
```

- 只写你想替换的方块即可,没写的沿用原创圆润材质
- `tile_px` 可写图片边长(128/64/32/16);不写时按主题默认值缩放
- 支持透明 PNG(玻璃、草侧用得到)

## 许可检查清单(重要)

| 可以用 | 不能用 |
|---|---|
| CC0(公有领域) | ❌ 从 Minecraft 提取或修改的贴图 |
| CC-BY(需署名) | ❌ Faithful / PureBDcraft 等原版衍生包 |
| CC-BY-SA(需署名 + 相同方式共享) | ❌ 来源不明的"整合包" |

推荐来源:
- **ContentDB**(content.minetest.net)—— 每个包都标了许可
- **OpenGameArt.org** —— 按 CC0 筛选
- **Kenney.nl** —— 全部 CC0
- **itch.io** —— 看每个包的 License 字段

放好后,在页面里刷新即可;启动时会提示"材质包:你的包名"。
