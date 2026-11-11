#!/usr/bin/env python3
"""粗查「给未声明的变量赋值」——严格模式下这会直接 ReferenceError(本项目的 handGeo 事故)。
原理:收集 var/let/const/function/参数/内置名,再找裸标识符赋值。
只在顶层/函数体内生效,忽略 obj.prop=、解构、比较运算。
"""
import re, sys

src = open(sys.argv[1] if len(sys.argv) > 1 else 'game.js', encoding='utf-8').read()
# 去注释与字符串(粗糙但够用)
code = re.sub(r'/\*.*?\*/', ' ', src, flags=re.S)
code = re.sub(r'//[^\n]*', ' ', code)
code = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`', '""', code)

declared = set()
for m in re.finditer(r'\b(?:var|let|const)\s+([^;]+)', code):
    for part in m.group(1).split(','):
        name = part.strip().split('=')[0].strip()
        if re.fullmatch(r'[A-Za-z_$][\w$]*', name):
            declared.add(name)
for m in re.finditer(r'\bfunction\s+([A-Za-z_$][\w$]*)', code):
    declared.add(m.group(1))
for m in re.finditer(r'\bfunction\s*[\w$]*\s*\(([^)]*)\)', code):
    for p in m.group(1).split(','):
        p = p.strip()
        if re.fullmatch(r'[A-Za-z_$][\w$]*', p):
            declared.add(p)
for m in re.finditer(r'(?:catch|for)\s*\(([^)]*)\)', code):
    for p in re.split(r'[;,=]', m.group(1)):
        p = p.strip().split(' of ')[0].strip()
        if re.fullmatch(r'[A-Za-z_$][\w$]*', p):
            declared.add(p)
BUILTIN = set('''window document console Math JSON Date localStorage performance navigator
location history setTimeout clearTimeout setInterval clearInterval requestAnimationFrame
cancelAnimationFrame fetch Image Blob URL FileReader AudioContext webkitAudioContext
innerWidth innerHeight devicePixelRatio alert prompt confirm undefined null true false
NaN Infinity isNaN isFinite parseInt parseFloat String Number Boolean Array Object
Error TypeError ReferenceError Promise Map Set WeakMap Symbol RegExp Function self top
parent frames globalThis THREE event e'''.split())

bad = []
# 只查"语句级"赋值(行首或 ; { } 之后),避免误报正则字面量/对象属性里的 xxx=
for m in re.finditer(r'(?:^|[;{}\n])\s*([A-Za-z_$][\w$]*)\s*=(?![=>])', code, re.M):
    name = m.group(1)
    if name in declared or name in BUILTIN:
        continue
    # 排除 for(...; x=..) 之类已由上面的 for 捕获;此处直接报
    line = code[:m.start()].count('\n') + 1
    bad.append((line, name))

if bad:
    print('❌ 发现未声明就赋值的变量(严格模式会崩):')
    for line, name in bad[:20]:
        print(f'   game.js:{line}  {name} = ...')
    sys.exit(1)
print('✅ 未声明赋值检查通过')
