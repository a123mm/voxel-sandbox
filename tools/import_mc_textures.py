#!/usr/bin/env python3
"""把 Minecraft 资源包(或任意按 MC 命名的贴图文件夹)导入到 tex/local/ —— 仅本机使用。

用法:
    python3 tools/import_mc_textures.py <资源包.zip | 贴图文件夹>
    python3 tools/import_mc_textures.py <...> --tint     # 给树叶/草边加生物群系染色(推荐)

说明:
- 只复制/合成图片,不联网、不含任何素材;输出目录 tex/local/ 已被 .gitignore 忽略
- 支持 MC 1.13+ 命名(oak_log、grass_block_side…)与旧的 default_* 命名
- 现代 MC 的树叶/草边是灰度图、靠运行时代码染色,直接拿来会发灰;--tint 会按原版配色补上
"""
import sys, os, json, zipfile, io, shutil

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tex', 'local')

# 我们的语义名 -> MC 候选文件名(按优先级)
CANDIDATES = {
    'grass_top':   ['grass_block_top.png', 'grass_top.png', 'grass.png'],
    'grass_side':  ['grass_block_side.png', 'grass_side.png'],
    'dirt':        ['dirt.png'],
    'stone':       ['stone.png'],
    'sand':        ['sand.png'],
    'tree_side':   ['oak_log.png', 'log.png', 'tree.png'],
    'tree_top':    ['oak_log_top.png', 'log_top.png', 'tree_top.png'],
    'leaves':      ['oak_leaves.png', 'leaves.png'],
    'planks':      ['oak_planks.png', 'planks.png', 'wood.png'],
    'cobble':      ['cobblestone.png', 'cobble.png'],
    'brick':       ['bricks.png', 'brick.png'],
    'glass':       ['glass.png'],
    'wool':        ['white_wool.png', 'wool.png'],
    'coal_ore':    ['coal_ore.png', 'stone_with_coal.png'],
    'iron_ore':    ['iron_ore.png', 'stone_with_iron.png'],
    'workbench':   ['crafting_table_top.png', 'workbench.png'],
}
# 现代 MC 靠运行时代码染色的贴图 -> 用原版配色乘上去
TINT = {
    'leaves':    (0x59, 0xAE, 0x30),   # 原版平原树叶染色
    'grass_top': (0x79, 0xC0, 0x5A),
    'grass_side': None,                # 草边只染上半部分,单独处理
}

def load_images(src):
    """返回 {文件名: PIL.Image}"""
    from PIL import Image
    out = {}
    if zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as z:
            for n in z.namelist():
                if not n.lower().endswith('.png'):
                    continue
                if '/textures/block/' in n or '/assets/minecraft/' in n or '/' not in n:
                    try:
                        out[os.path.basename(n)] = Image.open(io.BytesIO(z.read(n))).convert('RGBA')
                    except Exception:
                        pass
    else:
        for root, _, files in os.walk(src):
            for f in files:
                if f.lower().endswith('.png'):
                    try:
                        out[f] = Image.open(os.path.join(root, f)).convert('RGBA')
                    except Exception:
                        pass
    return out

def tint(img, rgb):
    from PIL import Image
    r, g, b = rgb
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            R, G, B, A = px[x, y]
            if A == 0:
                continue
            px[x, y] = (R * r // 255, G * g // 255, B * b // 255, A)
    return img

def tint_grass_side(img, rgb):
    """只染上半部分的草(按亮度判断:接近灰绿/灰白的高亮像素),下半部分保持泥土色。"""
    r, g, b = rgb
    px = img.load()
    h = img.height
    for y in range(h):
        # 草边大致占顶部 1/4~1/3,越往下越矮
        limit = max(2, int(h * (0.32 if y < h * 0.5 else 0.22)))
        if y >= limit:
            continue
        for x in range(img.width):
            R, G, B, A = px[x, y]
            if A == 0 or (R > 90 and G > 90 and B > 90 and abs(R - B) < 40):
                px[x, y] = (R * r // 255, G * g // 255, B * b // 255, A)
    return img

def main():
    from PIL import Image
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    src = sys.argv[1]
    do_tint = '--tint' in sys.argv
    if not os.path.exists(src):
        print('找不到:', src); sys.exit(1)

    imgs = load_images(src)
    print(f'扫描到 {len(imgs)} 张 png')

    wanted = {}
    for name, cands in CANDIDATES.items():
        for c in cands:
            if c in imgs:
                wanted[name] = (c, imgs[c]); break

    missing = [n for n in CANDIDATES if n not in wanted]
    if not wanted:
        print('❌ 一个都没匹配上,确认这是 MC 资源包(需要 assets/minecraft/textures/block/*.png)')
        sys.exit(1)

    os.makedirs(OUT, exist_ok=True)
    tiles = {}
    for name, (fname, img) in wanted.items():
        if do_tint:
            if TINT.get(name):
                img = tint(img, TINT[name])
            elif name == 'grass_side':
                img = tint_grass_side(img, TINT['grass_top'])
        out_name = name + '.png'
        img.save(os.path.join(OUT, out_name))
        tiles[name] = out_name

    manifest = {
        'name': os.path.basename(src.rstrip('/')),
        'note': '由 tools/import_mc_textures.py 生成;tex/local/ 已被 .gitignore 忽略,请勿提交或部署',
        'tiles': tiles,
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f'✅ 已写入 {len(tiles)} 个方块到 tex/local/')
    if missing:
        print('   没找到(会沿用当前主题):', ', '.join(missing))
    print('   刷新页面即可生效')

if __name__ == '__main__':
    main()
