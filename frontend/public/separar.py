import re, os

base = r"C:\Users\Daniel\Desktop\Preicam\mi-proyecto\frontend\public"

for fname in ['index.html','dashboard.html','dashboard-admin.html','modulos.html']:
    p = os.path.join(base, fname)
    if not os.path.exists(p):
        print('skip', fname)
        continue
    with open(p, encoding='utf-8', errors='ignore') as f:
        c = f.read()
    name = fname.replace('.html','')
    changed = False
    m = re.search(r'<style[\s\S]*?</style>', c, re.IGNORECASE)
    if m:
        css = m.group()
        css_clean = css
        css_clean = re.sub(r'</?style[^>]*>', '', css_clean, flags=re.IGNORECASE)
        with open(os.path.join(base, name+'.css'), 'w', encoding='utf-8') as f2:
            f2.write(css_clean)
        c = c.replace(m.group(), '<link rel="stylesheet" href="%s.css">' % name)
        changed = True
    m2 = re.search(r'<script[\s\S]*?</script>', c, re.IGNORECASE)
    if m2:
        script_tag = m2.group()
        if 'src=' in script_tag.lower():
            # ya tiene src, skip
            pass
        else:
            js_clean = script_tag
            js_clean = re.sub(r'</?script[^>]*>', '', js_clean, flags=re.IGNORECASE)
            with open(os.path.join(base, name+'.js'), 'w', encoding='utf-8') as f3:
                f3.write(js_clean)
            c = c.replace(script_tag, '<script src="%s.js"></script>' % name)
            changed = True
    if changed:
        with open(p, 'w', encoding='utf-8') as f4:
            f4.write(c)
        print('updated', fname)
    else:
        print('no-inline', fname)
