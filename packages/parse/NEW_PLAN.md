Broken parsing — pfm

# atx_headers

- [x]  #79 - # on newlines count as heading content
- [x]  #72 - # on previous line breaks h5
- [x] #66 — no inline parsing

# autolinks


- [ ]  #604 - no scheme, no autolink
- [ ] #605, #606, #609, #610 - should render text, renders nothing
- [x]  #594…#601, #603 - href not captured

# blockquotes

- [ ] reimplement, no lazy continuation

# code spans

- [ ] #332 - “a” is added twice?
- [ ] #338 - escape not working
- [ ] #343, #345, #346 - correct but gets extra “`” at end
- [ ] #344 - should be an html element
- [ ] #347 - no matching sequence, text
- [ ] #348 - correct but gets extra backtick at the start
- [ ] #349 - bar should be code, matchong backtick rule.

# emphasis

- [ ] #353 - should be text, doesn’t  wrap non whitespace
- [ ] #413, #414 - incorrect revocations (close events seem to be emitted)
- [ ] #419, #433  - wrong but a link issue
- [ ] #436 - “*” should be wrapped in emphasis, not empty emphasis + text
- [x] #430 is valid emphasis i think
- [x] #421, #435 - no empty emphasis, should be text

NOTE: checked up to 439!  

# fenced code blocks

- [ ] #128 - wrong but blockquote issue
- [ ] #132…#137 - leading whitespace on closer, trim? renderer issue?

# hard line breaks

- [ ] #642 - html issue but should render

# link refs

general q — case sensitive or not?

- [ ] #194 - escape characters present
- [ ] #195 - should we url encode?
- [ ] #201 - correct but text is missing
- [ ] #202 - dont’ know?
- [ ] #208 - unused link ref is still a ref
- [ ] #210 - should be `”title” ok`
- [x] #218 - should we support this?
- [x] #214 - links in headings are ok

# links

- [ ] #491 - whole thing should be text, some is missing
- [ ] #493 - wrong but i don’t understand

NOTE: checked up to 514!  # lists

i don’t think loose/ tight are working eg (#256)

#259 is possible both a blockquote issue and the above

# thematic breaks 
- [x] #60 should split the list and render hr 
