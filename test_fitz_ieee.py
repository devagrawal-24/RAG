import fitz

doc = fitz.open()
doc.insert_page(0, width=595.3, height=841.9)
page = doc[0]

# Title banner across full width
title_html = """
<div style="text-align: center; font-family: 'Times New Roman', serif;">
  <h1 style="font-size: 14pt; margin: 0 0 6pt 0; font-weight: bold; line-height: 1.2;">
    A Systematic Review and Taxonomy of Digital and Emerging Domain Forensics: Methodological Foundations and Open Challenges
  </h1>
  <p style="font-size: 9pt; margin: 0 0 2pt 0; font-weight: 500;">Academic Research Group</p>
  <p style="font-size: 8pt; margin: 0 0 8pt 0; color: #444;"><i>Department of Computer Science and Digital Forensics, Research Division</i><br/>Email: research@domain.edu</p>
</div>
"""
page.insert_htmlbox(fitz.Rect(40, 36, 555, 140), title_html)

# Column 1
col1_html = """
<div style="font-family: 'Times New Roman', serif; font-size: 8.5pt; line-height: 1.25; text-align: justify;">
  <p style="margin: 0 0 8pt 0;"><b><i>Abstract</i>—As digital infrastructures evolve into complex cloud-native, virtual reality, and decentralized blockchain environments, traditional artifact-based digital forensics faces unprecedented scalability, structural, and procedural bottlenecks. This paper presents a comprehensive survey of modern forensics frameworks, integrating principles from classic documentation templates to multi-domain analysis.</b></p>
  <p style="margin: 0 0 8pt 0;"><b><i>Keywords</i>—Digital Forensics, Cloud Forensics, Network Forensics, Blockchain Analysis, Survey.</b></p>
  <h2 style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase; margin: 10pt 0 4pt 0; text-align: center;">I. Introduction &amp; Background Foundations</h2>
  <p style="margin: 0 0 6pt 0; text-indent: 14pt;">Digital forensics has traditionally relied on physical acquisition and static disk imaging, anchored by foundational documentation standards and structural conventions. However, the paradigm shift toward highly dynamic, decentralized, and virtual ecosystems has rendered static paradigms insufficient.</p>
</div>
"""
page.insert_htmlbox(fitz.Rect(40, 145, 290, 800), col1_html)

# Column 2
col2_html = """
<div style="font-family: 'Times New Roman', serif; font-size: 8.5pt; line-height: 1.25; text-align: justify;">
  <h2 style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase; margin: 0 0 4pt 0; text-align: center;">II. Taxonomy &amp; Categorization</h2>
  <p style="margin: 0 0 6pt 0; text-indent: 14pt;">To systematically analyze existing literature, we propose a multi-tier operational taxonomy that categorizes forensic frameworks based on their target architecture, acquisition layer, and analytical processing methodology.</p>
</div>
"""
page.insert_htmlbox(fitz.Rect(305, 145, 555, 800), col2_html)

doc.save('test_ieee.pdf')
pix = page.get_pixmap(dpi=150)
pix.save('test_ieee.png')
print(f"SUCCESS! Wrote test_ieee.pdf and test_ieee.png, size: {pix.width}x{pix.height}")
