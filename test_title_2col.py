import fitz

story = fitz.Story(html='<p>' + 'word '*2000 + '</p>')
title_rect = fitz.Rect(40, 36, 555, 140)
col1_p0 = fitz.Rect(40, 150, 290, 800)
col2_p0 = fitz.Rect(305, 150, 555, 800)
col1_norm = fitz.Rect(40, 40, 290, 800)
col2_norm = fitz.Rect(305, 40, 555, 800)

def rectfn(n, filled):
    if n == 0:
        return (fitz.Rect(0, 0, 595.3, 841.9), col1_p0, None)
    elif n == 1:
        return (None, col2_p0, None)
    else:
        idx = n - 2
        mb = fitz.Rect(0, 0, 595.3, 841.9) if (idx % 2 == 0) else None
        col = col1_norm if (idx % 2 == 0) else col2_norm
        return (mb, col, None)

writer = fitz.DocumentWriter('test_title_2col.pdf')
story.write(writer, rectfn)
writer.close()

doc = fitz.open('test_title_2col.pdf')
page0 = doc[0]
page0.insert_htmlbox(title_rect, '<div style="text-align:center;font-family:serif;"><h1 style="font-size:16pt;margin:0;">A Systematic Review and Taxonomy</h1><p style="font-size:9pt;margin:4px 0;">Academic Research Group</p></div>')
doc.save('test_title_2col_final.pdf')

pix = page0.get_pixmap(dpi=150)
pix.save('test_title_2col_page0.png')
print('SUCCESS! Rendered page 0 with title banner + 2 column flow!')
