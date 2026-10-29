import os

base = r"C:\Users\Daniel\Desktop\Preicam\mi-proyecto\frontend\public"
html = os.path.join(base, 'dashboard.html')
css  = os.path.join(base, 'dashboard.css')

with open(css, encoding='utf-8', errors='ignore') as f:
    c = f.read()

with open(html, encoding='utf-8', errors='ignore') as f:
    h = f.read()

# quitar link
old = '<link rel="stylesheet" href="dashboard.css">'
if old in h:
    h = h.replace(old, '<style>\n' + c + '\n</style>')
else:
    # por si acaso
    import re
    h = re.sub(r'<link[^>]+dashboard\.css[^>]+>', '<style>\n' + c + '\n</style>', h)

with open(html, 'w', encoding='utf-8') as f:
    f.write(h)

print('done')
